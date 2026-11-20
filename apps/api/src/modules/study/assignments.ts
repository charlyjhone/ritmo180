// Tarefas do professor vistas pelo aluno: quantas questões do assunto ele já fez desde que a tarefa chegou.
import type { StudentAssignment } from "@ritmo/contracts";
import type { Tx } from "../../platform/db.ts";

/** Tarefas com prazo vencido ficam visíveis por mais alguns dias, para o aluno ainda poder terminar. */
const GRACE_DAYS = 3;
const OPEN_DAYS = 21;

const day = (value: unknown) => (value instanceof Date ? value.toISOString().slice(0, 10) : value ? String(value).slice(0, 10) : null);

export async function studentAssignments(tx: Tx, studentId: string, now: number): Promise<StudentAssignment[]> {
  const rows = await tx.query(
    `SELECT a.id, a.title, a.topic, a.due_on, a.questions, a.created_at, u.name AS teacher,
       (SELECT discipline FROM items i WHERE i.topic = a.topic AND i.status = 'published' LIMIT 1) AS discipline,
       (SELECT count(*)::int FROM attempts t WHERE t.student_id = $1 AND t.topic = a.topic AND t.answered_at >= a.created_at) AS done
     FROM assignments a JOIN users u ON u.id = a.teacher_id
     LEFT JOIN class_students cs ON cs.class_id = a.class_id AND cs.student_id = $1
     WHERE (a.student_id = $1 OR (a.student_id IS NULL AND cs.student_id IS NOT NULL))
       AND coalesce(a.due_on + $3::int, (a.created_at + make_interval(days => $4::int))::date) >= ($2::timestamptz - interval '3 hours')::date
     ORDER BY a.due_on NULLS LAST, a.created_at DESC`,
    [studentId, new Date(now), GRACE_DAYS, OPEN_DAYS],
  );
  return rows.map((r) => ({
    id: r.id, title: r.title, topic: r.topic, discipline: r.discipline ?? "", teacher: r.teacher, dueOn: day(r.due_on), questions: r.questions, done: Math.min(r.done, r.questions),
  }));
}
