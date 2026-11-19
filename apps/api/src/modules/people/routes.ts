// Pessoas da escola: a coordenação cadastra, edita e desativa contas, gera senha provisória e registra a autorização dos responsáveis.
import { ActiveInput, ConsentInput, CreatePersonInput, ROLES, UpdatePersonInput, type CreatedPerson, type Person, type SchoolClass } from "@ritmo/contracts";
import { HttpError, type ModuleRoutes } from "../../platform/http.ts";
import { audit, requireActor, resetPassword, tenantOf } from "../identity/index.ts";
import { assertEmailFree, createPerson, listClasses, listPeople, setActive, updatePerson } from "./service.ts";

const LISTED_ROLES = new Set<string>(ROLES.filter((r) => r !== "network_admin"));

export const peopleRoutes: ModuleRoutes = (app, { db, now }) => {
  app.get<{ Querystring: { q?: string; perfil?: string; inativos?: string } }>("/api/school/people", async (request): Promise<Person[]> => {
    const actor = requireActor(request, "coordinator");
    const role = request.query.perfil && LISTED_ROLES.has(request.query.perfil) ? request.query.perfil : undefined;
    return db.tenant(tenantOf(actor), (tx) => listPeople(tx, { q: request.query.q, role, inactive: request.query.inativos === "sim" }));
  });

  app.get("/api/school/classes", async (request): Promise<SchoolClass[]> => {
    const actor = requireActor(request, "coordinator");
    return db.tenant(tenantOf(actor), listClasses);
  });

  app.post("/api/school/people", async (request): Promise<CreatedPerson> => {
    const actor = requireActor(request, "coordinator");
    const schoolId = actor.schoolId!;
    const input = CreatePersonInput.parse(request.body);
    await assertEmailFree(db, input.email);
    return db.tenant(tenantOf(actor), async (tx) => {
      const created = await createPerson(tx, schoolId, input);
      await audit(tx, actor, schoolId, `user.create.${input.role}`, created.id);
      return created;
    });
  });

  app.patch<{ Params: { id: string } }>("/api/school/people/:id", async (request) => {
    const actor = requireActor(request, "coordinator");
    const schoolId = actor.schoolId!;
    const input = UpdatePersonInput.parse(request.body);
    return db.tenant(tenantOf(actor), async (tx) => {
      await updatePerson(tx, schoolId, request.params.id, input);
      await audit(tx, actor, schoolId, "user.update", request.params.id);
      return { ok: true };
    });
  });

  app.post<{ Params: { id: string } }>("/api/school/people/:id/active", async (request) => {
    const actor = requireActor(request, "coordinator");
    const schoolId = actor.schoolId!;
    const { active } = ActiveInput.parse(request.body);
    if (request.params.id === actor.id) throw new HttpError(422, "own_account", "Você não pode desativar a sua própria conta.");
    return db.tenant(tenantOf(actor), async (tx) => {
      await setActive(tx, request.params.id, active, now());
      await audit(tx, actor, schoolId, active ? "user.reactivate" : "user.deactivate", request.params.id);
      return { active };
    });
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
