// Direitos do titular: cópia dos dados e exclusão da identidade. O histórico fica sem nome para a estatística das questões.
import type { Tx } from "../../platform/db.ts";

export async function studentDataCopy(tx: Tx, studentId: string) {
  const person = (await tx.query(`SELECT name, email, grade, created_at FROM users WHERE id = $1`, [studentId]))[0];
  const list = (sql: string) => tx.query(sql, [studentId]);
  return {
    pessoa: person,
    turmas: await list(`SELECT c.name, c.grade FROM class_students cs JOIN classes c ON c.id = cs.class_id WHERE cs.student_id = $1`),
    responsavel: await list(`SELECT guardian_email, consent_at FROM guardian_contacts WHERE student_id = $1`),
    atendimento: await list(`SELECT kind, extra_minutes, resources FROM accommodations WHERE student_id = $1`),
    respostas: await list(`SELECT area, discipline, topic, mode, choice, correct, total_ms, answered_at FROM attempts WHERE student_id = $1 ORDER BY answered_at`),
    leitura: await list(`SELECT ppm, score, verdict, at FROM reading_attempts WHERE student_id = $1 ORDER BY at`),
    simulados: await list(`SELECT e.title, s.started_at, s.finished_at FROM exam_sittings s JOIN exams e ON e.id = s.exam_id WHERE s.student_id = $1`),
    meta: await list(`SELECT questions_per_week FROM student_goals WHERE student_id = $1`),
    mensagens: await list(`SELECT direction, author, body, created_at FROM family_messages WHERE student_id = $1`),
  };
}

export async function anonymizeStudent(tx: Tx, studentId: string, schoolId: string, now: number): Promise<void> {
  const when = new Date(now);
  await tx.query(
    `UPDATE users SET name = 'Aluno removido', email = NULL, pass_hash = NULL, pass_salt = NULL, grade = NULL, deactivated_at = $3, anonymized_at = $3
     WHERE id = $1 AND school_id = $2 AND role = 'student'`,
    [studentId, schoolId, when],
  );
  for (const table of ["guardian_contacts", "guardian_links", "accommodations", "family_messages", "class_students", "student_goals", "assignments", "learner_snapshots"]) {
    await tx.query(`DELETE FROM ${table} WHERE student_id = $1`, [studentId]);
  }
  await tx.query(`DELETE FROM sessions WHERE user_id = $1`, [studentId]);
}
