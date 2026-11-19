// Cadastro de pessoas da escola: uma conta por vez, com turma, turmas ou alunos ligados conforme o perfil.
// Tudo roda dentro da escola (db.tenant), então as políticas de isolamento valem também aqui.
import { randomUUID } from "node:crypto";
import type { CreatePerson, Person, Role, SchoolClass, UpdatePerson } from "@ritmo/contracts";
import type { Database, Tx } from "../../platform/db.ts";
import { HttpError } from "../../platform/http.ts";
import { hashPassword, temporaryPassword } from "../identity/index.ts";

const LIMIT = 50;

/** O e-mail é único em toda a rede. A busca é feita fora da escola, porque a conta pode ser de outra. */
export async function assertEmailFree(db: Database, email: string): Promise<void> {
  const taken = await db.system((tx) => tx.query(`SELECT 1 FROM users WHERE lower(email) = lower($1)`, [email]));
  if (taken.length > 0) throw new HttpError(409, "email_taken", "Já existe uma conta com este e-mail.");
}

/** Cria a conta com senha provisória, que precisa ser trocada no primeiro acesso. */
export async function insertAccount(tx: Tx, input: { schoolId: string; name: string; email: string; role: Role; grade?: string | null }): Promise<{ id: string; temporaryPassword: string }> {
  const password = temporaryPassword();
  const { hash, salt } = await hashPassword(password);
  const id = randomUUID();
  await tx.query(
    `INSERT INTO users (id, school_id, email, name, role, pass_hash, pass_salt, grade, must_change_password) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)`,
    [id, input.schoolId, input.email.toLowerCase(), input.name, input.role, hash, salt, input.grade ?? null],
  );
  return { id, temporaryPassword: password };
}

/** Turma pelo nome; cria se ainda não existe. */
export async function ensureClass(tx: Tx, schoolId: string, name: string, grade: string): Promise<string> {
  await tx.query(`INSERT INTO classes (school_id, name, grade) VALUES ($1,$2,$3) ON CONFLICT (school_id, name) DO NOTHING`, [schoolId, name, grade]);
  return (await tx.query(`SELECT id FROM classes WHERE school_id = $1 AND name = $2`, [schoolId, name]))[0]!.id;
}

async function assertClasses(tx: Tx, classIds: string[]): Promise<void> {
  if (classIds.length === 0) return;
  const found = await tx.query(`SELECT id FROM classes WHERE id = ANY($1::uuid[])`, [classIds]);
  if (found.length !== new Set(classIds).size) throw new HttpError(422, "bad_class", "Uma das turmas não existe nesta escola.");
}

async function assertStudents(tx: Tx, studentIds: string[]): Promise<void> {
  const found = await tx.query(`SELECT id FROM users WHERE id = ANY($1::uuid[]) AND role = 'student' AND guest_expires_at IS NULL`, [studentIds]);
  if (found.length !== new Set(studentIds).size) throw new HttpError(422, "bad_student", "Um dos alunos não existe nesta escola.");
}

async function setStudentClass(tx: Tx, schoolId: string, studentId: string, name: string, grade: string): Promise<void> {
  const classId = await ensureClass(tx, schoolId, name, grade);
  await tx.query(`DELETE FROM class_students WHERE student_id = $1`, [studentId]);
  await tx.query(`INSERT INTO class_students (class_id, student_id, school_id) VALUES ($1,$2,$3)`, [classId, studentId, schoolId]);
  await tx.query(`UPDATE users SET grade = $2 WHERE id = $1`, [studentId, grade]);
}

