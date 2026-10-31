// Escola de demonstração: nada de painel fixo. Alunos simulados respondem pelo mesmo caminho dos alunos reais.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeItems, parseCanonicalJson } from "@ritmo/ingest";
import { READING_GOALS, SeededRng, simulateCorrect, simulatePhases, targetSeconds, type IrtParams } from "@ritmo/engine";
import type { AttemptInput } from "@ritmo/contracts";
import type { Database, Tx } from "../platform/db.ts";
import { hashPassword } from "../modules/identity/index.ts";
import { loadServable, toCandidate, type CatalogItem } from "../modules/catalog/index.ts";
import { createSessionRow, recordAttempts, refreshSnapshot } from "../modules/practice/index.ts";
import { createExam } from "../modules/exam/index.ts";
import { runCalibration } from "../modules/calibration/index.ts";
import { ENERGY_ITEMS } from "./content.ts";
import { importBatch, installBaseContent } from "./install.ts";

const DAY_MS = 86_400_000;
const FILE = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const DOMAIN = "demo.ritmo180.test";

const FIRST = ["Ana", "Bruno", "Carla", "Davi", "Eduarda", "Felipe", "Gabriela", "Heitor", "Isabela", "João", "Karen", "Lucas", "Marina", "Nicolas", "Olívia", "Pedro", "Quésia", "Rafael", "Sofia", "Tiago"];
const LAST = ["Lima", "Souza", "Martins", "Rocha", "Pereira", "Teixeira", "Nunes", "Costa", "Almeida", "Barbosa", "Cardoso", "Dias", "Ferreira", "Gomes", "Ramos", "Silva"];

const CLASSES = [
  { name: "9º ano A", grade: "9º ano", theta: -0.9 },
  { name: "1ª série A", grade: "1ª série", theta: -0.5 },
  { name: "2ª série A", grade: "2ª série", theta: -0.2 },
  { name: "3ª série A", grade: "3ª série", theta: 0.25 },
  { name: "3ª série B", grade: "3ª série", theta: 0.05 },
];

interface Options {
  now: number;
  password: string;
  studentsPerClass?: number;
  days?: number;
}

export interface DemoAccounts {
  schoolId: string;
  pendingSchoolId: string;
  students: string[];
  student: string;
  teacher: string;
  coordinator: string;
  guardian: string;
  network: string;
}

/** Parâmetros usados só para gerar os dados simulados. Nunca rode isto em banco real. */
async function assignSimulatedParams(db: Database, rng: SeededRng): Promise<void> {
  await db.system(async (tx) => {
    const rows = await tx.query(`SELECT id FROM items WHERE status = 'published' AND area = 'CN' ORDER BY external_id`);
    for (const r of rows) {
      const params: IrtParams = { a: 0.9 + rng.next() * 1.3, b: rng.normal(0.3, 0.8), c: 0.08 + rng.next() * 0.16 };
      await tx.query(`UPDATE items SET irt_a = $2, irt_b = $3, irt_c = $4, calibration = 'calibrated', rights_note = 'Parâmetros simulados para a demonstração.' WHERE id = $1`, [r.id, params.a, params.b, params.c]);
    }
  });
}

function pick<T>(rng: SeededRng, list: readonly T[]): T {
  return list[Math.floor(rng.next() * list.length)]!;
}

