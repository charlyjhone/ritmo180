// Etapa comum a todas as origens: valida a questão e limpa o HTML.
import { CanonicalItemSchema, type CanonicalItem } from "@ritmo/contracts";
import { cleanHtml } from "./sanitize.ts";

export interface Rejection {
  position: number;
  id: string;
  errors: string[];
}

export interface IngestBatch {
  items: CanonicalItem[];
  rejected: Rejection[];
}

export function normalizeItems(raw: readonly unknown[]): IngestBatch {
  const batch: IngestBatch = { items: [], rejected: [] };
  const seen = new Set<string>();
  raw.forEach((candidate, position) => {
    const parsed = CanonicalItemSchema.safeParse(candidate);
    const id = String((candidate as { externalId?: unknown } | null)?.externalId ?? `linha ${position + 1}`);
    if (!parsed.success) {
      batch.rejected.push({ position, id, errors: parsed.error.issues.map((i) => (i.path[0] === "area" ? `disciplina não reconhecida: ${(candidate as { discipline?: unknown }).discipline}` : `${i.path.join(".") || "questão"}: ${i.message}`)) });
      return;
    }
    if (seen.has(parsed.data.externalId)) {
      batch.rejected.push({ position, id, errors: ["externalId repetido no arquivo."] });
      return;
    }
    seen.add(parsed.data.externalId);
    const item = parsed.data;
    const clean: CanonicalItem = {
      ...item,
      contextHtml: cleanHtml(item.contextHtml),
      stemHtml: cleanHtml(item.stemHtml),
      solutionHtml: cleanHtml(item.solutionHtml),
      alternatives: item.alternatives.map((a) => ({ ...a, html: cleanHtml(a.html) })),
    };
    const emptied = !clean.stemHtml || clean.alternatives.some((a) => !a.html);
    if (emptied) batch.rejected.push({ position, id, errors: ["Enunciado ou alternativa ficou vazio após a limpeza do HTML."] });
    else batch.items.push(clean);
  });
  return batch;
}
