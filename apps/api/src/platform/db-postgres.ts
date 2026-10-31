// Postgres de produção. Mesmo schema e mesmas políticas do banco embutido.
import pg from "pg";
import { enterScope, type Database, type Row, type Tenant, type Tx } from "./db.ts";

export function openPostgres(connectionString: string): Database {
  const pool = new pg.Pool({ connectionString, max: Number(process.env.DB_POOL_SIZE || 10) });

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
