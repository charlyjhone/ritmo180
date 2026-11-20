// Motivo do erro: o aluno diz por que errou e o Ritmo responde com o que treinar.
import type { MissReason, MissReasonInput, StudentDashboard } from "@ritmo/contracts";
import { missAdvice } from "@ritmo/engine";
import type { Tx } from "../../platform/db.ts";
import { HttpError } from "../../platform/http.ts";

const WINDOW_MS = 45 * 86_400_000;

export async function recordMissReason(tx: Tx, student: { id: string; schoolId: string }, input: MissReasonInput, now: number): Promise<void> {
  const item = (await tx.query(`SELECT discipline, topic FROM items WHERE id = $1`, [input.itemId]))[0];
  if (!item) throw new HttpError(404, "not_found", "Questão não encontrada.");
  await tx.query(
    `INSERT INTO miss_reasons (attempt_id, school_id, student_id, item_id, discipline, topic, reason, at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (attempt_id) DO UPDATE SET reason = excluded.reason, at = excluded.at WHERE miss_reasons.student_id = excluded.student_id`,
    [input.attemptId, student.schoolId, student.id, input.itemId, item.discipline, item.topic, input.reason, new Date(now)],
  );
}

export async function missSummary(tx: Tx, studentId: string, now: number): Promise<StudentDashboard["missAdvice"]> {
  const rows = await tx.query(
    `SELECT reason, count(*)::int AS n FROM miss_reasons WHERE student_id = $1 AND at >= $2 GROUP BY reason`,
    [studentId, new Date(now - WINDOW_MS)],
  );
  const advice = missAdvice(Object.fromEntries(rows.map((r) => [r.reason, r.n])) as Partial<Record<MissReason, number>>);
  if (!advice) return null;
  let action = { label: "Treinar no modo guiado", to: "/treino" };
  if (advice.dominant === "reading") action = { label: "Treinar leitura", to: "/leitura" };
  if (advice.dominant === "content") {
    const topic = (await tx.query(
      `SELECT discipline, topic FROM miss_reasons WHERE student_id = $1 AND reason = 'content' AND at >= $2 GROUP BY discipline, topic ORDER BY count(*) DESC, max(at) DESC LIMIT 1`,
      [studentId, new Date(now - WINDOW_MS)],
    ))[0];
    action = topic
      ? { label: `Ver a aula de ${topic.topic}`, to: `/aula?${new URLSearchParams({ disciplina: topic.discipline, assunto: topic.topic })}` }
      : { label: "Ver as aulas", to: "/aulas" };
  }
  return { ...advice, action };
}
