import type { Tx } from "../../platform/db.ts";
import type { Actor } from "./actor.ts";

/** Registro de quem acessou ou alterou dados sensíveis. */
export async function audit(tx: Tx, actor: Actor, schoolId: string, action: string, target?: string): Promise<void> {
  await tx.query(`INSERT INTO audit_log (school_id, actor_id, action, target) VALUES ($1, $2, $3, $4)`, [schoolId, actor.id, action, target ?? null]);
}
