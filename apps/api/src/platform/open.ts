import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Database } from "./db.ts";
import { openPglite } from "./db-pglite.ts";
import { migrate } from "./migrate.ts";
import { openPostgres } from "./db-postgres.ts";

export const DATA_DIR = fileURLToPath(new URL("../../../../data", import.meta.url));

/** Postgres quando há DATABASE_URL; senão o banco embutido em data/. */
/** O banco embutido corrompe se dois processos o abrem juntos, por exemplo importar com o servidor ligado. */
function holdEmbeddedLock(): void {
  const lock = join(DATA_DIR, "pg.lock");
  if (existsSync(lock)) {
    const owner = Number(readFileSync(lock, "utf8"));
    if (owner && isRunning(owner)) throw new Error(`O banco local está em uso pelo processo ${owner}. Desligue o servidor e tente de novo.`);
  }
  writeFileSync(lock, String(process.pid));
  process.on("exit", () => rmSync(lock, { force: true }));
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function openDatabase(): Promise<Database> {
  const url = process.env.DATABASE_URL;
  let db: Database;
  if (url) db = openPostgres(url);
  else {
    mkdirSync(DATA_DIR, { recursive: true });
    holdEmbeddedLock();
    db = await openPglite(`${DATA_DIR}/pg`);
  }
  await migrate(db);
  return db;
}
