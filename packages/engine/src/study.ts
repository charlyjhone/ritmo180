// Ferramentas de estudo: cartões de memorização, motivo do erro, estratégia de prova e reta final.

const DAY_MS = 86_400_000;
const BRT_OFFSET_MS = 3 * 3_600_000;
const startOfDay = (ms: number) => Math.floor((ms - BRT_OFFSET_MS) / DAY_MS) * DAY_MS + BRT_OFFSET_MS;

// Cartões --------------------------------------------------------------------------------

/** Dias até o cartão voltar depois de cada "lembrei". Depois do último, o cartão está aprendido. */
export const CARD_DAYS = [1, 3, 7, 21] as const;

export interface CardFact {
  remembered: boolean;
  at: number;
}

export interface CardState {
  /** `new`: nunca visto; `learning`: em revisão; `learned`: passou por todos os intervalos. */
  status: "new" | "learning" | "learned";
  /** Quantos "lembrei" seguidos desde o último esquecimento. */
  level: number;
  dueAt: number | null;
}

export function cardState(facts: readonly CardFact[]): CardState {
  const state: CardState = { status: "new", level: 0, dueAt: null };
  for (const fact of [...facts].sort((x, y) => x.at - y.at)) {
    // Responder antes da data não adianta: só conta lembrar depois do intervalo.
    if (state.status === "learned" || (state.dueAt !== null && fact.at < state.dueAt && fact.remembered)) continue;
    if (!fact.remembered) {
      Object.assign(state, { status: "learning", level: 0, dueAt: fact.at });
      continue;
    }
    state.level++;
    const wait = CARD_DAYS[state.level - 1];
    if (wait === undefined) Object.assign(state, { status: "learned", dueAt: null });
    else Object.assign(state, { status: "learning", dueAt: startOfDay(fact.at) + wait * DAY_MS });
  }
  return state;
}

export const isCardDue = (state: CardState, now: number) => state.status === "new" || (state.status === "learning" && state.dueAt !== null && state.dueAt <= now);

export interface LessonCard {
  key: string;
  discipline: string;
  topic: string;
  front: string;
  back: string;
}

const text = (html: string) =>
  html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

/**
 * Tira cartões de uma aula já revisada: cada item «<strong>termo</strong>: explicação» vira um cartão,
 * e o exemplo resolvido (pergunta no primeiro parágrafo, resposta no segundo) vira outro.
 */
export function cardsFromLesson(lesson: { discipline: string; topic: string; explanationHtml: string; exampleHtml: string }): LessonCard[] {
  const cards: LessonCard[] = [];
  const seen = new Set<string>();
  const add = (front: string, back: string) => {
    const key = `${lesson.discipline}|${lesson.topic}|${front}`;
    if (front.length < 2 || back.length < 12 || seen.has(key)) return;
    seen.add(key);
    cards.push({ key, discipline: lesson.discipline, topic: lesson.topic, front, back });
  };
  for (const [, li] of lesson.explanationHtml.matchAll(/<li>([\s\S]*?)<\/li>/g)) {
    const match = /^\s*<(strong|b)>([\s\S]*?)<\/\1>([\s\S]*)$/.exec(li!);
    if (!match) continue;
    const front = text(match[2]!);
    const back = text(match[3]!).replace(/^[:,.;–—-]\s*/, "");
    if (front.length <= 60) add(front, back);
  }
  const paragraphs = [...lesson.exampleHtml.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => text(m[1]!));
  if (paragraphs.length >= 2) add(paragraphs[0]!, paragraphs.slice(1).join(" "));
  return cards;
}

// Motivo do erro --------------------------------------------------------------------------

export const MISS_REASONS = ["content", "calc", "reading", "distraction"] as const;
export type MissReason = (typeof MISS_REASONS)[number];

export interface MissAdvice {
  dominant: MissReason;
  share: number;
  total: number;
  advice: string;
}

const ADVICE: Record<MissReason, string> = {
  content: "A maior parte dos seus erros é de conteúdo. Antes de treinar o assunto, veja a aula rápida dele.",
  calc: "Você sabe o caminho, mas erra a conta. Treine no modo guiado e confira o cálculo antes de marcar.",
  reading: "Seus erros vêm da leitura do enunciado. Os treinos de leitura ajudam a achar o que a questão pede.",
  distraction: "Muitos erros são por distração. Desacelere na conferência: releia o comando antes de confirmar.",
};

