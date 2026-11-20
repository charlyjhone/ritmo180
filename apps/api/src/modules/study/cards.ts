// Cartões de memorização tirados das aulas revisadas, com revisão espaçada.
import type { CardDeck, CardReview, CardView } from "@ritmo/contracts";
import { cardsFromLesson, cardState, isCardDue, type CardFact, type LessonCard } from "@ritmo/engine";
import type { Tx } from "../../platform/db.ts";

/** Cartões novos por dia: muitos de uma vez viram decoreba e o aluno desiste. */
export const NEW_CARDS_PER_DAY = 20;
const SHOWN = 60;

export async function publishedCards(tx: Tx): Promise<LessonCard[]> {
  const lessons = await tx.query(`SELECT discipline, topic, explanation_html, example_html FROM lessons WHERE status = 'published' ORDER BY discipline, topic`);
  return lessons.flatMap((l) => cardsFromLesson({ discipline: l.discipline, topic: l.topic, explanationHtml: l.explanation_html, exampleHtml: l.example_html }));
}

async function factsOf(tx: Tx, studentId: string): Promise<Map<string, CardFact[]>> {
  const rows = await tx.query(`SELECT card_key, remembered, at FROM card_reviews WHERE student_id = $1 ORDER BY at`, [studentId]);
  const out = new Map<string, CardFact[]>();
  for (const r of rows) out.set(r.card_key, [...(out.get(r.card_key) ?? []), { remembered: r.remembered, at: new Date(r.at).getTime() }]);
  return out;
}

/**
 * Primeiro as revisões vencidas, depois os cartões novos dos assuntos que o aluno já treina (os mais fracos antes).
 * `topic` restringe o baralho a um assunto.
 */
export async function cardDeck(tx: Tx, studentId: string, now: number, filter: { discipline?: string; topic?: string } = {}, mastery: Record<string, number> = {}): Promise<CardDeck> {
  const cards = await publishedCards(tx);
  const facts = await factsOf(tx, studentId);
  const states = cards.map((card) => ({ card, state: cardState(facts.get(card.key) ?? []) }));
  const due = states.filter((s) => isCardDue(s.state, now));
  const topics = new Map<string, CardDeck["topics"][number]>();
  for (const { card } of due) {
    const key = `${card.discipline}\n${card.topic}`;
    const entry = topics.get(key) ?? { discipline: card.discipline, topic: card.topic, due: 0 };
    entry.due++;
    topics.set(key, entry);
  }
  const weakness = (c: LessonCard) => (c.topic in mastery ? mastery[c.topic]! : 2);
  const matches = (c: LessonCard) => (!filter.discipline || c.discipline === filter.discipline) && (!filter.topic || c.topic === filter.topic);
  const reviews = due.filter((s) => s.state.status === "learning" && matches(s.card)).sort((x, y) => x.state.dueAt! - y.state.dueAt!);
  const newToday = await newCardsToday(tx, studentId, now);
  const fresh = due.filter((s) => s.state.status === "new" && matches(s.card)).sort((x, y) => weakness(x.card) - weakness(y.card)).slice(0, Math.max(0, NEW_CARDS_PER_DAY - newToday));
  const view = ({ card, state }: (typeof states)[number]): CardView => ({ ...card, status: state.status === "new" ? "new" : "learning" });
  return {
    due: [...reviews, ...fresh].slice(0, SHOWN).map(view),
    total: cards.length,
    learned: states.filter((s) => s.state.status === "learned").length,
    learning: states.filter((s) => s.state.status === "learning").length,
    topics: [...topics.values()].sort((x, y) => y.due - x.due || x.topic.localeCompare(y.topic, "pt-BR")),
  };
}

const BRT_OFFSET_MS = 3 * 3_600_000;
const DAY_MS = 86_400_000;

async function newCardsToday(tx: Tx, studentId: string, now: number): Promise<number> {
  const today = new Date(Math.floor((now - BRT_OFFSET_MS) / DAY_MS) * DAY_MS + BRT_OFFSET_MS);
  const rows = await tx.query(
    `SELECT count(*)::int AS n FROM (SELECT card_key FROM card_reviews WHERE student_id = $1 GROUP BY card_key HAVING min(at) >= $2) first_seen`,
    [studentId, today],
  );
  return rows[0]?.n ?? 0;
}

/** Revisões em atraso contam do mesmo jeito; só não aceitamos data no futuro. */
export async function recordCardReviews(tx: Tx, student: { id: string; schoolId: string }, reviews: readonly CardReview[], now: number): Promise<{ saved: number }> {
  let saved = 0;
  for (const r of reviews) {
    const rows = await tx.query(
      `INSERT INTO card_reviews (id, school_id, student_id, card_key, remembered, at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING RETURNING id`,
      [r.id, student.schoolId, student.id, r.key, r.remembered, new Date(Math.min(r.at, now))],
    );
    saved += rows.length;
  }
  return { saved };
}

export async function dueCardCount(tx: Tx, studentId: string, now: number): Promise<number> {
  const facts = await factsOf(tx, studentId);
  let due = 0;
  for (const keyFacts of facts.values()) if (isCardDue(cardState(keyFacts), now) && keyFacts.length > 0) due++;
  return due;
}
