// Migrações em ordem, cada uma aplicada uma única vez.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Database } from "./db.ts";

const DIR = fileURLToPath(new URL("../../migrations", import.meta.url));

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
