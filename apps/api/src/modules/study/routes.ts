// Rotas das ferramentas de estudo: cartões, motivo do erro, meta de curso, calendário e aulas offline.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CardReviewInput, ClassRequestInput, CourseGoalInput, ItemReportInput, MilestoneInput, MissReasonInput, type LessonBundle } from "@ritmo/contracts";
import { HttpError, type ModuleRoutes } from "../../platform/http.ts";
import { requireActor, tenantOf } from "../identity/index.ts";
import { computeSnapshot, irtFor, loadAttempts } from "../practice/index.ts";
import { allMilestones, upcomingMilestones } from "./calendar.ts";
import { cardDeck, recordCardReviews } from "./cards.ts";
import { clearCourseGoal, courseGoal, saveCourseGoal } from "./goals.ts";
import { recordMissReason } from "./misses.ts";
import { setClassRequest } from "./class-requests.ts";
import { reportItem } from "./reports.ts";

const DeckQuery = z.object({ disciplina: z.string().min(1).max(60).optional(), assunto: z.string().min(1).max(160).optional() });

export const studyRoutes: ModuleRoutes = (app, { db, now }) => {
  app.post("/api/study/miss-reason", async (request) => {
    const actor = requireActor(request, "student");
    const input = MissReasonInput.parse(request.body);
    await db.tenant(tenantOf(actor), (tx) => recordMissReason(tx, { id: actor.id, schoolId: actor.schoolId! }, input, now()));
    return { ok: true };
  });

  app.post("/api/study/item-report", async (request) => {
    const actor = requireActor(request, "student");
    if (actor.guestUntil) throw new HttpError(403, "guest", "Visitantes não enviam relatos. Peça uma conta à sua escola.");
    const input = ItemReportInput.parse(request.body);
    return db.tenant(tenantOf(actor), (tx) => reportItem(tx, { id: actor.id, schoolId: actor.schoolId! }, input, now()));
  });

  app.post("/api/study/class-request", async (request) => {
    const actor = requireActor(request, "student");
    if (actor.guestUntil) throw new HttpError(403, "guest", "Visitantes não fazem pedidos ao professor. Peça uma conta à sua escola.");
    const input = ClassRequestInput.parse(request.body);
    return db.tenant(tenantOf(actor), (tx) => setClassRequest(tx, { id: actor.id, schoolId: actor.schoolId! }, input, now()));
  });

  app.get("/api/study/cards", async (request) => {
    const actor = requireActor(request, "student");
    const { disciplina, assunto } = DeckQuery.parse(request.query);
    return db.tenant(tenantOf(actor), async (tx) => {
      const attempts = await loadAttempts(tx, actor.id);
      const { mastery } = computeSnapshot(actor.id, attempts, await irtFor(tx, attempts), now());
      return cardDeck(tx, actor.id, now(), { discipline: disciplina, topic: assunto }, Object.fromEntries(Object.entries(mastery).map(([t, m]) => [t, m.mastery])));
    });
  });

  app.post("/api/study/cards", async (request) => {
    const actor = requireActor(request, "student");
    const { reviews } = CardReviewInput.parse(request.body);
    return db.tenant(tenantOf(actor), (tx) => recordCardReviews(tx, { id: actor.id, schoolId: actor.schoolId! }, reviews, now()));
  });

  app.get("/api/study/course-goal", async (request) => {
    const actor = requireActor(request, "student");
    return db.tenant(tenantOf(actor), (tx) => courseGoal(tx, actor.id, now()));
  });

  app.put("/api/study/course-goal", async (request) => {
    const actor = requireActor(request, "student");
    const goal = CourseGoalInput.parse(request.body);
    return db.tenant(tenantOf(actor), async (tx) => {
      await saveCourseGoal(tx, { id: actor.id, schoolId: actor.schoolId! }, goal);
      return courseGoal(tx, actor.id, now());
    });
  });

  app.delete("/api/study/course-goal", async (request) => {
    const actor = requireActor(request, "student");
    await db.tenant(tenantOf(actor), (tx) => clearCourseGoal(tx, actor.id));
    return { ok: true };
  });

  app.get("/api/study/calendar", async (request) => {
    const actor = requireActor(request, "student", "teacher", "coordinator", "network_admin");
    if (actor.role === "network_admin") return db.system(allMilestones);
    return db.tenant(tenantOf(actor), (tx) => upcomingMilestones(tx, now()));
  });

  app.post("/api/study/calendar", async (request) => {
    requireActor(request, "network_admin");
    const m = MilestoneInput.parse(request.body);
    if (m.endsOn && m.endsOn < m.startsOn) throw new HttpError(400, "bad_dates", "A data final vem antes da inicial.");
    const id = randomUUID();
    await db.system((tx) => tx.query(`INSERT INTO enem_milestones (id, title, starts_on, ends_on, note) VALUES ($1,$2,$3,$4,$5)`, [id, m.title, m.startsOn, m.endsOn ?? null, m.note]));
    return { id };
  });

  app.delete<{ Params: { id: string } }>("/api/study/calendar/:id", async (request) => {
    requireActor(request, "network_admin");
    const id = z.string().uuid().parse(request.params.id);
    const rows = await db.system((tx) => tx.query(`DELETE FROM enem_milestones WHERE id = $1 RETURNING id`, [id]));
    if (!rows.length) throw new HttpError(404, "not_found", "Data não encontrada.");
    return { ok: true };
  });

  app.get("/api/study/lessons-bundle", async (request): Promise<LessonBundle> => {
    const actor = requireActor(request, "student", "teacher", "coordinator");
    const rows = await db.tenant(tenantOf(actor), (tx) => tx.query(`SELECT discipline, topic, title, explanation_html, example_html, pitfalls_html FROM lessons WHERE status = 'published' ORDER BY discipline, topic`));
    return { lessons: rows.map((r) => ({ discipline: r.discipline, topic: r.topic, title: r.title, explanationHtml: r.explanation_html, exampleHtml: r.example_html, pitfallsHtml: r.pitfalls_html })) };
  });
};