async function simulateStudent(
  tx: Tx,
  student: { id: string; schoolId: string },
  profile: { theta: number; engagement: number; pace: { read: number; path: number; calc: number; check: number }; grade: string },
  items: readonly CatalogItem[],
  rng: SeededRng,
  now: number,
  days: number,
): Promise<void> {
  const scoring = items.filter((i) => i.irt);
  for (let ago = days; ago >= 0; ago--) {
    if (rng.next() > profile.engagement) continue;
    const answeredAt = now - ago * DAY_MS - Math.floor(rng.next() * 3) * 3_600_000 - 3_600_000;
    const exam = rng.next() < 0.3;
    const theta = profile.theta + (0.25 * (days - ago)) / days;
    const sessionId = await createSessionRow(tx, student, exam ? "exam" : "guided");
    const attempts: AttemptInput[] = [];
    for (let position = 0; position < 6; position++) {
      const item = pick(rng, exam ? scoring : items);
      const targetMs = targetSeconds(toCandidate(item)) * 1000;
      const phases = simulatePhases(rng, targetMs, profile.pace);
      const correct = item.irt ? simulateCorrect(rng, theta, item.irt) : rng.next() < 0.55;
      const wrong = item.alternatives.filter((a) => a.letter !== item.answer);
      const totalMs = phases.readMs + phases.pathMs + phases.calcMs + phases.checkMs;
      attempts.push({
        id: randomUUID(), sessionId, itemId: item.id, mode: exam ? "exam" : "guided", choice: correct ? item.answer : pick(rng, wrong).letter,
        totalMs, phases: exam ? null : phases, usedHint: !exam && rng.next() < 0.1, hiddenMs: 0, position, answeredAt: answeredAt + position * 200_000,
      });
    }
    await recordAttempts(tx, student, attempts, now, { refresh: false });
    if (rng.next() < 0.35) {
      const texts = await tx.query(`SELECT id, words, questions FROM reading_texts ORDER BY external_id`);
      const text = pick(rng, texts);
      const goal = READING_GOALS[profile.grade] ?? 170;
      const ppm = Math.round(goal * (0.72 + 0.1 * theta + rng.next() * 0.25 + (0.15 * (days - ago)) / days));
      const score = Math.min(4, Math.max(1, Math.round(2.6 + theta * 0.8 + rng.normal(0, 0.7))));
      const answers = text.questions.map((q: { answer: number }, i: number) => (i < score ? q.answer : (q.answer + 1) % 4));
      await tx.query(
        `INSERT INTO reading_attempts (school_id, student_id, text_id, ppm, score, verdict, answers, at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [student.schoolId, student.id, text.id, ppm, score, score >= 3 ? "valid" : "low_comprehension", JSON.stringify(answers), new Date(answeredAt)],
      );
    }
  }
  await refreshSnapshot(tx, student.id, student.schoolId, now);
}

export async function seedDemo(db: Database, options: Options): Promise<DemoAccounts> {
  const { now, password } = options;
  const perClass = options.studentsPerClass ?? 16;
  const days = options.days ?? 42;
  const rng = new SeededRng(180);
  await installBaseContent(db);
  const items = normalizeItems([
    ...parseCanonicalJson(FILE("../../../../content/super-revisao-fisica.json")),
    ...ENERGY_ITEMS,
    ...parseCanonicalJson(FILE("../../../../packages/ingest/examples/exemplo-disciplinas.json")),
  ]);
  if (items.rejected.length > 0) throw new Error(`Conteúdo inválido: ${JSON.stringify(items.rejected)}`);
  await importBatch(db, items, "seed", "demonstração");
  await assignSimulatedParams(db, rng);

  const { hash, salt } = await hashPassword(password);
  const schoolId = randomUUID();
  const pendingSchoolId = randomUUID();
  const inFuture = new Date(now + 10 * DAY_MS).toISOString().slice(0, 10);
  await db.system((tx) => tx.query(
    `INSERT INTO schools (id, name, city, grades, slug, is_demo, dpa_signed, dpo_contact, diagnostic_date, released_at)
     VALUES ($1,'Escola Modelo Ritmo','Macapá, AP','9º ano ao EM','modelo',true,true,'dpo@${DOMAIN}',$3,$4),
            ($2,'Colégio Horizonte','Santana, AP','EM','horizonte',true,false,'',NULL,NULL)`,
    [schoolId, pendingSchoolId, inFuture, new Date(now - days * DAY_MS)],
  ));

  const user = async (tx: Tx, email: string, name: string, role: string, school: string | null, grade: string | null = null) => {
    const id = randomUUID();
    await tx.query(`INSERT INTO users (id, school_id, email, name, role, pass_hash, pass_salt, grade) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [id, school, `${email}@${DOMAIN}`, name, role, hash, salt, grade]);
    return { id, email: `${email}@${DOMAIN}` };
  };

  const accounts = await db.system(async (tx) => {
    const network = await user(tx, "rede", "Equipe da Rede", "network_admin", null);
    const coordinator = await user(tx, "coordenacao", "Marta Coordenadora", "coordinator", schoolId);
    await user(tx, "coordenacao.horizonte", "Paulo Coordenador", "coordinator", pendingSchoolId);
    const teacher = await user(tx, "professor", "Rui Professor", "teacher", schoolId);
    const guardian = await user(tx, "familia", "Helena Responsável", "guardian", schoolId);
    const profiles: { id: string; email: string; classId: string; theta: number; grade: string }[] = [];
    let n = 0;
    for (const c of CLASSES) {
      const classId = randomUUID();
      await tx.query(`INSERT INTO classes (id, school_id, name, grade) VALUES ($1,$2,$3,$4)`, [classId, schoolId, c.name, c.grade]);
      await tx.query(`INSERT INTO class_teachers (class_id, teacher_id, school_id, subject) VALUES ($1,$2,$3,'Física')`, [classId, teacher.id, schoolId]);
      for (let i = 0; i < perClass; i++) {
        const name = `${FIRST[n % FIRST.length]} ${LAST[(n * 3) % LAST.length]}`;
        const s = await user(tx, `aluno${String(++n).padStart(3, "0")}`, name, "student", schoolId, c.grade);
        await tx.query(`INSERT INTO class_students (class_id, student_id, school_id) VALUES ($1,$2,$3)`, [classId, s.id, schoolId]);
        await tx.query(`INSERT INTO guardian_contacts (student_id, school_id, guardian_email, consent_at) VALUES ($1,$2,$3,$4)`, [s.id, schoolId, `resp${n}@${DOMAIN}`, new Date(now - days * DAY_MS)]);
        profiles.push({ ...s, classId, theta: rng.normal(c.theta, 0.6), grade: c.grade });
      }
    }
    return { network, coordinator, teacher, guardian, profiles };
  });

  const served = await db.system((tx) => loadServable(tx));
  await db.tenant({ schoolId }, async (tx) => {
    for (const p of accounts.profiles) {
      const engagement = rng.next() < 0.12 ? 0.1 : 0.35 + rng.next() * 0.5;
      const pace = { read: 0.95 + rng.next() * 0.7, path: 0.8 + rng.next() * 0.4, calc: 0.8 + rng.next() * 0.45, check: 0.5 + rng.next() * 0.6 };
      await simulateStudent(tx, { id: p.id, schoolId }, { theta: p.theta, engagement, pace, grade: p.grade }, served, rng, now, days);
    }
  });

  const main = accounts.profiles.find((p) => p.grade === "3ª série")!;
  const sibling = accounts.profiles.find((p) => p.grade === "9º ano")!;
  await db.tenant({ schoolId }, async (tx) => {
    await tx.query(`INSERT INTO guardian_links (guardian_id, student_id, school_id) VALUES ($1,$2,$3), ($1,$4,$3)`, [accounts.guardian.id, main.id, schoolId, sibling.id]);
    await tx.query(`INSERT INTO accommodations (school_id, student_id, kind, extra_minutes, resources) VALUES ($1,$2,'Tempo adicional (TDAH)',60,'Fonte ampliada')`, [schoolId, accounts.profiles[1]!.id]);
    await tx.query(`INSERT INTO family_messages (school_id, student_id, direction, author, body) VALUES ($1,$2,'to_family','Rui Professor','Vem resolvendo bem as contas. O foco agora é ler o texto-base com mais objetividade.')`, [schoolId, main.id]);
    await tx.query(`INSERT INTO family_messages (school_id, guardian_id, student_id, direction, author, body) VALUES ($1,$2,$3,'to_school','Helena Responsável','Gostaria de conversar sobre o horário de estudo em casa.')`, [schoolId, accounts.guardian.id, sibling.id]);
    await createExam(tx, { schoolId, classId: main.classId, teacherId: accounts.teacher.id, title: "Mini-simulado de Física", parts: [{ area: "CN", discipline: "Física", count: 20 }] }, now);
  });
  await runCalibration(db, now);
  return {
    schoolId,
    pendingSchoolId,
    students: accounts.profiles.map((p) => p.email),
    student: main.email,
    teacher: accounts.teacher.email,
    coordinator: accounts.coordinator.email,
    guardian: accounts.guardian.email,
    network: accounts.network.email,
  };
}
