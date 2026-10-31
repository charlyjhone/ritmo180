// Leitura com compreensão: a velocidade só vale se o aluno entendeu e se o tempo é humanamente possível.
export const READING_PASS_SCORE = 3;
export const READING_MIN_PPM = 40;
export const READING_MAX_PPM = 450;

export type ReadingVerdict = "valid" | "low_comprehension" | "implausible_speed";

export interface ReadingResult {
  ppm: number;
  score: number;
  verdict: ReadingVerdict;
}

export function evaluateReading(words: number, readMs: number, score: number): ReadingResult {
  const ppm = readMs > 0 ? Math.round(words / (readMs / 60_000)) : 0;
  let verdict: ReadingVerdict = "valid";
  if (ppm > READING_MAX_PPM || ppm < READING_MIN_PPM) verdict = "implausible_speed";
  else if (score < READING_PASS_SCORE) verdict = "low_comprehension";
  return { ppm, score, verdict };
}

/** Meta de leitura por série, em palavras por minuto com compreensão. */
export const READING_GOALS: Record<string, number> = {
  "6º ano": 130,
  "7º ano": 145,
  "8º ano": 160,
  "9º ano": 175,
  "1ª série": 185,
  "2ª série": 195,
  "3ª série": 205,
};
