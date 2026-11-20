// Relato de erro em questão feito pelo aluno. Vira (ou reforça) um item na fila de revisão do professor.
import { ITEM_PROBLEM_LABELS, type ItemReportInput } from "@ritmo/contracts";
import type { Tx } from "../../platform/db.ts";
import { HttpError } from "../../platform/http.ts";

/** Texto da fila de revisão: o professor vê o tipo do problema, nunca quem relatou. */
export const reportFlagReason = (problem: ItemReportInput["problem"]) => `Aluno relatou: ${ITEM_PROBLEM_LABELS[problem].toLowerCase()}`;

export async function reportItem(tx: Tx, student: { id: string; schoolId: string }, input: ItemReportInput, now: number): Promise<{ ok: true }> {
  const item = (await tx.query(`SELECT 1 FROM items WHERE id = $1`, [input.itemId]))[0];
  if (!item) throw new HttpError(404, "not_found", "Questão não encontrada.");
  await tx.query(
    `INSERT INTO item_reports (school_id, student_id, item_id, problem, at) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (student_id, item_id) DO UPDATE SET problem = excluded.problem, at = excluded.at`,
    [student.schoolId, student.id, input.itemId, input.problem, new Date(now)],
  );
  await tx.query(`INSERT INTO item_flags (item_id, reason) VALUES ($1, $2) ON CONFLICT (item_id, reason) DO NOTHING`, [input.itemId, reportFlagReason(input.problem)]);
  return { ok: true };
}
