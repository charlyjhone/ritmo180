import { z } from "zod";
import { AREAS } from "@ritmo/contracts";
import { HttpError, type ModuleRoutes } from "../../platform/http.ts";
import { requireActor } from "../identity/index.ts";
import { reviewSuggestion, suggestionQueue } from "./enrich.ts";
import { generateItems, reviewItem, reviewQueue } from "./pipeline.ts";

const GenerateInput = z.object({ area: z.enum(AREAS), discipline: z.string(), topic: z.string().min(2).max(160), count: z.number().int().min(1).max(10) });
const ReviewInput = z.object({ approved: z.boolean() });

export const contentRoutes: ModuleRoutes = (app, { db, llm, now }) => {
  app.post("/api/content/generate", async (request) => {
    requireActor(request, "network_admin");
    if (!llm) throw new HttpError(503, "ai_unavailable", "Configure a chave da Anthropic para gerar questões.");
    return generateItems(db, llm, GenerateInput.parse(request.body));
  });

  app.get("/api/content/review", async (request) => {
    requireActor(request, "network_admin");
    return db.system(reviewQueue);
  });

  app.post<{ Params: { id: string } }>("/api/content/review/:id", async (request) => {
    const actor = requireActor(request, "network_admin");
    const { approved } = ReviewInput.parse(request.body);
    await db.system((tx) => reviewItem(tx, request.params.id, approved, actor.name));
    return { ok: true };
  });

  app.get("/api/content/suggestions", async (request) => {
    requireActor(request, "network_admin");
    return db.system(suggestionQueue);
  });

  app.post<{ Params: { id: string } }>("/api/content/suggestions/:id", async (request) => {
    const actor = requireActor(request, "network_admin");
    const { approved } = ReviewInput.parse(request.body);
    await db.system((tx) => reviewSuggestion(tx, request.params.id, approved, actor.name, now()));
    return { ok: true };
  });
};
