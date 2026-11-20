// Cópia de segurança do banco, com prova de que ela volta.
//
//   npm run backup                      copia o banco de DATABASE_URL para ~/Ritmo180-copias e confere a restauração
//   npm run backup -- conferir ARQUIVO  só confere uma cópia já feita
//
// A cópia restaura num banco vazio na memória, com as migrações do projeto, e compara a contagem de cada tabela.
// O arquivo tem dados pessoais de alunos: fica só neste computador, legível só pelo seu usuário. Não mande por e-mail
// nem suba para a nuvem sem criptografia.
import { gunzipSync, gzipSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { openPglite } from "../apps/api/src/platform/db-pglite.ts";
import { openPostgres } from "../apps/api/src/platform/db-postgres.ts";
import { migrate } from "../apps/api/src/platform/migrate.ts";
import type { Database, Row, Tx } from "../apps/api/src/platform/db.ts";

export interface Snapshot {
  createdAt: string;
  migrations: string[];
  tables: Record<string, Row[]>;
}

/** Sessões de login não entram: são descartáveis e não devem circular fora do servidor. */
const SKIPPED = new Set(["sessions"]);

/** bytea vira texto hexadecimal, que o Postgres lê de volta sem conversão. */
const plain = (row: Row): Row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Buffer.isBuffer(v) || v instanceof Uint8Array ? `\\x${Buffer.from(v).toString("hex")}` : v]));

export async function takeSnapshot(db: Database, now = new Date()): Promise<Snapshot> {
  return db.system(async (tx) => {
    // Uma foto só: todas as tabelas no mesmo instante, sem bloquear quem está usando.
    await tx.exec("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    const names = (await tx.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`)).map((r) => r.tablename as string);
    const tables: Record<string, Row[]> = {};
    for (const name of names.filter((n) => !SKIPPED.has(n) && n !== "schema_migrations")) {
      tables[name] = (await tx.query(`SELECT * FROM "${name}"`)).map(plain);
    }
    const migrations = (await tx.query(`SELECT name FROM schema_migrations ORDER BY name`)).map((r) => r.name as string);
    return { createdAt: now.toISOString(), migrations, tables };
  });
}

async function restoreInto(tx: Tx, snapshot: Snapshot): Promise<void> {
  // Sem checar chaves estrangeiras durante a carga: a ordem das tabelas deixa de importar.
  await tx.exec("SET LOCAL session_replication_role = replica");
  for (const [name, rows] of Object.entries(snapshot.tables)) {
    await tx.query(`DELETE FROM "${name}"`);
    if (!rows.length) continue;
    const identity = (await tx.query(`SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND is_identity = 'YES'`, [name])).length > 0;
    for (let i = 0; i < rows.length; i += 2_000) {
      await tx.query(`INSERT INTO "${name}" ${identity ? "OVERRIDING SYSTEM VALUE " : ""}SELECT * FROM json_populate_recordset(NULL::"${name}", $1::json)`, [JSON.stringify(rows.slice(i, i + 2_000))]);
    }
  }
}

/** Restaura num banco vazio e compara linha por tabela. Devolve as diferenças; vazio quer dizer que a cópia volta inteira. */
export async function verifySnapshot(snapshot: Snapshot): Promise<{ tables: number; rows: number; problems: string[] }> {
  const db = await openPglite();
  try {
    await migrate(db);
    const problems: string[] = [];
    const known = new Set((await db.system((tx) => tx.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`))).map((r) => r.tablename as string));
    const missing = Object.keys(snapshot.tables).filter((t) => !known.has(t));
    for (const t of missing) problems.push(`a tabela ${t} da cópia não existe nas migrações deste projeto`);
    const restorable = { ...snapshot, tables: Object.fromEntries(Object.entries(snapshot.tables).filter(([t]) => known.has(t))) };
    await db.system((tx) => restoreInto(tx, restorable));
    let rows = 0;
    for (const [name, list] of Object.entries(restorable.tables)) {
      const [{ n }] = await db.system((tx) => tx.query(`SELECT count(*)::int AS n FROM "${name}"`)) as [{ n: number }];
      rows += n;
      if (n !== list.length) problems.push(`${name}: a cópia tem ${list.length} linhas, a restauração ficou com ${n}`);
    }
    return { tables: Object.keys(restorable.tables).length, rows, problems };
  } finally {
    await db.close();
  }
}

const encode = (s: Snapshot) => gzipSync(JSON.stringify(s));
const decode = (buf: Buffer) => JSON.parse(gunzipSync(buf).toString("utf8")) as Snapshot;

async function main() {
  const [command, file] = process.argv.slice(2);
  if (command === "conferir") {
    if (!file) throw new Error("Informe o arquivo: npm run backup -- conferir CAMINHO");
    const result = await verifySnapshot(decode(readFileSync(file)));
    report(file, result);
    return;
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ausente neste terminal. Rode no terminal onde a conexão do banco está configurada.");
  const db = openPostgres(url);
  let snapshot: Snapshot;
  try {
    snapshot = await takeSnapshot(db);
  } finally {
    await db.close();
  }
  const dir = join(homedir(), "Ritmo180-copias");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, `ritmo-${snapshot.createdAt.slice(0, 16).replace(/[:T]/g, "-")}.json.gz`);
  writeFileSync(path, encode(snapshot), { mode: 0o600 });
  report(path, await verifySnapshot(snapshot));
}

function report(path: string, result: { tables: number; rows: number; problems: string[] }) {
  if (result.problems.length) {
    console.log(`COPIA_RITMO com problema em ${path}:\n- ${result.problems.join("\n- ")}`);
    process.exitCode = 1;
  } else {
    console.log(`COPIA_RITMO ok: ${result.tables} tabelas e ${result.rows} linhas restauradas sem diferença. Arquivo: ${path}`);
  }
}

// Comparar como URL: o caminho do projeto tem espaços, que viram %20 em import.meta.url.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
