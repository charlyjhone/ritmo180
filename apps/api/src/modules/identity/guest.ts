// Visitante: entra sem nome nem e-mail, numa escola própria, e é apagado quando o prazo acaba.
import { randomInt, randomUUID } from "node:crypto";
import type { Database, Tx } from "../../platform/db.ts";

export const GUEST_DAYS = 7;
const GUEST_SCHOOL_SLUG = "visitantes";
const GUEST_GRADE = "3ª série";

/** Condição SQL que tira as respostas de visitantes de qualquer estatística das questões. */
export const NOT_GUEST_ATTEMPT = `a.school_id NOT IN (SELECT id FROM schools WHERE slug = '${GUEST_SCHOOL_SLUG}')`;

async function guestSchool(tx: Tx, now: number): Promise<string> {
  await tx.query(
    `INSERT INTO schools (name, city, grades, slug, is_demo, dpa_signed, released_at)
     VALUES ('Visitantes', 'Acesso sem cadastro', 'EM', $1, true, true, $2) ON CONFLICT (slug) DO NOTHING`,
    [GUEST_SCHOOL_SLUG, new Date(now)],
  );
  return (await tx.query(`SELECT id FROM schools WHERE slug = $1`, [GUEST_SCHOOL_SLUG]))[0]!.id;
}

export async function createGuest(tx: Tx, now: number): Promise<{ id: string; expires: Date }> {
  const id = randomUUID();
  const expires = new Date(now + GUEST_DAYS * 86_400_000);
  await tx.query(
    `INSERT INTO users (id, school_id, name, role, grade, guest_expires_at) VALUES ($1, $2, $3, 'student', $4, $5)`,
    [id, await guestSchool(tx, now), `Visitante ${randomInt(1000, 10_000)}`, GUEST_GRADE, expires],
  );
  return { id, expires };
}

/** Apaga o visitante e tudo o que ele fez. As tabelas ligadas ao aluno apagam em cascata. */
export async function removeGuest(tx: Tx, userId: string): Promise<void> {
  await tx.query(`DELETE FROM users WHERE id = $1 AND guest_expires_at IS NOT NULL`, [userId]);
}

export async function removeExpiredGuests(db: Database, now: number): Promise<number> {
  const rows = await db.system((tx) => tx.query(`DELETE FROM users WHERE guest_expires_at <= $1 RETURNING id`, [new Date(now)]));
  return rows.length;
}
