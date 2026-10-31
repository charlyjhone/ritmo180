// Postgres embutido: desenvolvimento, testes e instalação única.
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { enterScope, type Database, type Row, type Tenant, type Tx } from "./db.ts";

const wrap = (tx: Transaction | PGlite): Tx => ({
  async query<R extends Row>(sql: string, params: unknown[] = []) {
    return (await tx.query<R>(sql, params)).rows;
  },
  async exec(sql: string) {
    await tx.exec(sql);
  },
});

export async function openPglite(dataDir?: string): Promise<Database> {
  const pg = await PGlite.create(dataDir ? { dataDir } : {});
  const scoped = <T>(scope: Tenant | "network", work: (tx: Tx) => Promise<T>) =>
    pg.transaction(async (raw) => {
      const tx = wrap(raw);
      await enterScope(tx, scope);
      return work(tx);
    }) as Promise<T>;
  return {
    tenant: (tenant, work) => scoped(tenant, work),
    network: (work) => scoped("network", work),
    system: (work) => pg.transaction((raw) => work(wrap(raw))) as Promise<any>,
    close: () => pg.close(),
  };
}
