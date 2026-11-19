// Quem está fazendo a requisição e o que isso permite.
import type { FastifyRequest } from "fastify";
import { HttpError } from "../../platform/http.ts";
import type { Tenant } from "../../platform/db.ts";
import type { Me, Role } from "@ritmo/contracts";

export interface Actor {
  id: string;
  name: string;
  role: Role;
  schoolId: string | null;
  grade: string | null;
  blocked: Me["blocked"];
  /** Fim do acesso de visitante; null para contas da escola. */
  guestUntil: number | null;
}

declare module "fastify" {
  interface FastifyRequest {
    actor: Actor | null;
  }
}

export function requireActor(request: FastifyRequest, ...roles: Role[]): Actor {
  const actor = request.actor;
  if (!actor) throw new HttpError(401, "unauthenticated", "Faça login para continuar.");
  if (roles.length > 0 && !roles.includes(actor.role)) throw new HttpError(403, "forbidden", "Seu perfil não tem acesso a esta área.");
  if (actor.blocked) throw new HttpError(403, actor.blocked, "Acesso ainda não liberado.");
  return actor;
}

export function tenantOf(actor: Actor): Tenant {
  if (!actor.schoolId) throw new HttpError(403, "no_school", "Esta conta não pertence a uma escola.");
  return { schoolId: actor.schoolId };
}
