// Tipos do motor. Ele não conhece banco, HTTP nem interface: recebe dados e devolve decisões.
export const AREAS = ["LC", "CH", "CN", "MT"] as const;
export type Area = (typeof AREAS)[number];

export interface PhaseTimes {
  readMs: number;
  pathMs: number;
  calcMs: number;
  checkMs: number;
}

export type PracticeMode = "guided" | "exam";

/** Tentativa já registrada, no formato de que o motor precisa. */
export interface AttemptFact {
  itemId: string;
  topic: string;
  area: Area;
  correct: boolean;
  totalMs: number;
  targetMs: number;
  mode: PracticeMode;
  phases: PhaseTimes | null;
  usedHint: boolean;
  valid: boolean;
  /** Posição da questão no bloco (0 = primeira). */
  position: number;
  answeredAt: number;
}

export interface ItemFacts {
  id: string;
  area: Area;
  discipline: string;
  topic: string;
  wordCount: number;
  /** Só presentes em itens calibrados. */
  irt: { a: number; b: number; c: number } | null;
  /** Mediana do tempo de quem acertou, quando já há dados. */
  medianCorrectMs: number | null;
  correctSamples: number;
}
