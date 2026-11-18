// Peças HTTP compartilhadas pelos módulos. Não conhece nenhuma regra de negócio.
import type { FastifyInstance } from "fastify";
import type { Database } from "./db.ts";
import type { Llm } from "./llm.ts";

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface AppDeps {
  db: Database;
  llm: Llm | null;
  now: () => number;
  secureCookies: boolean;
  loginAttemptsPerMinute: number;
  /** Libera o botão "Entrar sem cadastro". */
  guestAccess?: boolean;
  /** Atrás de proxy ou túnel: o IP de cada aluno vem do cabeçalho X-Forwarded-For. */
  behindProxy?: boolean;
}

/** Contrato de todo módulo: recebe as dependências e registra as próprias rotas. */
export type ModuleRoutes = (app: FastifyInstance, deps: AppDeps) => void;
