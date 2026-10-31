import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AccommodationInput, CreateSchool, ImportRoster, UpdateOnboardingInput } from "@ritmo/contracts";
import { HttpError, type ModuleRoutes } from "../../platform/http.ts";
import { audit, requireActor, type Actor } from "../identity/index.ts";
import { commitRoster, onboardingState, parseRoster, releaseSchool, updateOnboarding } from "./service.ts";

const MAX_LOGO_BYTES = 512 * 1024;
const LogoInput = z.object({ pngBase64: z.string().max(Math.ceil((MAX_LOGO_BYTES * 4) / 3) + 8) });

/** Direção cuida da própria escola; a rede pode implantar qualquer uma. */
function canManage(actor: Actor, schoolId: string): void {
  if (actor.role === "network_admin") return;
  if (actor.role === "coordinator" && actor.schoolId === schoolId) return;
  throw new HttpError(403, "forbidden", "Seu perfil não pode implantar esta escola.");
}

const slugify = (name: string) => name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

export const onboardingRoutes: ModuleRoutes = (app, { db, now }) => {
  app.post("/api/schools", async (request) => {
    requireActor(request, "network_admin");
    const input = CreateSchool.parse(request.body);
    const id = randomUUID();
    await db.network((tx) => tx.query(`INSERT INTO schools (id, name, city, grades, slug) VALUES ($1,$2,$3,$4,$5)`, [id, input.name, input.city, input.grades, `${slugify(input.name)}-${id.slice(0, 4)}`]));
    return { id };
  });

  app.get<{ Params: { id: string } }>("/api/onboarding/:id", async (request) => {
    canManage(requireActor(request), request.params.id);
    return db.tenant({ schoolId: request.params.id }, (tx) => onboardingState(tx, request.params.id));
  });

  app.patch<{ Params: { id: string } }>("/api/onboarding/:id", async (request) => {
    const actor = requireActor(request);
    const schoolId = request.params.id;
    canManage(actor, schoolId);
    const input = UpdateOnboardingInput.parse(request.body);
    return db.tenant({ schoolId }, async (tx) => {
      await updateOnboarding(tx, schoolId, input);
      await audit(tx, actor, schoolId, "onboarding.update");
      return onboardingState(tx, schoolId);
    });
  });

  app.put<{ Params: { id: string } }>("/api/onboarding/:id/logo", async (request) => {
    const schoolId = request.params.id;
    canManage(requireActor(request), schoolId);
    const data = Buffer.from(LogoInput.parse(request.body).pngBase64, "base64");
    if (data.subarray(1, 4).toString() !== "PNG") throw new HttpError(422, "bad_logo", "Envie o logotipo em PNG.");
    await db.tenant({ schoolId }, (tx) => tx.query(`UPDATE schools SET logo_png = $2 WHERE id = $1`, [schoolId, data]));
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/api/onboarding/:id/roster/preview", async (request) => {
    canManage(requireActor(request), request.params.id);
    return parseRoster(ImportRoster.parse(request.body).csv).preview;
  });

  app.post<{ Params: { id: string } }>("/api/onboarding/:id/roster", async (request) => {
    const actor = requireActor(request);
    const schoolId = request.params.id;
    canManage(actor, schoolId);
    const { filename, csv } = ImportRoster.parse(request.body);
    return db.tenant({ schoolId }, async (tx) => {
      const result = await commitRoster(tx, schoolId, filename, csv);
      await audit(tx, actor, schoolId, "roster.import", filename);
      return result;
    });
  });

  app.post<{ Params: { id: string } }>("/api/onboarding/:id/accommodations", async (request) => {
    const actor = requireActor(request);
    const schoolId = request.params.id;
    canManage(actor, schoolId);
    const a = AccommodationInput.parse(request.body);
    return db.tenant({ schoolId }, async (tx) => {
      await tx.query(
        `INSERT INTO accommodations (school_id, student_id, kind, extra_minutes, resources) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (student_id) DO UPDATE SET kind = excluded.kind, extra_minutes = excluded.extra_minutes, resources = excluded.resources`,
        [schoolId, a.studentId, a.kind, a.extraMinutes, a.resources],
      );
      await audit(tx, actor, schoolId, "accommodation.save", a.studentId);
      return onboardingState(tx, schoolId);
    });
  });

  app.post<{ Params: { id: string } }>("/api/onboarding/:id/release", async (request) => {
    const actor = requireActor(request);
    const schoolId = request.params.id;
    canManage(actor, schoolId);
    return db.tenant({ schoolId }, async (tx) => {
      await releaseSchool(tx, schoolId, now());
      await audit(tx, actor, schoolId, "school.release");
      return onboardingState(tx, schoolId);
    });
  });
};
