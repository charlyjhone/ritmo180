// Índice Ritmo: questões certas dentro do tempo-alvo, só com tentativas válidas.
import type { AttemptFact } from "./types.ts";

export const RITMO_WINDOW = 40;

export interface RitmoSummary {
  index: number | null;
  samples: number;
  avgMs: number | null;
  accuracy: number | null;
}

export function ritmoSummary(attempts: readonly AttemptFact[], window = RITMO_WINDOW): RitmoSummary {
  const recent = [...attempts]
    .filter((a) => a.valid)
    .sort((x, y) => y.answeredAt - x.answeredAt)
    .slice(0, window);
  if (recent.length === 0) return { index: null, samples: 0, avgMs: null, accuracy: null };
  const hits = recent.filter((a) => a.correct && a.totalMs <= a.targetMs).length;
  return {
    index: Math.round((hits / recent.length) * 100),
    samples: recent.length,
    avgMs: recent.reduce((sum, a) => sum + a.totalMs, 0) / recent.length,
    accuracy: Math.round((recent.filter((a) => a.correct).length / recent.length) * 100),
  };
}

const DAY_MS = 86_400_000;

/** Índice Ritmo acumulado ao fim de cada uma das últimas semanas. */
export function weeklyRitmo(attempts: readonly AttemptFact[], weeks: number, now: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const end = now - w * 7 * DAY_MS;
    out.push(ritmoSummary(attempts.filter((a) => a.answeredAt <= end)).index);
  }
  return out;
}

const dayKey = (ms: number, offsetMinutes: number) => Math.floor((ms - offsetMinutes * 60_000) / DAY_MS);

/** Dias seguidos de treino até hoje. O dia atual ainda sem treino não quebra a sequência. */
export function trainingStreak(timestamps: readonly number[], now: number, offsetMinutes = 180): number {
  const days = new Set(timestamps.map((t) => dayKey(t, offsetMinutes)));
  let day = dayKey(now, offsetMinutes);
  if (!days.has(day)) day -= 1;
  let streak = 0;
  while (days.has(day)) {
    streak += 1;
    day -= 1;
  }
  return streak;
}

export function bestStreak(timestamps: readonly number[], offsetMinutes = 180): number {
  const days = [...new Set(timestamps.map((t) => dayKey(t, offsetMinutes)))].sort((x, y) => x - y);
  let best = 0;
  let run = 0;
  days.forEach((day, i) => {
    run = i > 0 && day === days[i - 1]! + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}
