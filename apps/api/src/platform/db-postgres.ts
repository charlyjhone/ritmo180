// Postgres de produção. Mesmo schema e mesmas políticas do banco embutido.
import { readFileSync } from "node:fs";
import pg from "pg";
import { enterScope, type Database, type Row, type Tenant, type Tx } from "./db.ts";

/** Raiz do Supabase (Supabase Root 2021 CA, SHA-256 80:70:25:AD:…:CA:FA), a mesma do arquivo prod-ca-2021.crt do painel. */
const SUPABASE_CA = new URL("../../certs/supabase-root-2021.pem", import.meta.url);
const SSL_URL_PARAMS = ["sslmode", "ssl", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat"];

/**
 * Conexão cifrada e com o certificado do servidor conferido: sem isso alguém no caminho poderia se passar pelo banco.
 * No Supabase a raiz vem junto com o código; em outro servidor, `DATABASE_SSL_CA_FILE` aponta o arquivo da raiz.
 * `DATABASE_SSL_VERIFY=off` volta ao que estiver na URL, só para emergência.
 */
export function connectionOptions(connectionString: string, env: Record<string, string | undefined> = process.env): pg.PoolConfig {
  if (env.DATABASE_SSL_VERIFY === "off") return { connectionString };
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return { connectionString };
  }
  const supabase = /(^|\.)supabase\.(com|co)$/.test(url.hostname);
  const caFile = env.DATABASE_SSL_CA_FILE || (supabase ? SUPABASE_CA : null);
  if (!caFile) return { connectionString };
  // Os parâmetros de SSL da URL passariam por cima destas opções no driver; por isso saem da URL.
  for (const name of SSL_URL_PARAMS) url.searchParams.delete(name);
  return { connectionString: url.toString(), ssl: { ca: readFileSync(caFile, "utf8"), rejectUnauthorized: true, servername: url.hostname } };
}

export function openPostgres(connectionString: string): Database {
  const pool = new pg.Pool({ ...connectionOptions(connectionString), max: Number(process.env.DB_POOL_SIZE || 10) });

  async function run<T>(scope: Tenant | "network" | null, work: (tx: Tx) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    const tx: Tx = {
      async query<R extends Row>(sql: string, params: unknown[] = []) {
        return (await client.query<R>(sql, params as any[])).rows;
      },
      async exec(sql: string) {
        await client.query(sql);
      },
    };
    try {
      await client.query("BEGIN");
      if (scope) await enterScope(tx, scope);
      const result = await work(tx);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    tenant: (tenant, work) => run(tenant, work),
    network: (work) => run("network", work),
    system: (work) => run(null, work),
    close: () => pool.end(),
  };
}
