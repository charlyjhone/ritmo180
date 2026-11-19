// Monta o servidor. Cada módulo entra por uma linha e pode ser trocado sem tocar nos demais.
import { join } from "node:path";
import { existsSync } from "node:fs";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import fastifyStatic from "@fastify/static";
import { ZodError } from "zod";
import { HttpError, type AppDeps } from "./platform/http.ts";
import { contentRoutes } from "./modules/content/index.ts";
import { examRoutes } from "./modules/exam/index.ts";
import { identityRoutes } from "./modules/identity/index.ts";
import { insightsRoutes } from "./modules/insights/index.ts";
import { onboardingRoutes } from "./modules/onboarding/index.ts";
import { peopleRoutes } from "./modules/people/index.ts";
import { practiceRoutes } from "./modules/practice/index.ts";
import { privacyRoutes } from "./modules/privacy/index.ts";
import { readingRoutes } from "./modules/reading/index.ts";

const BODY_LIMIT = 8 * 1024 * 1024;
const MODULES = [identityRoutes, practiceRoutes, readingRoutes, examRoutes, insightsRoutes, onboardingRoutes, contentRoutes, peopleRoutes, privacyRoutes];

export async function buildApp(deps: AppDeps, options: { webRoot?: string; labRoot?: string; logger?: boolean } = {}) {
  // Em produção o servidor fica atrás de um proxy: sem isto, o limite de login veria todos com o mesmo IP.
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: BODY_LIMIT, trustProxy: deps.behindProxy ?? deps.secureCookies });
  await app.register(cookie);
  await app.register(helmet, {
    hsts: deps.secureCookies,
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) return reply.status(400).send({ code: "invalid_input", message: error.issues[0]?.message ?? "Dados inválidos." });
    if (error instanceof HttpError) return reply.status(error.status).send({ code: error.code, message: error.message });
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 429) return reply.status(429).send({ code: "too_many_requests", message: "Muitas tentativas. Aguarde um minuto." });
    if (status && status < 500) return reply.status(status).send({ code: "bad_request", message: "Requisição inválida." });
    request.log.error(error);
    return reply.status(500).send({ code: "internal", message: "Algo deu errado do nosso lado." });
  });

  for (const routes of MODULES) routes(app, deps);
  app.get("/api/health", async () => {
    await deps.db.system((tx) => tx.query(`SELECT 1`));
    return { ok: true };
  });

  // Laboratório Virtual: site estático com rotas por #hash, servido em /laboratorio/.
  const labRoot = options.labRoot;
  if (labRoot && existsSync(join(labRoot, "index.html"))) {
    app.get("/laboratorio", (_request, reply) => reply.redirect("/laboratorio/", 301));
    await app.register(fastifyStatic, {
      root: labRoot,
      prefix: "/laboratorio/",
      decorateReply: false,
      cacheControl: false,
      setHeaders: (response, path) => response.header("cache-control", path.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache"),
    });
  }

  const webRoot = options.webRoot;
  if (webRoot && existsSync(join(webRoot, "index.html"))) {
    await app.register(fastifyStatic, {
      root: webRoot,
      cacheControl: false,
      // Arquivos com hash nunca mudam. O restante é revalidado para uma nova versão chegar logo.
      setHeaders: (response, path) => response.header("cache-control", path.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache"),
    });
    app.setNotFoundHandler((request, reply) => {
      const hasExtension = /\.[a-z0-9]+$/i.test(request.url.split("?")[0]!);
      if (request.url.startsWith("/api/") || hasExtension || !["GET", "HEAD"].includes(request.method)) {
        return reply.status(404).send({ code: "not_found", message: "Não encontrado." });
      }
      return reply.type("text/html").sendFile("index.html");
    });
  } else {
    app.setNotFoundHandler((_request, reply) => reply.status(404).send({ code: "not_found", message: "Não encontrado." }));
  }
  return app;
}
