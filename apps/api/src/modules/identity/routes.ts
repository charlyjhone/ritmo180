import { createHash, randomBytes } from "node:crypto";
import rateLimit from "@fastify/rate-limit";
import { ChangePasswordInput, LoginInput, type Me } from "@ritmo/contracts";
import { HttpError, type ModuleRoutes } from "../../platform/http.ts";
import type { Tx } from "../../platform/db.ts";
import { requireActor, type Actor } from "./actor.ts";
import { createGuest, removeExpiredGuests, removeGuest } from "./guest.ts";
import { hashPassword, verifyPassword } from "./passwords.ts";

const COOKIE = "ritmo_session";
const SESSION_DAYS = 14;
/** Uma turma inteira pode entrar ao mesmo tempo pela mesma rede da escola. */
const GUEST_ENTRIES_PER_MINUTE = 120;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

const ACTOR_SQL = `
  SELECT u.id, u.name, u.role, u.school_id, u.grade, u.must_change_password, u.guest_expires_at, s.released_at, gc.consent_at
  FROM sessions se
  JOIN users u ON u.id = se.user_id AND u.deactivated_at IS NULL AND (u.guest_expires_at IS NULL OR u.guest_expires_at > $2)
  LEFT JOIN schools s ON s.id = u.school_id
  LEFT JOIN guardian_contacts gc ON gc.student_id = u.id
  WHERE se.token_hash = $1 AND se.expires_at > $2`;

async function loadActor(tx: Tx, token: string, now: number): Promise<Actor | null> {
  const row = (await tx.query(ACTOR_SQL, [sha256(token), new Date(now)]))[0];
  if (!row) return null;
  let blocked: Actor["blocked"] = null;
  if (row.must_change_password) blocked = "password_change";
  else if (row.role === "student") {
    if (!row.released_at) blocked = "school_not_released";
    // O visitante não tem dado pessoal, então não há consentimento de responsável a colher.
    else if (!row.consent_at && !row.guest_expires_at) blocked = "consent_required";
  }
  const guestUntil = row.guest_expires_at ? new Date(row.guest_expires_at).getTime() : null;
  return { id: row.id, name: row.name, role: row.role, schoolId: row.school_id, grade: row.grade, blocked, guestUntil };
}

export const identityRoutes: ModuleRoutes = (app, { db, now, secureCookies, loginAttemptsPerMinute, guestAccess = false }) => {
  app.decorateRequest("actor", null);
  app.addHook("onRequest", async (request) => {
    const token = request.cookies[COOKIE];
    if (token && request.url.startsWith("/api/")) request.actor = await db.system((tx) => loadActor(tx, token, now()));
  });

  app.register(async (scope) => {
    await scope.register(rateLimit, { max: loginAttemptsPerMinute, timeWindow: "1 minute" });
    scope.post("/api/auth/login", async (request, reply) => {
      const { email, password } = LoginInput.parse(request.body);
      const user = await db.system(async (tx) => (await tx.query(`SELECT id, pass_hash, pass_salt FROM users WHERE lower(email) = lower($1) AND deactivated_at IS NULL`, [email]))[0]);
      const valid = user?.pass_hash && (await verifyPassword(password, user.pass_salt, user.pass_hash));
      if (!valid) throw new HttpError(401, "bad_credentials", "E-mail ou senha incorretos.");
      const token = randomBytes(32).toString("hex");
      const expires = new Date(now() + SESSION_DAYS * 86_400_000);
      await db.system((tx) => tx.query(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`, [sha256(token), user!.id, expires]));
      reply.setCookie(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: secureCookies, path: "/", expires });
      return { ok: true };
    });
  });

  app.register(async (scope) => {
    await scope.register(rateLimit, { max: GUEST_ENTRIES_PER_MINUTE, timeWindow: "1 minute" });
    scope.post("/api/auth/visitante", async (_request, reply) => {
      if (!guestAccess) throw new HttpError(404, "guest_disabled", "O acesso sem cadastro está desligado.");
      await removeExpiredGuests(db, now());
      const token = randomBytes(32).toString("hex");
      const { expires } = await db.system(async (tx) => {
        const guest = await createGuest(tx, now());
        await tx.query(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`, [sha256(token), guest.id, guest.expires]);
        return guest;
      });
      reply.setCookie(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: secureCookies, path: "/", expires });
      return { ok: true };
    });
  });

  app.get("/api/auth/opcoes", async () => ({ visitante: guestAccess }));

  // Não passa por requireActor: é justamente o que libera quem está bloqueado com senha provisória.
  app.post("/api/auth/password", async (request) => {
    const actor = request.actor;
    if (!actor) throw new HttpError(401, "unauthenticated", "Faça login para continuar.");
    const { current, next } = ChangePasswordInput.parse(request.body);
    const user = await db.system(async (tx) => (await tx.query(`SELECT pass_hash, pass_salt FROM users WHERE id = $1`, [actor.id]))[0]!);
    if (!(await verifyPassword(current, user.pass_salt, user.pass_hash))) throw new HttpError(422, "bad_password", "A senha atual não confere.");
    if (current === next) throw new HttpError(422, "same_password", "Escolha uma senha diferente da atual.");
    const { hash, salt } = await hashPassword(next);
    await db.system(async (tx) => {
      await tx.query(`UPDATE users SET pass_hash = $2, pass_salt = $3, must_change_password = false WHERE id = $1`, [actor.id, hash, salt]);
      await tx.query(`DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2`, [actor.id, sha256(request.cookies[COOKIE]!)]);
    });
    return { ok: true };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const token = request.cookies[COOKIE];
    const guest = request.actor?.guestUntil ? request.actor.id : null;
    // Visitante que sai não volta: a conta e o que ele respondeu são apagados na hora.
    if (guest) await db.system((tx) => removeGuest(tx, guest));
    else if (token) await db.system((tx) => tx.query(`DELETE FROM sessions WHERE token_hash = $1`, [sha256(token)]));
    reply.clearCookie(COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/api/me", async (request): Promise<Me> => {
    const actor = request.actor;
    if (!actor) throw new HttpError(401, "unauthenticated", "Faça login para continuar.");
    return db.system(async (tx) => {
      const school = actor.schoolId
        ? (await tx.query(`SELECT id, name, brand_color, is_demo, released_at FROM schools WHERE id = $1`, [actor.schoolId]))[0]
        : null;
      const klass = (await tx.query(`SELECT c.name FROM class_students cs JOIN classes c ON c.id = cs.class_id WHERE cs.student_id = $1 LIMIT 1`, [actor.id]))[0];
      return {
        id: actor.id,
        name: actor.name,
        role: actor.role,
        school: school ? { id: school.id, name: school.name, brandColor: school.brand_color, isDemo: school.is_demo, released: !!school.released_at } : null,
        grade: actor.grade,
        className: klass?.name ?? null,
        blocked: actor.blocked,
        guestUntil: actor.guestUntil,
      };
    });
  });

  app.get("/api/auth/check", async (request) => ({ role: requireActor(request).role }));
};
