// Pessoas da escola: a coordenação encontra uma conta e gera senha provisória para quem perdeu o acesso.
import type { Person } from "@ritmo/contracts";
import { HttpError, type ModuleRoutes } from "../../platform/http.ts";
import { audit, requireActor, resetPassword, tenantOf } from "../identity/index.ts";

const LIMIT = 50;

export const peopleRoutes: ModuleRoutes = (app, { db }) => {
  app.get<{ Querystring: { q?: string } }>("/api/school/people", async (request): Promise<Person[]> => {
    const actor = requireActor(request, "coordinator");
    const search = `%${(request.query.q ?? "").trim().toLowerCase()}%`;
    const rows = await db.tenant(tenantOf(actor), (tx) => tx.query(
      `SELECT u.id, u.name, u.email, u.role, c.name AS class_name
       FROM users u LEFT JOIN class_students cs ON cs.student_id = u.id LEFT JOIN classes c ON c.id = cs.class_id
       WHERE u.deactivated_at IS NULL AND (lower(u.name) LIKE $1 OR lower(coalesce(u.email, '')) LIKE $1)
       ORDER BY u.name LIMIT ${LIMIT}`,
      [search],
    ));
    return rows.map((r) => ({ id: r.id, name: r.name, email: r.email, role: r.role, className: r.class_name }));
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
