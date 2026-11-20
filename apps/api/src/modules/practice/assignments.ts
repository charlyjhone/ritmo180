import { randomUUID } from "node:crypto";
import type { Tx } from "../../platform/db.ts";

export async function createAssignment(
  tx: Tx,
  input: { schoolId: string; classId: string; teacherId: string; title: string; topic: string; studentId?: string; questions?: number; dueOn?: string },
): Promise<string> {
  const id = randomUUID();
  await tx.query(
    `INSERT INTO assignments (id, school_id, class_id, student_id, teacher_id, title, topic, questions, due_on) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, input.schoolId, input.classId, input.studentId ?? null, input.teacherId, input.title, input.topic, input.questions ?? 10, input.dueOn ?? null],
  );
  return id;
}
