// Meta de curso: a nota de corte que o aluno consultou no SISU, comparada à média das notas estimadas.
import { AREAS, type CourseGoalView } from "@ritmo/contracts";
import type { Tx } from "../../platform/db.ts";
import { computeSnapshot, irtFor, loadAttempts, scoreViewOf } from "../practice/index.ts";

export async function courseGoal(tx: Tx, studentId: string, now: number): Promise<CourseGoalView> {
  const row = (await tx.query(`SELECT course, institution, cutoff FROM course_goals WHERE student_id = $1`, [studentId]))[0];
  const attempts = await loadAttempts(tx, studentId);
  const { thetas } = computeSnapshot(studentId, attempts, await irtFor(tx, attempts), now);
  const scores = AREAS.map((area) => scoreViewOf(area, thetas[area])).filter((s) => s.score !== null);
  const estimate = scores.length ? Math.round(scores.reduce((sum, s) => sum + s.score!, 0) / scores.length) : null;
  const goal = row ? { course: row.course as string, institution: row.institution as string, cutoff: Number(row.cutoff) } : null;
  return { goal, estimate, measured: scores.map((s) => s.area), gap: goal && estimate !== null ? Math.round(goal.cutoff - estimate) : null };
}

export async function saveCourseGoal(tx: Tx, student: { id: string; schoolId: string }, goal: { course: string; institution: string; cutoff: number }): Promise<void> {
  await tx.query(
    `INSERT INTO course_goals (student_id, school_id, course, institution, cutoff) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (student_id) DO UPDATE SET course = excluded.course, institution = excluded.institution, cutoff = excluded.cutoff, updated_at = now()`,
    [student.id, student.schoolId, goal.course, goal.institution, goal.cutoff],
  );
}

export async function clearCourseGoal(tx: Tx, studentId: string): Promise<void> {
  await tx.query(`DELETE FROM course_goals WHERE student_id = $1`, [studentId]);
}