/** Mínimo de respostas para dar um conselho: com menos, um erro isolado decidiria tudo. */
export const MIN_MISSES_FOR_ADVICE = 3;

export function missAdvice(counts: Partial<Record<MissReason, number>>): MissAdvice | null {
  const total = MISS_REASONS.reduce((sum, r) => sum + (counts[r] ?? 0), 0);
  if (total < MIN_MISSES_FOR_ADVICE) return null;
  const dominant = [...MISS_REASONS].sort((x, y) => (counts[y] ?? 0) - (counts[x] ?? 0))[0]!;
  return { dominant, share: Math.round(((counts[dominant] ?? 0) / total) * 100), total, advice: ADVICE[dominant] };
}

// Estratégia de prova ---------------------------------------------------------------------

/** No ENEM são cerca de 3 minutos por questão (5h30 para 90 questões, com o cartão-resposta). */
export const ENEM_SECONDS_PER_QUESTION = 180;
const STUCK_FACTOR = 1.5;
const RUSHED_FACTOR = 0.25;

export interface StrategyAnswer {
  position: number;
  correct: boolean;
  totalMs: number;
  targetMs: number;
}

export interface StrategyReport {
  questions: number;
  correct: number;
  usedMs: number;
  budgetMs: number;
  /** Passou muito do tempo e errou mesmo assim: na prova, era hora de pular e voltar. */
  stuck: number[];
  /** Respondeu rápido demais e errou: sinal de leitura apressada. */
  rushed: number[];
  tips: string[];
}

export function strategyReport(answers: readonly StrategyAnswer[]): StrategyReport {
  const usedMs = answers.reduce((s, a) => s + a.totalMs, 0);
  const budgetMs = answers.length * ENEM_SECONDS_PER_QUESTION * 1000;
  const stuck = answers.filter((a) => !a.correct && a.totalMs > a.targetMs * STUCK_FACTOR).map((a) => a.position + 1);
  const rushed = answers.filter((a) => !a.correct && a.totalMs < a.targetMs * RUSHED_FACTOR).map((a) => a.position + 1);
  const stuckMs = answers.filter((a) => !a.correct && a.totalMs > a.targetMs * STUCK_FACTOR).reduce((s, a) => s + a.totalMs - a.targetMs, 0);
  const tips: string[] = [];
  const minutes = (ms: number) => Math.max(1, Math.round(ms / 60_000));
  if (stuck.length) tips.push(`Nas questões ${stuck.join(", ")} você passou muito do tempo-alvo e errou mesmo assim. Na prova, marque a questão, siga em frente e volte no fim: seriam ${minutes(stuckMs)} min a mais para as outras.`);
  if (usedMs > budgetMs) tips.push(`Você usou ${minutes(usedMs - budgetMs)} min a mais do que o ritmo do ENEM, de cerca de 3 min por questão. Comece pelas questões que você resolve rápido.`);
  if (rushed.length >= 2) tips.push(`Nas questões ${rushed.join(", ")} você respondeu muito rápido e errou. Leia o comando até o fim antes de olhar as alternativas.`);
  if (!tips.length && answers.length) tips.push("Ritmo de prova em dia: você ficou dentro do tempo e não travou em nenhuma questão.");
  return { questions: answers.length, correct: answers.filter((a) => a.correct).length, usedMs, budgetMs, stuck, rushed, tips };
}

// Reta final ------------------------------------------------------------------------------

/** A partir de quantos dias antes da prova o plano entra na reta final. */
export const FINAL_STRETCH_DAYS = 30;
/** Abaixo deste domínio o assunto ainda vale revisão na reta final. */
export const FINAL_STRETCH_MASTERY = 0.7;

export interface StretchTopic {
  discipline: string;
  topic: string;
  weight: number;
  mastery: number | null;
}

/** Na reta final só entram os assuntos que o aluno já viu, ainda erra e que mais caem. */
export function finalStretchTopics<T extends StretchTopic>(topics: readonly T[], limit = Infinity): T[] {
  return topics
    .filter((t) => t.mastery !== null && t.mastery < FINAL_STRETCH_MASTERY)
    .sort((x, y) => y.weight - x.weight || x.mastery! - y.mastery! || x.topic.localeCompare(y.topic))
    .slice(0, limit);
}
