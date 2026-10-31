// Tempo-alvo por questão: vem dos dados quando existem, e de uma estimativa conservadora antes disso.
import type { ItemFacts, PhaseTimes } from "./types.ts";

export const EXAM_MINUTES_DAY2 = 300;
export const ANSWER_SHEET_MINUTES = 30;
export const QUESTIONS_DAY2 = 90;
/** (5 h − 30 min de cartão) ÷ 90 questões = 3:00. */
export const DEFAULT_SECONDS_PER_QUESTION = ((EXAM_MINUTES_DAY2 - ANSWER_SHEET_MINUTES) * 60) / QUESTIONS_DAY2;

export const MIN_SAMPLES_FOR_EMPIRICAL_TARGET = 30;
const MIN_TARGET_S = 45;
const MAX_TARGET_S = 480;
const WORDS_PER_SECOND = 3.2;

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Tempo a mais vira um fator sobre o tempo de prova: 1 h extra leva 3:00 para 3:40. */
export function accommodationFactor(extraMinutes: number): number {
  const base = EXAM_MINUTES_DAY2 - ANSWER_SHEET_MINUTES;
  return (base + Math.max(0, extraMinutes)) / base;
}

export function targetSeconds(item: Pick<ItemFacts, "wordCount" | "irt" | "medianCorrectMs" | "correctSamples">, extraMinutes = 0): number {
  let seconds: number;
  if (item.medianCorrectMs !== null && item.correctSamples >= MIN_SAMPLES_FOR_EMPIRICAL_TARGET) {
    seconds = item.medianCorrectMs / 1000;
  } else {
    // Antes de haver dados: leitura proporcional ao texto mais raciocínio, em torno de 3:00.
    const reading = item.wordCount / WORDS_PER_SECOND;
    const difficulty = item.irt ? 15 * item.irt.b : 0;
    seconds = reading + DEFAULT_SECONDS_PER_QUESTION * 0.6 + difficulty;
  }
  const clamped = Math.min(MAX_TARGET_S, Math.max(MIN_TARGET_S, seconds));
  return Math.round(clamped * accommodationFactor(extraMinutes));
}

export function sumPhases(p: PhaseTimes): number {
  return p.readMs + p.pathMs + p.calcMs + p.checkMs;
}

export function averagePhases(items: readonly PhaseTimes[]): PhaseTimes | null {
  if (items.length === 0) return null;
  const sum = (key: keyof PhaseTimes) => items.reduce((total, p) => total + p[key], 0) / items.length;
  return { readMs: sum("readMs"), pathMs: sum("pathMs"), calcMs: sum("calcMs"), checkMs: sum("checkMs") };
}

export function formatClock(seconds: number): string {
  const v = Math.max(0, Math.round(seconds));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
}
