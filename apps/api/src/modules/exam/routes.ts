import { CreateExamInput, ExamResponseInput } from "@ritmo/contracts";
import type { ModuleRoutes } from "../../platform/http.ts";
import { requireActor, tenantOf, type Actor } from "../identity/index.ts";
import { createExam, examResult, finishSitting, listExams, saveResponse, sittingView, startSitting } from "./service.ts";

const student = (actor: Actor) => ({ id: actor.id, schoolId: actor.schoolId! });

export const examRoutes: ModuleRoutes = (app, { db, now }) => {
  app.post("/api/exams", async (request) => {
    const actor = requireActor(request, "teacher", "coordinator");
    const input = CreateExamInput.parse(request.body);
    return db.tenant(tenantOf(actor), (tx) => createExam(tx, { ...input, schoolId: actor.schoolId!, teacherId: actor.id }, now()));
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
