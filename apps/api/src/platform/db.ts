// Porta de banco. O resto do código só conhece esta interface, nunca o driver.
export type Row = Record<string, any>;

export interface Tx {
  query<R extends Row = Row>(sql: string, params?: unknown[]): Promise<R[]>;
  exec(sql: string): Promise<void>;
}

export interface Tenant {
  schoolId: string;
}

export interface Database {
  /** Escopo de uma escola: o Postgres bloqueia, por RLS, qualquer linha de outra escola. */
  tenant<T>(tenant: Tenant, work: (tx: Tx) => Promise<T>): Promise<T>;
  /** Administração da rede: leitura entre escolas, ainda como papel sem privilégio. */
  network<T>(work: (tx: Tx) => Promise<T>): Promise<T>;
  /** Dono do banco, sem RLS. Só login, migrações, importação e tarefas agendadas. */
  system<T>(work: (tx: Tx) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export const one = <R>(rows: R[]): R => {
  const row = rows[0];
  if (row === undefined) throw new Error("Consulta sem resultado.");
  return row;
};

const BEGIN_TENANT = `SELECT set_config('app.school_id', $1, true), set_config('app.network', '', true)`;
const BEGIN_NETWORK = `SELECT set_config('app.school_id', '', true), set_config('app.network', 'on', true)`;

/** Prepara a transação para o escopo pedido. Vale para qualquer driver Postgres. */
export async function enterScope(tx: Tx, tenant: Tenant | "network"): Promise<void> {
  await tx.exec("SET LOCAL ROLE app_user");
  if (tenant === "network") await tx.query(BEGIN_NETWORK);
  else await tx.query(BEGIN_TENANT, [tenant.schoolId]);
}
