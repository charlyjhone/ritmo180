// "Quero ver essa em sala": o aluno marca a questão e o professor vê, por turma, quais a turma mais quer ver resolvidas.
// O professor só vê a contagem. Ninguém fica exposto por ter dúvida.
import type { ClassRequestInput, ClassRequestView, Letter } from "@ritmo/contracts";
import type { Tx } from "../../platform/db.ts";
import { HttpError } from "../../platform/http.ts";
import { loadItems } from "../catalog/index.ts";

/** Quantas questões o professor vê de uma vez: o que cabe numa aula. */
export const REQUESTS_SHOWN = 5;

export async function setClassRequest(tx: Tx, student: { id: string; schoolId: string }, input: ClassRequestInput, now: number): Promise<{ wanted: boolean }> {
  if (!input.wanted) {
    await tx.query(`DELETE FROM class_requests WHERE student_id = $1 AND item_id = $2 AND done_at IS NULL`, [student.id, input.itemId]);
    return { wanted: false };
  }
  if (!(await tx.query(`SELECT 1 FROM items WHERE id = $1`, [input.itemId])).length) throw new HttpError(404, "not_found", "Questão não encontrada.");
  if (!(await tx.query(`SELECT 1 FROM class_students WHERE student_id = $1`, [student.id])).length) {
    throw new HttpError(409, "no_class", "Você ainda não está em uma turma. Peça à coordenação para incluir você.");
  }
  // Pedir de novo uma questão já corrigida reabre o pedido: a dúvida voltou.
  await tx.query(
    `INSERT INTO class_requests (school_id, student_id, item_id, at) VALUES ($1,$2,$3,$4)
     ON CONFLICT (student_id, item_id) DO UPDATE SET at = excluded.at, done_at = NULL`,
    [student.schoolId, student.id, input.itemId, new Date(now)],
  );
  return { wanted: true };
}

/** Pedidos em aberto dos alunos da turma, das questões mais pedidas para as menos. */
export async function classRequests(tx: Tx, studentIds: string[]): Promise<ClassRequestView[]> {
  if (!studentIds.length) return [];
  const rows = await tx.query(
    `SELECT item_id, count(*)::int AS students, max(at) AS last FROM class_requests
     WHERE student_id = ANY($1::uuid[]) AND done_at IS NULL GROUP BY item_id ORDER BY students DESC, last DESC LIMIT ${REQUESTS_SHOWN}`,
    [studentIds],
  );
  if (!rows.length) return [];
  const items = await loadItems(tx, rows.map((r) => r.item_id as string));
  const wrong = await tx.query(
    `SELECT item_id, choice, count(DISTINCT student_id)::int AS n FROM attempts
     WHERE item_id = ANY($1::uuid[]) AND student_id = ANY($2::uuid[]) AND NOT correct AND valid AND choice IS NOT NULL
     GROUP BY item_id, choice`,
    [rows.map((r) => r.item_id), studentIds],
  );
  return rows.flatMap((r) => {
    const item = items.get(r.item_id);
    if (!item) return [];
    const top = wrong.filter((w) => w.item_id === r.item_id).sort((a, b) => b.n - a.n)[0];
    return [{
      itemId: item.id, discipline: item.discipline, topic: item.topic, contextHtml: item.contextHtml, stemHtml: item.stemHtml,
      alternatives: item.alternatives.map((a) => ({ letter: a.letter, html: a.html })), answer: item.answer, solutionHtml: item.solutionHtml,
      students: r.students, commonWrong: top ? { letter: top.choice as Letter, students: top.n } : null,
    }];
  });
}

/** O professor corrigiu a questão em sala: fecha os pedidos dos alunos daquela turma. */
export async function closeClassRequests(tx: Tx, classId: string, itemId: string, now: number): Promise<number> {
  const rows = await tx.query(
    `UPDATE class_requests SET done_at = $3 WHERE item_id = $2 AND done_at IS NULL
     AND student_id IN (SELECT student_id FROM class_students WHERE class_id = $1) RETURNING 1`,
    [classId, itemId, new Date(now)],
  );
  return rows.length;
}
