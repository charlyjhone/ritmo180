// Caderno de erros com revisão espaçada: a questão entra quando o aluno erra ou acerta no chute,
// é refeita e volta em 2, 7 e 21 dias. O estado de cada questão sai do histórico de tentativas.
import type { Letter, MistakeBook } from "@ritmo/contracts";
import { isReviewDueNow, reviewState, type Confidence, type ReviewState } from "@ritmo/engine";
import type { Tx } from "../../platform/db.ts";
import { loadItems } from "../catalog/index.ts";

const SHOWN = 100;

interface Entry {
  itemId: string;
  discipline: string;
  topic: string;
  lastChoice: Letter;
  lastAt: number;
  state: ReviewState;
}

async function entries(tx: Tx, studentId: string): Promise<Entry[]> {
  const rows = await tx.query(
    `SELECT item_id, discipline, topic, choice, correct, confidence, answered_at FROM attempts
     WHERE student_id = $1 AND item_id IN (SELECT item_id FROM attempts WHERE student_id = $1 AND (NOT correct OR confidence = 'guess'))
     ORDER BY item_id, answered_at, received_at`,
    [studentId],
  );
  const byItem = new Map<string, typeof rows>();
  for (const r of rows) byItem.set(r.item_id, [...(byItem.get(r.item_id) ?? []), r]);
  return [...byItem.entries()].map(([itemId, list]) => {
    const last = list[list.length - 1]!;
    return {
      itemId, discipline: last.discipline, topic: last.topic, lastChoice: last.choice as Letter, lastAt: new Date(last.answered_at).getTime(),
      state: reviewState(list.map((r) => ({ correct: r.correct, confidence: (r.confidence ?? null) as Confidence | null, answeredAt: new Date(r.answered_at).getTime() }))),
    };
  });
}

/** Questões para rever hoje e o motivo de cada uma. */
export async function dueReviews(tx: Tx, studentId: string, now: number): Promise<Map<string, ReviewState["status"]>> {
  return new Map((await entries(tx, studentId)).filter((e) => isReviewDueNow(e.state, now)).map((e) => [e.itemId, e.state.status]));
}

export async function reviewCounts(tx: Tx, studentId: string, now: number): Promise<{ due: number; upcoming: number }> {
  const open = (await entries(tx, studentId)).filter((e) => e.state.status !== "clear");
  const due = open.filter((e) => isReviewDueNow(e.state, now)).length;
  return { due, upcoming: open.length - due };
}

/** Primeiro o erro com certeza, depois os demais erros, depois as revisões; dentro de cada grupo, o mais recente. */
const priority = (e: Entry) => (e.state.sureMiss ? 0 : e.state.status === "redo" ? 1 : 2);

export async function mistakeBook(tx: Tx, studentId: string, filter: { discipline?: string; topic?: string }, now: number): Promise<MistakeBook> {
  const open = (await entries(tx, studentId)).filter((e) => e.state.status !== "clear");
  const due = open.filter((e) => isReviewDueNow(e.state, now));
  const later = open.filter((e) => !isReviewDueNow(e.state, now));
  const counts = new Map<string, MistakeBook["topics"][number]>();
  for (const e of due) {
    const key = `${e.discipline}\n${e.topic}`;
    const entry = counts.get(key) ?? { discipline: e.discipline, topic: e.topic, count: 0 };
    entry.count++;
    counts.set(key, entry);
  }
  const shown = due
    .filter((e) => (!filter.discipline || e.discipline === filter.discipline) && (!filter.topic || e.topic === filter.topic))
    .sort((x, y) => priority(x) - priority(y) || y.lastAt - x.lastAt)
    .slice(0, SHOWN);
  const items = await loadItems(tx, shown.map((e) => e.itemId));
  return {
    total: due.length,
    topics: [...counts.values()].sort((x, y) => y.count - x.count || x.topic.localeCompare(y.topic, "pt-BR")),
    upcoming: { count: later.length, nextDueAt: later.length ? Math.min(...later.map((e) => e.state.dueAt!)) : null },
    questions: shown.filter((e) => items.has(e.itemId)).map((e) => {
      const item = items.get(e.itemId)!;
      return {
        itemId: item.id, discipline: item.discipline, topic: item.topic, contextHtml: item.contextHtml, stemHtml: item.stemHtml,
        alternatives: item.alternatives, answer: item.answer, choice: e.lastChoice, solutionHtml: item.solutionHtml,
        times: e.state.misses, lastWrongAt: e.state.lastMissAt,
        kind: e.state.status === "spaced" ? "spaced" : "redo", step: e.state.step, sureMiss: e.state.sureMiss, guessed: e.state.guessed,
      };
    }),
  };
}
