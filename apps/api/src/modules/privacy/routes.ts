import { DeletionRequestInput, ResolveDeletionInput, type DeletionRequestView } from "@ritmo/contracts";
import { HttpError, type ModuleRoutes } from "../../platform/http.ts";
import type { Tx } from "../../platform/db.ts";
import { audit, requireActor, tenantOf, type Actor } from "../identity/index.ts";
import { anonymizeStudent, studentDataCopy } from "./service.ts";

/** O aluno responde por si; o responsável, só pelos alunos vinculados a ele. */
async function subjectOf(tx: Tx, actor: Actor, studentId: string | undefined): Promise<string> {
  if (actor.role === "student") return actor.id;
  if (!studentId) throw new HttpError(400, "student_required", "Informe o aluno.");
  const link = (await tx.query(`SELECT 1 FROM guardian_links WHERE guardian_id = $1 AND student_id = $2`, [actor.id, studentId]))[0];
  if (!link) throw new HttpError(403, "forbidden", "Este aluno não está vinculado à sua conta.");
  return studentId;
}

export const privacyRoutes: ModuleRoutes = (app, { db, now }) => {
  app.get<{ Querystring: { studentId?: string } }>("/api/privacy/my-data", async (request) => {
    const actor = requireActor(request, "student", "guardian");
    return db.tenant(tenantOf(actor), async (tx) => {
      const studentId = await subjectOf(tx, actor, request.query.studentId);
      await audit(tx, actor, actor.schoolId!, "privacy.copy", studentId);
      return studentDataCopy(tx, studentId);
    });
  });

  app.post("/api/privacy/deletion-requests", async (request) => {
    const actor = requireActor(request, "student", "guardian");
    const input = DeletionRequestInput.parse(request.body);
    return db.tenant(tenantOf(actor), async (tx) => {
      const studentId = await subjectOf(tx, actor, input.studentId);
      const open = await tx.query(`SELECT 1 FROM privacy_requests WHERE student_id = $1 AND status = 'open'`, [studentId]);
      if (open[0]) throw new HttpError(409, "already_open", "Já existe um pedido aberto para este aluno.");
      await tx.query(`INSERT INTO privacy_requests (school_id, student_id, requested_by) VALUES ($1,$2,$3)`, [actor.schoolId, studentId, actor.id]);
      await audit(tx, actor, actor.schoolId!, "privacy.deletion_requested", studentId);
      return { ok: true };
    });
  });

  // Pedidos que chegam à escola por fora (telefone, papel): a direção tira a cópia e registra a exclusão.
  const studentOfSchool = async (tx: Tx, studentId: string) => {
    const row = (await tx.query(`SELECT 1 FROM users WHERE id = $1 AND role = 'student' AND anonymized_at IS NULL`, [studentId]))[0];
    if (!row) throw new HttpError(404, "not_found", "Aluno não encontrado nesta escola.");
  };

  app.get<{ Params: { id: string } }>("/api/school/people/:id/data", async (request) => {
    const actor = requireActor(request, "coordinator");
    return db.tenant(tenantOf(actor), async (tx) => {
      await studentOfSchool(tx, request.params.id);
      await audit(tx, actor, actor.schoolId!, "privacy.copy", request.params.id);
      return studentDataCopy(tx, request.params.id);
    });
  });

  app.post<{ Params: { id: string } }>("/api/school/people/:id/deletion-request", async (request) => {
    const actor = requireActor(request, "coordinator");
    return db.tenant(tenantOf(actor), async (tx) => {
      await studentOfSchool(tx, request.params.id);
      const open = await tx.query(`SELECT 1 FROM privacy_requests WHERE student_id = $1 AND status = 'open'`, [request.params.id]);
      if (open[0]) throw new HttpError(409, "already_open", "Já existe um pedido aberto para este aluno.");
      await tx.query(`INSERT INTO privacy_requests (school_id, student_id, requested_by) VALUES ($1,$2,$3)`, [actor.schoolId, request.params.id, actor.id]);
      await audit(tx, actor, actor.schoolId!, "privacy.deletion_requested", request.params.id);
      return { ok: true };
    });
  });

  app.get("/api/school/deletion-requests", async (request): Promise<DeletionRequestView[]> => {
    const actor = requireActor(request, "coordinator");
    const rows = await db.tenant(tenantOf(actor), (tx) => tx.query(
      `SELECT r.id, r.created_at, s.name AS student, a.name AS requester
       FROM privacy_requests r JOIN users s ON s.id = r.student_id JOIN users a ON a.id = r.requested_by
       WHERE r.status = 'open' ORDER BY r.created_at`,
    ));
    return rows.map((r) => ({ id: r.id, student: r.student, requester: r.requester, createdAt: new Date(r.created_at).getTime() }));
  });

  app.post<{ Params: { id: string } }>("/api/school/deletion-requests/:id", async (request) => {
    const actor = requireActor(request, "coordinator");
    const { approved } = ResolveDeletionInput.parse(request.body);
    const schoolId = actor.schoolId!;
    const entry = await db.tenant({ schoolId }, async (tx) => (await tx.query(`SELECT student_id FROM privacy_requests WHERE id = $1 AND status = 'open'`, [request.params.id]))[0]);
    if (!entry) throw new HttpError(404, "not_found", "Pedido não encontrado.");
    await db.tenant({ schoolId }, async (tx) => {
      await tx.query(`UPDATE privacy_requests SET status = $2, resolved_by = $3, resolved_at = $4 WHERE id = $1`, [request.params.id, approved ? "done" : "refused", actor.id, new Date(now())]);
      await audit(tx, actor, schoolId, approved ? "privacy.deleted" : "privacy.deletion_refused", entry.student_id);
    });
    if (approved) await db.system((tx) => anonymizeStudent(tx, entry.student_id, schoolId, now()));
    return { ok: true };
  });
};
