// Simulado: montagem por blueprint, ritmo durante a prova e leitura estratégica do resultado.
import { estimateTheta, probability, toScore, type IrtParams, type ScoredResponse } from "./irt.ts";
import type { Area, ItemFacts } from "./types.ts";

export interface BlueprintPart {
  area: Area;
  discipline?: string;
  count: number;
}

export interface AssembledExam {
  itemIds: string[];
  shortages: { area: Area; discipline?: string; missing: number }[];
}

export interface Rng {
  next(): number;
}

/** Sorteia os itens e reporta o que faltou, em vez de entregar uma prova incompleta sem avisar. */
export function assembleExam(blueprint: readonly BlueprintPart[], items: readonly ItemFacts[], rng: Rng): AssembledExam {
  const used = new Set<string>();
  const itemIds: string[] = [];
  const shortages: AssembledExam["shortages"] = [];
  for (const part of blueprint) {
    const pool = items.filter((i) => i.area === part.area && (!part.discipline || i.discipline === part.discipline) && !used.has(i.id));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    const chosen = pool.slice(0, part.count);
    chosen.forEach((c) => {
      used.add(c.id);
      itemIds.push(c.id);
    });
    if (chosen.length < part.count) shortages.push({ area: part.area, discipline: part.discipline, missing: part.count - chosen.length });
  }
  return { itemIds, shortages };
}

/** Saldo em segundos. Positivo significa adiantado em relação ao ritmo planejado. */
export function paceBalance(elapsedSeconds: number, processed: number, secondsPerQuestion: number): number {
  return processed * secondsPerQuestion - elapsedSeconds;
}

export interface ExamResponse {
  itemId: string;
  position: number;
  correct: boolean;
  blank: boolean;
  timeMs: number;
  targetMs: number;
  params: IrtParams | null;
}

export function fatigueCurve(responses: readonly ExamResponse[]): { label: string; accuracy: number | null }[] {
  const ordered = [...responses].sort((x, y) => x.position - y.position);
  const size = Math.ceil(ordered.length / 3);
  return ["1º terço", "2º terço", "3º terço"].map((label, i) => {
    const part = ordered.slice(i * size, (i + 1) * size);
    return { label, accuracy: part.length ? Math.round((part.filter((r) => r.correct).length / part.length) * 100) : null };
  });
}

const scored = (list: readonly ExamResponse[]): ScoredResponse[] =>
  list.filter((r) => r.params).map((r) => ({ params: r.params!, correct: r.correct }));

export type IncoherenceKind = "easy_missed" | "unlikely_hit";

export interface Incoherence {
  itemId: string;
  kind: IncoherenceKind;
  chance: number;
}

/** Erros que o aluno deveria acertar e acertos improváveis para a faixa dele. */
export function incoherences(responses: readonly ExamResponse[]): Incoherence[] {
  const { theta } = estimateTheta(scored(responses));
  const out: Incoherence[] = [];
  for (const r of responses) {
    if (!r.params) continue;
    const chance = probability(theta, r.params);
    if (!r.correct && chance >= 0.75) out.push({ itemId: r.itemId, kind: "easy_missed", chance });
    if (r.correct && chance <= 0.3) out.push({ itemId: r.itemId, kind: "unlikely_hit", chance });
  }
  return out;
}

export interface WhatIf {
  gain: number;
  title: string;
  detail: string;
}

/** Recalcula a nota com as mudanças de estratégia, em vez de estimar o ganho por regra fixa. */
export function whatIfScenarios(area: Area, responses: readonly ExamResponse[]): WhatIf[] {
  const base = toScore(area, estimateTheta(scored(responses))).score;
  const scoreWith = (change: (r: ExamResponse) => ExamResponse) =>
    toScore(area, estimateTheta(scored(responses.map(change)))).score;
  const scenarios: WhatIf[] = [];

  const easy = incoherences(responses).filter((i) => i.kind === "easy_missed");
  if (easy.length > 0) {
    const ids = new Set(easy.map((e) => e.itemId));
    const gain = scoreWith((r) => (ids.has(r.itemId) ? { ...r, correct: true } : r)) - base;
    const list = responses.filter((r) => ids.has(r.itemId)).map((r) => r.position + 1).slice(0, 4).join(", ");
    scenarios.push({ gain, title: "Revisar as fáceis antes de entregar", detail: `Você errou questões dentro da sua faixa: ${list}.` });
  }

  const sinks = responses.filter((r) => !r.correct && !r.blank && r.timeMs > r.targetMs * 2);
  if (sinks.length > 0) {
    const lost = sinks.reduce((sum, r) => sum + (r.timeMs - r.targetMs), 0);
    const fit = Math.floor(lost / 180_000);
    const blanks = responses.filter((r) => r.blank && r.params);
    if (fit > 0) {
      const ranked = [...blanks].sort((x, y) => x.params!.b - y.params!.b).slice(0, fit);
      const ids = new Set(ranked.map((r) => r.itemId));
      const gain = ids.size ? scoreWith((r) => (ids.has(r.itemId) ? { ...r, correct: true } : r)) - base : 0;
      scenarios.push({ gain, title: "Pular antes de insistir", detail: `${sinks.length} questão(ões) custaram o tempo de cerca de ${fit} outras e foram erradas.` });
    }
  }
  return scenarios.sort((x, y) => y.gain - x.gain);
}
