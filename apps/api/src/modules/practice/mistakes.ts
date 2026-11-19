// Caderno de erros: toda questão cuja última tentativa foi errada. Acertar de novo tira a questão do caderno.
import type { Letter, MistakeBook } from "@ritmo/contracts";
import type { Tx } from "../../platform/db.ts";
import { loadItems } from "../catalog/index.ts";

const SHOWN = 100;

async function pendingRows(tx: Tx, studentId: string) {
  const rows = await tx.query(
    `SELECT DISTINCT ON (item_id) item_id, discipline, topic, choice, correct, answered_at,
       count(*) FILTER (WHERE NOT correct) OVER (PARTITION BY item_id)::int AS times
     FROM attempts WHERE student_id = $1 ORDER BY item_id, answered_at DESC, received_at DESC`,
    [studentId],
  );
  return rows.filter((r) => !r.correct);
}

export async function pendingMistakeIds(tx: Tx, studentId: string): Promise<Set<string>> {
  return new Set((await pendingRows(tx, studentId)).map((r) => r.item_id));
}

export async function mistakeBook(tx: Tx, studentId: string, filter: { discipline?: string; topic?: string }): Promise<MistakeBook> {
  const pending = await pendingRows(tx, studentId);
  const counts = new Map<string, MistakeBook["topics"][number]>();
  for (const r of pending) {
    const key = `${r.discipline}\n${r.topic}`;
    const entry = counts.get(key) ?? { discipline: r.discipline, topic: r.topic, count: 0 };
    entry.count++;
    counts.set(key, entry);
  }
  const shown = pending
    .filter((r) => (!filter.discipline || r.discipline === filter.discipline) && (!filter.topic || r.topic === filter.topic))
    .sort((x, y) => new Date(y.answered_at).getTime() - new Date(x.answered_at).getTime())
    .slice(0, SHOWN);
  const items = await loadItems(tx, shown.map((r) => r.item_id));
  return {
    total: pending.length,
    topics: [...counts.values()].sort((x, y) => y.count - x.count || x.topic.localeCompare(y.topic, "pt-BR")),
    questions: shown.filter((r) => items.has(r.item_id)).map((r) => {
      const item = items.get(r.item_id)!;
      return {
        itemId: item.id, discipline: item.discipline, topic: item.topic, contextHtml: item.contextHtml, stemHtml: item.stemHtml,
        alternatives: item.alternatives, answer: item.answer, choice: r.choice as Letter, solutionHtml: item.solutionHtml,
        times: r.times, lastWrongAt: new Date(r.answered_at).getTime(),
      };
    }),
  };
}
