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
  /** Desempata questões de mesma prioridade, para alunos diferentes não receberem o mesmo treino. */
  seed?: string;
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

function tieBreak(seed: string, id: string): number {
  let hash = 0x811c9dc5;
  for (const char of seed + id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export function rankCandidates(candidates: readonly Candidate[], learner: LearnerSnapshot): PlannedItem[] {
  const history = historyOf(learner.attempts);
  const seed = learner.seed ?? "";
  return candidates
    .filter((item) => !isBlocked(history.get(item.id), learner.now))
    .map((item) => scoreCandidate(item, learner, history.get(item.id)))
    .sort((x, y) => y.score - x.score || tieBreak(seed, x.itemId) - tieBreak(seed, y.itemId) || x.itemId.localeCompare(y.itemId));
}

/**
 * Evita que um assunto ou uma disciplina ocupe a sessão inteira, sem deixar de priorizar os mais pesados.
 * Se faltar variedade no banco, completa a sessão acima do limite de disciplina.
 */
function pickVaried(
  ranked: readonly PlannedItem[],
  factsOf: (id: string) => Candidate,
  count: number,
  perDiscipline: Map<string, number>,
  maxPerDiscipline: number,
): PlannedItem[] {
  const maxPerTopic = Math.max(2, Math.ceil(count / 2));
  const picked = new Map<string, PlannedItem>();
  const perTopic = new Map<string, number>();
  for (const limitDiscipline of [true, false]) {
    for (const entry of ranked) {
      if (picked.size === count) break;
      if (picked.has(entry.itemId)) continue;
      const { topic, discipline } = factsOf(entry.itemId);
      const inTopic = perTopic.get(topic) ?? 0;
      const inDiscipline = perDiscipline.get(discipline) ?? 0;
      if (inTopic >= maxPerTopic || (limitDiscipline && inDiscipline >= maxPerDiscipline)) continue;
      perTopic.set(topic, inTopic + 1);
      perDiscipline.set(discipline, inDiscipline + 1);
      picked.set(entry.itemId, entry);
    }
  }
  return [...picked.values()];
}

const MINUTES_PER_ITEM = 3;

/** Monta os blocos do treino do dia. O texto de cada bloco explica o motivo com dados do próprio aluno. */
export function planSession(candidates: readonly Candidate[], learner: LearnerSnapshot, minutes = 25): PlannedBlock[] {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const ranked = rankCandidates(candidates, learner);
  const taken = new Set<string>();
  const blocks: PlannedBlock[] = [];
  const total = Math.max(3, Math.floor(minutes / MINUTES_PER_ITEM));
  const perDiscipline = new Map<string, number>();
  const maxPerDiscipline = Math.max(2, Math.ceil(total / 3));

  const addBlock = (kind: BlockKind, title: string, reason: string, count: number, filter: (c: Candidate) => boolean) => {
    const pool = ranked.filter((r) => !taken.has(r.itemId) && filter(byId.get(r.itemId)!));
    const items = pickVaried(pool, (id) => byId.get(id)!, count, perDiscipline, maxPerDiscipline);
    if (items.length === 0) return;
    items.forEach((i) => taken.add(i.itemId));
    blocks.push({ kind, title, reason, minutes: items.length * MINUTES_PER_ITEM, items });
  };

  const reviews = ranked.filter((r) => r.reason.startsWith("Revisão"));
  if (reviews.length > 0) {
    addBlock("REVISAO", "Revisão dos erros", `${reviews.length} ${reviews.length === 1 ? "erro pronto" : "erros prontos"} para rever`, Math.min(2, reviews.length), (c) => reviews.some((r) => r.itemId === c.id));
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
