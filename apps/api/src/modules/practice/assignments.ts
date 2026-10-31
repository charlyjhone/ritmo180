import { randomUUID } from "node:crypto";
import type { Tx } from "../../platform/db.ts";

export async function createAssignment(
  tx: Tx,
  input: { schoolId: string; classId: string; teacherId: string; title: string; topic: string; studentId?: string },
): Promise<string> {
  const id = randomUUID();
  await tx.query(
    `INSERT INTO assignments (id, school_id, class_id, student_id, teacher_id, title, topic) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, input.schoolId, input.classId, input.studentId ?? null, input.teacherId, input.title, input.topic],
  );
  return id;
}
