// Integridade: respostas incompatíveis com resolução real ficam fora do Índice Ritmo e da calibração, sem punição.
export type IntegrityFlag = "too_fast" | "away_then_perfect" | "guess_streak";

export interface IntegrityInput {
  correct: boolean;
  totalMs: number;
  hiddenMs: number;
  wordCount: number;
  b: number | null;
}

const MAX_READ_WORDS_PER_SECOND = 12;
const HARD_ITEM_B = 1;
const HARD_ITEM_MIN_MS = 15_000;
const LONG_ABSENCE_MS = 60_000;
const GUESS_MS = 8_000;
const GUESS_STREAK = 5;

export function attemptFlags(input: IntegrityInput): IntegrityFlag[] {
  const flags: IntegrityFlag[] = [];
  const seconds = input.totalMs / 1000;
  const unreadable = seconds > 0 && input.wordCount / seconds > MAX_READ_WORDS_PER_SECOND;
  const hardTooFast = (input.b ?? 0) >= HARD_ITEM_B && input.correct && input.totalMs < HARD_ITEM_MIN_MS;
  if (seconds <= 0 || unreadable || hardTooFast) flags.push("too_fast");
  if (input.correct && input.hiddenMs >= LONG_ABSENCE_MS) flags.push("away_then_perfect");
  return flags;
}

/** Marca, em uma sequência, as posições que fazem parte de um chute em série. */
export function guessStreakPositions(totalsMs: readonly number[]): Set<number> {
  const marked = new Set<number>();
  let start = 0;
  for (let i = 0; i <= totalsMs.length; i++) {
    if (i < totalsMs.length && totalsMs[i]! < GUESS_MS) continue;
    if (i - start >= GUESS_STREAK) for (let k = start; k < i; k++) marked.add(k);
    start = i + 1;
  }
  return marked;
}
