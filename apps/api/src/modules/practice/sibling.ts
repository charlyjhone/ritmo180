// Questão irmã: depois de errar, o aluno prova que entendeu numa questão parecida, do mesmo assunto e dificuldade próxima.
import type { PracticeSessionPack } from "@ritmo/contracts";
import type { Tx } from "../../platform/db.ts";
import { HttpError } from "../../platform/http.ts";
import { loadCandidates, loadItems, toAnswerKey, toPracticeItem } from "../catalog/index.ts";
import { extraMinutesOf } from "./progress.ts";

/** Questões feitas há menos tempo que isto não voltam como irmã: seria lembrar a resposta, não entender. */
const RECENT_DAYS = 30;

export async function siblingItem(
  tx: Tx,
  student: { id: string },
  input: { sessionId: string; itemId: string; exclude: readonly string[] },
  now: number,
): Promise<PracticeSessionPack["items"][number] | null> {
  const owned = await tx.query(`SELECT 1 FROM practice_sessions WHERE id = $1 AND student_id = $2`, [input.sessionId, student.id]);
  if (!owned.length) throw new HttpError(404, "not_found", "Treino não encontrado.");
  const base = (await loadItems(tx, [input.itemId])).get(input.itemId);
  if (!base) throw new HttpError(404, "not_found", "Questão não encontrada.");
  const recent = new Set((await tx.query(
    `SELECT DISTINCT item_id FROM attempts WHERE student_id = $1 AND answered_at >= $2`,
    [student.id, new Date(now - RECENT_DAYS * 86_400_000)],
  )).map((r) => r.item_id as string));
  const skip = new Set([input.itemId, ...input.exclude, ...recent]);
  const b = base.irt?.b ?? 0;
  const pick = (await loadCandidates(tx, { discipline: base.discipline, topic: base.topic }))
    .filter((c) => !skip.has(c.id))
    .sort((x, y) => Math.abs((x.irt?.b ?? 0) - b) - Math.abs((y.irt?.b ?? 0) - b) || x.id.localeCompare(y.id))[0];
  if (!pick) return null;
  const item = (await loadItems(tx, [pick.id])).get(pick.id)!;
  return { ...toPracticeItem(item, await extraMinutesOf(tx, student.id)), key: toAnswerKey(item), reason: `Questão irmã: mesmo assunto (${item.topic}) e dificuldade parecida com a que você errou.` };
}
