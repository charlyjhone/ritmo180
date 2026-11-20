// Aulas rápidas: o aluno lê e vê as bases do assunto; a rede revisa as aulas propostas pela IA.
import { z } from "zod";
import type { LessonIndex, LessonSuggestionView, LessonView } from "@ritmo/contracts";
import type { ModuleRoutes } from "../../platform/http.ts";
import { requireActor, tenantOf } from "../identity/index.ts";
import { lessonQueue, reviewLesson } from "./generate.ts";
import { lessonIndex, lessonView } from "./service.ts";

const TopicQuery = z.object({ disciplina: z.string().min(1).max(60), assunto: z.string().min(1).max(160) });
const LessonReview = z.object({ discipline: z.string().min(1).max(60), topic: z.string().min(1).max(160), approved: z.boolean() });

export const lessonRoutes: ModuleRoutes = (app, { db, now }) => {
  app.get("/api/lessons", async (request): Promise<LessonIndex> => {
    const actor = requireActor(request, "student", "teacher", "coordinator");
    return db.tenant(tenantOf(actor), (tx) => lessonIndex(tx, actor.role === "student" ? actor.id : null, now()));
  });

  app.get("/api/lessons/topic", async (request): Promise<LessonView> => {
    const actor = requireActor(request, "student", "teacher", "coordinator");
    const { disciplina, assunto } = TopicQuery.parse(request.query);
    return db.tenant(tenantOf(actor), (tx) => lessonView(tx, actor.role === "student" ? actor.id : null, disciplina, assunto, now()));
  });

  app.get("/api/lessons/review", async (request): Promise<LessonSuggestionView[]> => {
    requireActor(request, "network_admin");
    return db.system(lessonQueue);
  });

  app.post("/api/lessons/review", async (request) => {
    const actor = requireActor(request, "network_admin");
    const { discipline, topic, approved } = LessonReview.parse(request.body);
    await db.system((tx) => reviewLesson(tx, { discipline, topic }, approved, actor.name, now()));
    return { ok: true };
  });
};
