// Seleção da próxima questão: combina peso do assunto no ENEM, lacuna do aluno, informação e revisão de erros.
import { information } from "./irt.ts";
import type { AttemptFact, ItemFacts } from "./types.ts";
import type { Phase } from "./diagnosis.ts";

export type BlockKind = "LEITURA" | "SPRINT" | "CORRIDA" | "REVISAO";

export interface Candidate extends ItemFacts {
  /** Participação histórica do assunto nas provas (0 a 1). */
  topicWeight: number;
}

export interface LearnerSnapshot {
  theta: number | null;
  mastery: ReadonlyMap<string, number>;
  bottleneck: Phase | null;
  attempts: readonly AttemptFact[];
  now: number;
}

export interface PlannedItem {
  itemId: string;
  reason: string;
  score: number;
}

export interface PlannedBlock {
  kind: BlockKind;
  title: string;
  reason: string;
  minutes: number;
  items: PlannedItem[];
}

const DAY_MS = 86_400_000;
const REVIEW_AFTER_DAYS = 3;
const NO_REPEAT_DAYS = 21;
const LONG_TEXT_WORDS = 90;
const SHORT_TEXT_WORDS = 45;

interface ItemHistory {
  lastSeen: number;
  lastCorrect: boolean;
}

function historyOf(attempts: readonly AttemptFact[]): Map<string, ItemHistory> {
  const history = new Map<string, ItemHistory>();
  for (const a of attempts) {
    const seen = history.get(a.itemId);
    if (!seen || a.answeredAt > seen.lastSeen) history.set(a.itemId, { lastSeen: a.answeredAt, lastCorrect: a.correct });
  }
  return history;
}

function isReviewDue(h: ItemHistory | undefined, now: number): boolean {
  return !!h && !h.lastCorrect && now - h.lastSeen >= REVIEW_AFTER_DAYS * DAY_MS;
}

function isBlocked(h: ItemHistory | undefined, now: number): boolean {
  if (!h) return false;
  return !isReviewDue(h, now) && now - h.lastSeen < NO_REPEAT_DAYS * DAY_MS;
}

/** Nota de prioridade de um item para este aluno. */
export function scoreCandidate(item: Candidate, learner: LearnerSnapshot, history: ItemHistory | undefined): PlannedItem {
  const mastery = learner.mastery.get(item.topic) ?? 0.5;
  const gap = 1 - mastery;
  let score = item.topicWeight * 4 + gap * 2;
  let reason = gap >= 0.4 ? `Lacuna em ${item.topic}` : `Assunto de peso no ENEM: ${item.topic}`;

  if (item.irt && learner.theta !== null) {
    score += Math.min(1.5, information(learner.theta, item.irt));
  }
  if (isReviewDue(history, learner.now)) {
    score += 3;
    reason = `Revisão de um erro em ${item.topic}`;
  }
  return { itemId: item.id, reason, score };
}

export function rankCandidates(candidates: readonly Candidate[], learner: LearnerSnapshot): PlannedItem[] {
  const history = historyOf(learner.attempts);
  return candidates
    .filter((item) => !isBlocked(history.get(item.id), learner.now))
    .map((item) => scoreCandidate(item, learner, history.get(item.id)))
    .sort((x, y) => y.score - x.score || x.itemId.localeCompare(y.itemId));
}

/** Evita que um assunto ocupe a sessão inteira, sem deixar de priorizar os mais pesados. */
function pickVaried(ranked: readonly PlannedItem[], topicOf: (id: string) => string, count: number, maxPerTopic: number): PlannedItem[] {
  const picked: PlannedItem[] = [];
  const perTopic = new Map<string, number>();
  for (const entry of ranked) {
    if (picked.length === count) break;
    const topic = topicOf(entry.itemId);
    const used = perTopic.get(topic) ?? 0;
    if (used >= maxPerTopic) continue;
    perTopic.set(topic, used + 1);
    picked.push(entry);
  }
  return picked;
}

const MINUTES_PER_ITEM = 3;

/** Monta os blocos do treino do dia. O texto de cada bloco explica o motivo com dados do próprio aluno. */
export function planSession(candidates: readonly Candidate[], learner: LearnerSnapshot, minutes = 25): PlannedBlock[] {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const topicOf = (id: string) => byId.get(id)?.topic ?? "";
  const ranked = rankCandidates(candidates, learner);
  const taken = new Set<string>();
  const blocks: PlannedBlock[] = [];

  const addBlock = (kind: BlockKind, title: string, reason: string, count: number, filter: (c: Candidate) => boolean) => {
    const pool = ranked.filter((r) => !taken.has(r.itemId) && filter(byId.get(r.itemId)!));
    const items = pickVaried(pool, topicOf, count, Math.max(2, Math.ceil(count / 2)));
    if (items.length === 0) return;
    items.forEach((i) => taken.add(i.itemId));
    blocks.push({ kind, title, reason, minutes: items.length * MINUTES_PER_ITEM, items });
  };

  const total = Math.max(3, Math.floor(minutes / MINUTES_PER_ITEM));
  const reviews = ranked.filter((r) => r.reason.startsWith("Revisão"));
  if (reviews.length > 0) {
    addBlock("REVISAO", "Revisão dos erros", `${reviews.length} erro(s) prontos para rever`, Math.min(2, reviews.length), (c) => reviews.some((r) => r.itemId === c.id));
  }
  if (learner.bottleneck === "readMs") {
    addBlock("LEITURA", "Questões com texto-base longo", "Ataca seu maior gargalo de tempo", Math.ceil(total / 3), (c) => c.wordCount >= LONG_TEXT_WORDS);
  }
  if (learner.bottleneck === "calcMs") {
    addBlock("SPRINT", "Questões curtas de cálculo", "Ataca seu gargalo de cálculo", Math.ceil(total / 3), (c) => c.wordCount <= SHORT_TEXT_WORDS);
  }
  const used = blocks.reduce((sum, b) => sum + b.items.length, 0);
  addBlock("CORRIDA", "Corrida contra o tempo-alvo", "Escolhidas por peso no ENEM e pelas suas lacunas", Math.max(0, total - used), () => true);
  return blocks;
}
