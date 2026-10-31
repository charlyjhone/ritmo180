// Domínio por assunto e etapa do Método Ritmo. Funciona mesmo com itens ainda sem calibração.
import type { AttemptFact } from "./types.ts";
import { median, sumPhases } from "./timing.ts";

export const STAGES = ["Precisão", "Fluência", "Reconhecimento", "Velocidade", "Resistência"] as const;
export type Stage = 1 | 2 | 3 | 4 | 5;

const RECENCY_DECAY = 0.95;
const LATE_POSITION = 20;

export interface TopicMastery {
  topic: string;
  mastery: number;
  attempts: number;
  stage: Stage;
}

/** Acerto com peso maior para o recente, suavizado para não dar 100% com uma resposta. */
export function masteryOf(attempts: readonly AttemptFact[]): number {
  const ordered = [...attempts].sort((x, y) => y.answeredAt - x.answeredAt);
  let weight = 2;
  let hits = 1;
  ordered.forEach((a, age) => {
    const w = RECENCY_DECAY ** age;
    weight += w;
    if (a.correct) hits += w;
  });
  return hits / weight;
}

export function stageOf(attempts: readonly AttemptFact[]): Stage {
  const valid = attempts.filter((a) => a.valid);
  const recent = [...valid].sort((x, y) => y.answeredAt - x.answeredAt).slice(0, 12);
  if (recent.length < 6) return 1;
  const rate = (list: readonly AttemptFact[], test: (a: AttemptFact) => boolean) =>
    list.length ? list.filter(test).length / list.length : 0;
  const accuracy = rate(recent, (a) => a.correct);
  if (accuracy < 0.6) return 1;
  if (accuracy < 0.7 || rate(recent, (a) => a.usedHint) > 0.2) return 2;

  const guided = recent.filter((a) => a.phases !== null);
  const pathShares = guided.map((a) => a.phases!.pathMs / Math.max(1, a.targetMs));
  if (guided.length >= 3 && median(pathShares) > 0.3) return 3;

  if (rate(recent, (a) => a.correct && a.totalMs <= a.targetMs) < 0.6) return 4;

  const late = valid.filter((a) => a.position >= LATE_POSITION);
  if (late.length < 5 || rate(late, (a) => a.correct) < accuracy - 0.1) return 4;
  return 5;
}

export function masteryByTopic(attempts: readonly AttemptFact[]): TopicMastery[] {
  const groups = new Map<string, AttemptFact[]>();
  for (const a of attempts) {
    if (!a.valid) continue;
    const list = groups.get(a.topic);
    if (list) list.push(a);
    else groups.set(a.topic, [a]);
  }
  return [...groups].map(([topic, list]) => ({ topic, mastery: masteryOf(list), attempts: list.length, stage: stageOf(list) }));
}

export { sumPhases };
