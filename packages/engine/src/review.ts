// Revisão espaçada do caderno de erros. A questão entra quando o aluno erra ou acerta no chute,
// precisa ser refeita logo e depois volta em intervalos crescentes. Só sai depois do último intervalo.
// O estado sai inteiro do histórico de tentativas: não há agenda gravada para ficar fora de sincronia.

export type Confidence = "sure" | "think" | "guess";

/** Dias até a próxima revisão depois de cada acerto. O último acerto, depois de 21 dias, tira a questão do caderno. */
export const REVIEW_DAYS = [2, 7, 21] as const;

const DAY_MS = 86_400_000;
/** Meia-noite em Brasília (UTC−3): a revisão vence no começo do dia, não na hora exata do acerto. */
const BRT_OFFSET_MS = 3 * 3_600_000;
const startOfDay = (ms: number) => Math.floor((ms - BRT_OFFSET_MS) / DAY_MS) * DAY_MS + BRT_OFFSET_MS;

export interface ReviewFact {
  correct: boolean;
  /** Nulo nas tentativas anteriores à pergunta de certeza: acerto sem certeza informada conta como aprendido. */
  confidence: Confidence | null;
  answeredAt: number;
}

export interface ReviewState {
  /**
   * `clear`: nunca entrou no caderno ou já saiu dele.
   * `redo`: errou ou chutou; precisa refazer já.
   * `spaced`: acertou ao refazer; volta em `dueAt`.
   */
  status: "clear" | "redo" | "spaced";
  /** Quando a questão volta a aparecer. Nulo fora do caderno. */
  dueAt: number | null;
  /** Revisões espaçadas já vencidas com acerto desde a última falha (0 a REVIEW_DAYS.length − 1). */
  step: number;
  misses: number;
  lastMissAt: number | null;
  /** A última falha foi um erro com certeza: o aluno aprendeu errado. */
  sureMiss: boolean;
  /** A última falha foi um acerto no chute. */
  guessed: boolean;
}

export function reviewState(facts: readonly ReviewFact[]): ReviewState {
  const state: ReviewState = { status: "clear", dueAt: null, step: 0, misses: 0, lastMissAt: null, sureMiss: false, guessed: false };
  for (const fact of [...facts].sort((x, y) => x.answeredAt - y.answeredAt)) {
    const learned = fact.correct && fact.confidence !== "guess";
    if (!learned) {
      Object.assign(state, { status: "redo", dueAt: fact.answeredAt, step: 0, lastMissAt: fact.answeredAt, sureMiss: !fact.correct && fact.confidence === "sure", guessed: fact.correct });
      if (!fact.correct) state.misses++;
      continue;
    }
    // Acertar antes da data não adianta a revisão: só conta lembrar depois do intervalo.
    if (state.status === "clear" || fact.answeredAt < state.dueAt!) continue;
    const wait = state.status === "redo" ? REVIEW_DAYS[0] : REVIEW_DAYS[state.step + 1];
    if (state.status === "spaced") state.step++;
    if (wait === undefined) Object.assign(state, { status: "clear", dueAt: null });
    else Object.assign(state, { status: "spaced", dueAt: startOfDay(fact.answeredAt) + wait * DAY_MS });
  }
  return state;
}

export const isReviewDueNow = (state: ReviewState, now: number) => state.status !== "clear" && state.dueAt !== null && state.dueAt <= now;
