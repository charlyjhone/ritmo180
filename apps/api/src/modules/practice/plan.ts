// Plano do aluno até o ENEM: cruza as lacunas dele com os assuntos que têm questões para treinar.
import type { StudyPlan } from "@ritmo/contracts";
import { nextEnem, planUntilEnem } from "@ritmo/engine";
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
  return { enem: nextEnem(now), days: planUntilEnem(now, priorities) };
}
