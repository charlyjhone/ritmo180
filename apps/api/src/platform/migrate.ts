// Migrações em ordem, cada uma aplicada uma única vez.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Database, Tx } from "./db.ts";

const DIR = fileURLToPath(new URL("../../migrations", import.meta.url));

/** Sem isto o login simplesmente não acha ninguém: as políticas de RLS escondem as linhas do dono do banco. */
export async function databaseRoleProblem(tx: Tx): Promise<string | null> {
  const role = (await tx.query(
    `SELECT current_user AS name, rolsuper OR rolbypassrls AS bypasses, pg_has_role(current_user, 'app_user', 'MEMBER') AS can_switch
     FROM pg_roles WHERE rolname = current_user`,
  ))[0]!;
  if (!role.bypasses) return `O papel ${role.name} precisa de BYPASSRLS. Veja docs/publicar.md.`;
  if (!role.can_switch) return `O papel ${role.name} precisa ser membro de app_user. Veja docs/publicar.md.`;
  return null;
}

export async function migrate(db: Database): Promise<string[]> {
  const files = (await readdir(DIR)).filter((f) => f.endsWith(".sql")).sort();
  return db.system(async (tx) => {
    await tx.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, at timestamptz NOT NULL DEFAULT now())`);
    const done = new Set((await tx.query(`SELECT name FROM schema_migrations`)).map((r) => r.name));
    const applied: string[] = [];
    for (const file of files) {
      if (done.has(file)) continue;
      await tx.exec(await readFile(join(DIR, file), "utf8"));
      await tx.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [file]);
      applied.push(file);
    }
    return applied;
  });
}
