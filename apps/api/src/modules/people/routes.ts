// Pessoas da escola: a coordenação encontra uma conta, gera senha provisória e registra a autorização dos responsáveis.
import { ConsentInput, type Person } from "@ritmo/contracts";
import { HttpError, type ModuleRoutes } from "../../platform/http.ts";
import { audit, requireActor, resetPassword, tenantOf } from "../identity/index.ts";

const LIMIT = 50;

export const peopleRoutes: ModuleRoutes = (app, { db, now }) => {
  app.get<{ Querystring: { q?: string } }>("/api/school/people", async (request): Promise<Person[]> => {
    const actor = requireActor(request, "coordinator");
    const search = `%${(request.query.q ?? "").trim().toLowerCase()}%`;
    const rows = await db.tenant(tenantOf(actor), (tx) => tx.query(
      `SELECT u.id, u.name, u.email, u.role, c.name AS class_name, gc.consent_at
       FROM users u LEFT JOIN class_students cs ON cs.student_id = u.id LEFT JOIN classes c ON c.id = cs.class_id
       LEFT JOIN guardian_contacts gc ON gc.student_id = u.id
       WHERE u.deactivated_at IS NULL AND (lower(u.name) LIKE $1 OR lower(coalesce(u.email, '')) LIKE $1)
       ORDER BY u.name LIMIT ${LIMIT}`,
      [search],
    ));
    return rows.map((r) => ({ id: r.id, name: r.name, email: r.email, role: r.role, className: r.class_name, consentAt: r.consent_at ? new Date(r.consent_at).getTime() : null }));
  });

  // Sem autorização registrada o aluno não entra. Retirar a autorização bloqueia o acesso já na próxima tela.
  app.post<{ Params: { id: string } }>("/api/school/people/:id/consent", async (request) => {
    const actor = requireActor(request, "coordinator");
    const schoolId = actor.schoolId!;
    const { signed } = ConsentInput.parse(request.body);
    return db.tenant(tenantOf(actor), async (tx) => {
      const updated = await tx.query(
        `UPDATE guardian_contacts SET consent_at = $2 WHERE student_id = $1 RETURNING consent_at`,
        [request.params.id, signed ? new Date(now()) : null],
      );
      if (updated.length === 0) throw new HttpError(404, "not_found", "Aluno não encontrado nesta escola ou sem e-mail do responsável cadastrado.");
      await audit(tx, actor, schoolId, signed ? "consent.granted" : "consent.revoked", request.params.id);
      return { consentAt: signed ? now() : null };
    });
  });

  app.post<{ Params: { id: string } }>("/api/school/people/:id/reset-password", async (request) => {
    const actor = requireActor(request, "coordinator");
    const schoolId = actor.schoolId!;
    const person = await db.tenant(tenantOf(actor), async (tx) => (await tx.query(`SELECT id FROM users WHERE id = $1 AND deactivated_at IS NULL`, [request.params.id]))[0]);
    if (!person) throw new HttpError(404, "not_found", "Pessoa não encontrada nesta escola.");
    if (person.id === actor.id) throw new HttpError(422, "own_account", "Para trocar a sua senha, use a página Minha conta.");
    const temporary = await db.system((tx) => resetPassword(tx, person.id));
    await db.tenant({ schoolId }, (tx) => audit(tx, actor, schoolId, "user.password_reset", person.id));
    return { temporaryPassword: temporary };
  });
};
