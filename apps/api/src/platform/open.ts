import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Database } from "./db.ts";
import { openPglite } from "./db-pglite.ts";
import { migrate } from "./migrate.ts";
import { openPostgres } from "./db-postgres.ts";

export const DATA_DIR = fileURLToPath(new URL("../../../../data", import.meta.url));

/** Postgres quando há DATABASE_URL; senão o banco embutido em data/. */
export async function openDatabase(): Promise<Database> {
  const url = process.env.DATABASE_URL;
  let db: Database;
  if (url) db = openPostgres(url);
  else {
    mkdirSync(DATA_DIR, { recursive: true });
    db = await openPglite(`${DATA_DIR}/pg`);
  }
  await migrate(db);
  return db;
}
