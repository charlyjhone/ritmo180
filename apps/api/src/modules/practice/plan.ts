// Plano do aluno até o ENEM: cruza as lacunas dele com os assuntos que têm questões para treinar.
import type { StudyPlan } from "@ritmo/contracts";
import { isFinalStretch, nextEnem, planUntilEnem } from "@ritmo/engine";
import type { Tx } from "../../platform/db.ts";
import { computeSnapshot, irtFor, loadAttempts } from "./progress.ts";

const MIN_QUESTIONS = 5;

export async function studyPlan(tx: Tx, studentId: string, now: number): Promise<StudyPlan> {
  const attempts = await loadAttempts(tx, studentId);
  const { mastery } = computeSnapshot(studentId, attempts, await irtFor(tx, attempts), now);
  const topics = await tx.query(
    `SELECT t.discipline, t.topic, t.weight FROM topics t
     JOIN items i ON i.area = t.area AND i.discipline = t.discipline AND i.topic = t.topic AND i.status = 'published'
     GROUP BY t.discipline, t.topic, t.weight HAVING count(*) >= $1`,
    [MIN_QUESTIONS],
  );
  const priorities = topics.map((t) => ({ discipline: t.discipline, topic: t.topic, weight: t.weight, mastery: mastery[t.topic]?.mastery ?? null }));
  const days: StudyPlan["days"] = planUntilEnem(now, priorities);
  const today = days[0];
  const finalStretch = isFinalStretch(nextEnem(now));
  if (!today) return { enem: nextEnem(now), finalStretch, days };
  const since = new Date(`${today.date}T00:00:00-03:00`);
  if (today.kind === "focus") today.done = attempts.some((a) => a.answeredAt >= since.getTime() && a.topic === today.topic);
  if (today.kind === "simulado") {
    const finished = await tx.query(`SELECT 1 FROM exam_sittings WHERE student_id = $1 AND finished_at >= $2 LIMIT 1`, [studentId, since]);
    today.done = finished.length > 0;
  }
  return { enem: nextEnem(now), finalStretch, days };
}
