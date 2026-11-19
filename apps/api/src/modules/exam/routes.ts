import { CreateExamInput, CreateMyExamInput, ExamResponseInput } from "@ritmo/contracts";
import { HttpError, type ModuleRoutes } from "../../platform/http.ts";
import type { Tx } from "../../platform/db.ts";
import { requireActor, tenantOf, type Actor } from "../identity/index.ts";
import { classExamReports, createExam, createOwnExam, examResult, finishSitting, listExams, saveResponse, sittingView, startSitting } from "./service.ts";

const student = (actor: Actor) => ({ id: actor.id, schoolId: actor.schoolId! });

async function assertTeaches(tx: Tx, actor: Actor, classId: string): Promise<void> {
  if (actor.role === "coordinator") return;
  const assigned = await tx.query(`SELECT 1 FROM class_teachers WHERE class_id = $1 AND teacher_id = $2`, [classId, actor.id]);
  if (!assigned[0]) throw new HttpError(403, "forbidden", "Esta turma não está atribuída a você.");
}

export const examRoutes: ModuleRoutes = (app, { db, now }) => {
  app.post("/api/exams", async (request) => {
    const actor = requireActor(request, "teacher", "coordinator");
    const input = CreateExamInput.parse(request.body);
    return db.tenant(tenantOf(actor), async (tx) => {
      await assertTeaches(tx, actor, input.classId);
      return createExam(tx, { ...input, schoolId: actor.schoolId!, teacherId: actor.id }, now());
    });
  });

  app.get<{ Params: { id: string } }>("/api/teacher/classes/:id/exams", async (request) => {
    const actor = requireActor(request, "teacher", "coordinator");
    return db.tenant(tenantOf(actor), async (tx) => {
      await assertTeaches(tx, actor, request.params.id);
      return classExamReports(tx, request.params.id);
    });
  });

  app.post("/api/exams/mine", async (request) => {
    const actor = requireActor(request, "student");
    const input = CreateMyExamInput.parse(request.body);
    return db.tenant(tenantOf(actor), (tx) => createOwnExam(tx, student(actor), input, now()));
  });

  app.get("/api/exams", async (request) => {
    const actor = requireActor(request, "student");
    return db.tenant(tenantOf(actor), (tx) => listExams(tx, actor.id));
  });

  app.post<{ Params: { id: string } }>("/api/exams/:id/start", async (request) => {
    const actor = requireActor(request, "student");
    return { sittingId: await db.tenant(tenantOf(actor), (tx) => startSitting(tx, student(actor), request.params.id, now())) };
  });

  app.get<{ Params: { id: string } }>("/api/sittings/:id", async (request) => {
    const actor = requireActor(request, "student");
    return db.tenant(tenantOf(actor), (tx) => sittingView(tx, request.params.id, actor.id, now()));
  });

  app.put<{ Params: { id: string } }>("/api/sittings/:id/responses", async (request) => {
    const actor = requireActor(request, "student");
    const response = ExamResponseInput.parse(request.body);
    await db.tenant(tenantOf(actor), (tx) => saveResponse(tx, request.params.id, student(actor), response, now()));
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/api/sittings/:id/finish", async (request) => {
    const actor = requireActor(request, "student");
    return db.tenant(tenantOf(actor), async (tx) => {
      await finishSitting(tx, request.params.id, student(actor), now());
      return examResult(tx, request.params.id, actor.id);
    });
  });

  app.get<{ Params: { id: string } }>("/api/sittings/:id/result", async (request) => {
    const actor = requireActor(request, "student");
    return db.tenant(tenantOf(actor), (tx) => examResult(tx, request.params.id, actor.id));
  });
};
