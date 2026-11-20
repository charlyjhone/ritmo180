// Desafio da turma: uma meta coletiva da semana. Mostra o esforço do grupo, nunca uma lista de quem ficou para trás.
import type { ClassChallenge } from "@ritmo/contracts";
import type { Tx } from "../../platform/db.ts";

/** Questões por aluno na semana: perto da meta padrão de 35, para o desafio ser alcançável. */
export const CHALLENGE_PER_STUDENT = 30;
export const STEADY_DAYS = 3;
const DAY_MS = 86_400_000;
const BRT_OFFSET_MS = 3 * 3_600_000;

export function weekStart(now: number): number {
  const local = new Date(now - BRT_OFFSET_MS);
  const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + BRT_OFFSET_MS;
  return today - ((local.getUTCDay() + 6) % 7) * DAY_MS;
}

export async function classChallenge(tx: Tx, classId: string, now: number): Promise<ClassChallenge | null> {
  const klass = (await tx.query(`SELECT name, (SELECT count(*)::int FROM class_students cs WHERE cs.class_id = c.id) AS students FROM classes c WHERE id = $1`, [classId]))[0];
  if (!klass || klass.students === 0) return null;
  const rows = await tx.query(
    `SELECT a.student_id, count(*)::int AS answers, count(DISTINCT date_trunc('day', a.answered_at - interval '3 hours'))::int AS days
     FROM attempts a JOIN class_students cs ON cs.student_id = a.student_id AND cs.class_id = $1
     WHERE a.answered_at >= $2 GROUP BY a.student_id`,
    [classId, new Date(weekStart(now))],
  );
  return {
    className: klass.name,
    target: klass.students * CHALLENGE_PER_STUDENT,
    done: rows.reduce((sum, r) => sum + r.answers, 0),
    students: klass.students,
    steady: rows.filter((r) => r.days >= STEADY_DAYS).length,
    steadyDays: STEADY_DAYS,
  };
}

export async function studentClassId(tx: Tx, studentId: string): Promise<string | null> {
  return (await tx.query(`SELECT class_id FROM class_students WHERE student_id = $1 LIMIT 1`, [studentId]))[0]?.class_id ?? null;
}