async function setTeacherClasses(tx: Tx, schoolId: string, teacherId: string, classIds: string[]): Promise<void> {
  await assertClasses(tx, classIds);
  await tx.query(`DELETE FROM class_teachers WHERE teacher_id = $1 AND NOT (class_id = ANY($2::uuid[]))`, [teacherId, classIds]);
  for (const classId of new Set(classIds)) {
    await tx.query(`INSERT INTO class_teachers (class_id, teacher_id, school_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [classId, teacherId, schoolId]);
  }
}

async function setGuardianStudents(tx: Tx, schoolId: string, guardianId: string, studentIds: string[]): Promise<void> {
  await assertStudents(tx, studentIds);
  await tx.query(`DELETE FROM guardian_links WHERE guardian_id = $1 AND NOT (student_id = ANY($2::uuid[]))`, [guardianId, studentIds]);
  for (const studentId of new Set(studentIds)) {
    await tx.query(`INSERT INTO guardian_links (guardian_id, student_id, school_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [guardianId, studentId, schoolId]);
  }
}

export async function createPerson(tx: Tx, schoolId: string, input: CreatePerson): Promise<{ id: string; temporaryPassword: string }> {
  // Os vínculos são conferidos antes de criar a conta, para não sobrar conta sem turma ou sem aluno.
  if (input.role === "teacher") await assertClasses(tx, input.classIds);
  if (input.role === "guardian") await assertStudents(tx, input.studentIds);
  const created = await insertAccount(tx, { schoolId, name: input.name, email: input.email, role: input.role, grade: input.role === "student" ? input.grade : null });
  if (input.role === "student") {
    await setStudentClass(tx, schoolId, created.id, input.className, input.grade);
    await tx.query(`INSERT INTO guardian_contacts (student_id, school_id, guardian_email, consent_at) VALUES ($1,$2,$3,$4)`, [created.id, schoolId, input.guardianEmail, input.consent ? new Date() : null]);
  }
  if (input.role === "teacher") await setTeacherClasses(tx, schoolId, created.id, input.classIds);
  if (input.role === "guardian") await setGuardianStudents(tx, schoolId, created.id, input.studentIds);
  return created;
}

export async function updatePerson(tx: Tx, schoolId: string, personId: string, input: UpdatePerson): Promise<void> {
  const person = (await tx.query(`SELECT role, grade FROM users WHERE id = $1 AND guest_expires_at IS NULL`, [personId]))[0];
  if (!person) throw new HttpError(404, "not_found", "Pessoa não encontrada nesta escola.");
  if (input.name) await tx.query(`UPDATE users SET name = $2 WHERE id = $1`, [personId, input.name]);
  if (person.role === "student" && input.className) {
    const grade = input.grade ?? person.grade;
    if (!grade) throw new HttpError(422, "grade_required", "Escolha a série da turma.");
    await setStudentClass(tx, schoolId, personId, input.className, grade);
  }
  if (person.role === "teacher" && input.classIds) await setTeacherClasses(tx, schoolId, personId, input.classIds);
  if (person.role === "guardian" && input.studentIds) await setGuardianStudents(tx, schoolId, personId, input.studentIds);
}

/** Desativar fecha as sessões abertas; a conta deixa de entrar, mas os dados ficam. */
export async function setActive(tx: Tx, personId: string, active: boolean, now: number): Promise<void> {
  const updated = await tx.query(
    `UPDATE users SET deactivated_at = $2 WHERE id = $1 AND guest_expires_at IS NULL RETURNING id`,
    [personId, active ? null : new Date(now)],
  );
  if (updated.length === 0) throw new HttpError(404, "not_found", "Pessoa não encontrada nesta escola.");
  if (!active) await tx.query(`DELETE FROM sessions WHERE user_id = $1`, [personId]);
}

export async function listClasses(tx: Tx): Promise<SchoolClass[]> {
  return (await tx.query(`SELECT id, name, grade FROM classes ORDER BY grade, name`)).map((r) => ({ id: r.id, name: r.name, grade: r.grade }));
}

export async function listPeople(tx: Tx, query: { q?: string; role?: string; inactive?: boolean }): Promise<Person[]> {
  const search = `%${(query.q ?? "").trim().toLowerCase()}%`;
  const rows = await tx.query(
    `SELECT u.id, u.name, u.email, u.role, u.deactivated_at, gc.consent_at,
       coalesce((SELECT json_agg(json_build_object('id', c.id, 'name', c.name) ORDER BY c.name) FROM (
         SELECT c.id, c.name FROM class_students cs JOIN classes c ON c.id = cs.class_id WHERE cs.student_id = u.id
         UNION SELECT c.id, c.name FROM class_teachers ct JOIN classes c ON c.id = ct.class_id WHERE ct.teacher_id = u.id) c), '[]') AS classes,
       coalesce((SELECT json_agg(json_build_object('id', s.id, 'name', s.name) ORDER BY s.name)
         FROM guardian_links gl JOIN users s ON s.id = gl.student_id WHERE gl.guardian_id = u.id), '[]') AS students
     FROM users u LEFT JOIN guardian_contacts gc ON gc.student_id = u.id
     WHERE u.guest_expires_at IS NULL AND ($2::text IS NULL OR u.role = $2) AND ($3 OR u.deactivated_at IS NULL)
       AND (lower(u.name) LIKE $1 OR lower(coalesce(u.email, '')) LIKE $1)
     ORDER BY u.deactivated_at IS NOT NULL, u.name LIMIT ${LIMIT}`,
    [search, query.role ?? null, query.inactive === true],
  );
  return rows.map((r) => {
    const classes = (typeof r.classes === "string" ? JSON.parse(r.classes) : r.classes) as Person["classes"];
    const students = (typeof r.students === "string" ? JSON.parse(r.students) : r.students) as Person["students"];
    return {
      id: r.id, name: r.name, email: r.email, role: r.role,
      className: r.role === "student" ? (classes[0]?.name ?? null) : null,
      classes, students,
      consentAt: r.consent_at ? new Date(r.consent_at).getTime() : null,
      active: r.deactivated_at === null,
    };
  });
}
