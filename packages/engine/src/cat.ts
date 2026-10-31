// Diagnóstico adaptativo: cada questão é a mais informativa para a estimativa atual do aluno.
import { estimateTheta, information, type IrtParams, type ScoredResponse } from "./irt.ts";

export interface AdaptiveConfig {
  maxItems: number;
  minItems: number;
  targetSe: number;
}

export const DEFAULT_ADAPTIVE: AdaptiveConfig = { maxItems: 30, minItems: 12, targetSe: 0.35 };

export interface AdaptivePoolItem {
  id: string;
  topic: string;
  params: IrtParams;
}

export interface AdaptiveState {
  done: boolean;
  theta: number;
  se: number;
  nextItemId: string | null;
}

export function nextAdaptiveItem(
  pool: readonly AdaptivePoolItem[],
  answered: readonly (ScoredResponse & { itemId: string; topic: string })[],
  config = DEFAULT_ADAPTIVE,
): AdaptiveState {
  const estimate = estimateTheta(answered);
  const reachedPrecision = answered.length >= config.minItems && estimate.se <= config.targetSe;
  const seen = new Set(answered.map((a) => a.itemId));
  const available = pool.filter((p) => !seen.has(p.id));
  if (reachedPrecision || answered.length >= config.maxItems || available.length === 0) {
    return { done: true, theta: estimate.theta, se: estimate.se, nextItemId: null };
  }
  const topicCount = new Map<string, number>();
  for (const a of answered) topicCount.set(a.topic, (topicCount.get(a.topic) ?? 0) + 1);
  let best: AdaptivePoolItem | null = null;
  let bestValue = -Infinity;
  for (const item of available) {
    // A penalidade por repetição mantém a cobertura de assuntos, como a Matriz exige.
    const value = information(estimate.theta, item.params) / (1 + (topicCount.get(item.topic) ?? 0));
    if (value > bestValue) {
      bestValue = value;
      best = item;
    }
  }
  return { done: false, theta: estimate.theta, se: estimate.se, nextItemId: best!.id };
}
