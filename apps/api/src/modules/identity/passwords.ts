import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Tx } from "../../platform/db.ts";

const derive = promisify(scrypt) as (password: string, salt: string, length: number) => Promise<Buffer>;
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16).toString("hex");
  return { hash: (await derive(password, salt, KEY_LENGTH)).toString("hex"), salt };
}

export async function verifyPassword(password: string, salt: string, hash: string): Promise<boolean> {
  const candidate = await derive(password, salt, KEY_LENGTH);
  return timingSafeEqual(candidate, Buffer.from(hash, "hex"));
}

/** Gera senha provisória, encerra as sessões abertas e obriga a troca no próximo acesso. */
export async function resetPassword(tx: Tx, userId: string): Promise<string> {
  const password = temporaryPassword();
  const { hash, salt } = await hashPassword(password);
  await tx.query(`UPDATE users SET pass_hash = $2, pass_salt = $3, must_change_password = true WHERE id = $1`, [userId, hash, salt]);
  await tx.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
  return password;
}

/** Senha provisória legível, sem caracteres que se confundem. */
export function temporaryPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(randomBytes(10), (b) => alphabet[b % alphabet.length]).join("");
}
