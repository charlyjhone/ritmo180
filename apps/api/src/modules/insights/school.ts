// Painel da direção: visão por série, área e turma.
import { AREA_NAMES, AREAS, GRADES, type Area, type SchoolDashboard, type SchoolUsage } from "@ritmo/contracts";
import { SCALES } from "@ritmo/engine";
import type { Tx } from "../../platform/db.ts";
import { loadSnapshots, scoreViewOf } from "../practice/index.ts";
import { mean, rounded } from "./teacher.ts";

const WEEK_MS = 7 * 86_400_000;
const HIGH_SCHOOL = new Set(["1ª série", "2ª série", "3ª série"]);

/** Funil do piloto: cadastro, primeiro treino, treino na semana e hábito (3 dias ou mais). Cada etapa contém a seguinte. */
export async function schoolUsage(tx: Tx, schoolId: string, now: number): Promise<SchoolUsage> {
  const since = new Date(now - WEEK_MS);
  const [f] = await tx.query(
    `WITH alunos AS (SELECT id FROM users WHERE school_id = $1 AND role = 'student' AND deactivated_at IS NULL AND anonymized_at IS NULL),
     respostas AS (SELECT a.student_id, a.mode, a.answered_at FROM attempts a JOIN alunos s ON s.id = a.student_id)
     SELECT (SELECT count(*) FROM alunos)::int AS enrolled,
       (SELECT count(DISTINCT student_id) FROM respostas)::int AS started,
       (SELECT count(DISTINCT student_id) FROM respostas WHERE mode = 'diagnostic')::int AS diagnostic,
       (SELECT count(DISTINCT student_id) FROM respostas WHERE answered_at >= $2)::int AS week,
       (SELECT count(*) FROM (SELECT student_id FROM respostas WHERE answered_at >= $2 GROUP BY student_id HAVING count(DISTINCT answered_at::date) >= 3) x)::int AS steady`,
    [schoolId, since],
  );
  const count = async (sql: string) => Number((await tx.query(sql, [schoolId, since]))[0]?.n ?? 0);
  const tools = [
    { label: "Treino guiado", students: await count(`SELECT count(DISTINCT student_id) AS n FROM attempts WHERE school_id = $1 AND answered_at >= $2 AND mode = 'guided'`) },
    { label: "Treino no modo prova", students: await count(`SELECT count(DISTINCT student_id) AS n FROM attempts WHERE school_id = $1 AND answered_at >= $2 AND mode = 'exam'`) },
    { label: "Cartões de memorização", students: await count(`SELECT count(DISTINCT student_id) AS n FROM card_reviews WHERE school_id = $1 AND at >= $2`) },
    { label: "Leitura", students: await count(`SELECT count(DISTINCT student_id) AS n FROM reading_attempts WHERE school_id = $1 AND at >= $2`) },
    { label: "Simulado", students: await count(`SELECT count(DISTINCT student_id) AS n FROM exam_sittings WHERE school_id = $1 AND started_at >= $2`) },
    { label: "Motivo dos erros", students: await count(`SELECT count(DISTINCT student_id) AS n FROM miss_reasons WHERE school_id = $1 AND at >= $2`) },
  ].sort((x, y) => y.students - x.students);
  const share = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}% de quem tem conta` : "sem alunos ainda");
  return {
    funnel: [
      { label: "Com conta ativa", students: f!.enrolled, note: "alunos cadastrados pela escola" },
      { label: "Fizeram o primeiro treino", students: f!.started, note: share(f!.started, f!.enrolled) },
      { label: "Treinaram nesta semana", students: f!.week, note: share(f!.week, f!.enrolled) },
      { label: "Treinaram em 3 dias ou mais", students: f!.steady, note: "o hábito que faz a nota subir" },
    ],
    tools,
    stalled: Math.max(0, f!.started - f!.week),
    diagnostic: f!.diagnostic,
  };
}

export async function schoolDashboard(tx: Tx, schoolId: string, now: number): Promise<SchoolDashboard> {
  const school = (await tx.query(`SELECT name, is_demo FROM schools WHERE id = $1`, [schoolId]))[0]!;
  const students = await tx.query(`SELECT id, grade FROM users WHERE role = 'student' AND school_id = $1`, [schoolId]);
  const ids = students.map((s) => s.id as string);
  const snapshots = await loadSnapshots(tx, ids);
  const list = [...snapshots.values()];
  const gradeOf = new Map(students.map((s) => [s.id, s.grade as string]));
  const reading = await tx.query(
    `SELECT student_id, avg(ppm) FILTER (WHERE verdict = 'valid') AS ppm, avg(score) / 4.0 * 100 AS comp FROM reading_attempts WHERE school_id = $1 GROUP BY student_id`,
    [schoolId],
  );
  const prereq = await tx.query(
    `SELECT a.student_id, avg(CASE WHEN a.correct THEN 100.0 ELSE 0 END)::float AS rate FROM attempts a JOIN items i ON i.id = a.item_id
     WHERE a.school_id = $1 AND a.valid AND cardinality(i.prerequisites) > 0 GROUP BY a.student_id`,
    [schoolId],
  );

  const grades = GRADES.flatMap((grade) => {
    const inGrade = students.filter((s) => s.grade === grade).map((s) => s.id as string);
    if (inGrade.length === 0) return [];
    const has = new Set(inGrade);
    const r = reading.filter((x) => has.has(x.student_id));
    return [{
      grade,
      students: inGrade.length,
      prereq: rounded(mean(prereq.filter((p) => has.has(p.student_id)).map((p) => p.rate))),
      ppm: rounded(mean(r.flatMap((x) => (x.ppm === null ? [] : [Number(x.ppm)])))),
      comprehension: rounded(mean(r.map((x) => Number(x.comp)))),
      ritmo: rounded(mean(inGrade.flatMap((id) => (snapshots.get(id)?.ritmo == null ? [] : [snapshots.get(id)!.ritmo!])))),
    }];
  });

  const areas = AREAS.flatMap((area: Area) => {
    const thetas = list.flatMap((s) => (s.thetas[area] && s.thetas[area]!.n >= 10 ? [s.thetas[area]!.theta] : []));
    if (thetas.length === 0) return [];
    const view = scoreViewOf(area, { theta: mean(thetas)!, se: 0.1, n: 10 });
    return [{ area, name: AREA_NAMES[area], score: view.score, delta: null, provisional: SCALES[area].provisional, students: thetas.length }];
  });

  const classRows = await tx.query(
    `SELECT c.id, c.name, array_agg(cs.student_id) AS ids FROM classes c JOIN class_students cs ON cs.class_id = c.id WHERE c.school_id = $1 GROUP BY c.id ORDER BY c.grade, c.name`,
    [schoolId],
  );
  const classes = classRows.map((c) => {
    const snaps = (c.ids as string[]).flatMap((id) => (snapshots.get(id) ? [snapshots.get(id)!] : []));
    const ritmo = mean(snaps.flatMap((s) => (s.ritmo === null ? [] : [s.ritmo])));
    const before = mean(snaps.flatMap((s) => (s.ritmoWeekAgo === null ? [] : [s.ritmoWeekAgo])));
    const ms = mean(snaps.flatMap((s) => (s.avgMs === null ? [] : [s.avgMs])));
    return {
      name: c.name as string,
      students: c.ids.length as number,
      active: snaps.filter((s) => s.lastActive !== null && s.lastActive >= now - WEEK_MS).length,
      ritmo: rounded(ritmo),
      avgSeconds: ms === null ? null : Math.round(ms / 1000),
      delta: ritmo !== null && before !== null ? Math.round(ritmo - before) : null,
    };
  });

  const gapRows = await tx.query(
    `SELECT p.name, p.grade, p.areas, count(DISTINCT a.student_id)::int AS students
     FROM attempts a JOIN items i ON i.id = a.item_id JOIN prerequisites p ON p.key = ANY(i.prerequisites)
     WHERE a.school_id = $1 AND NOT a.correct AND a.valid GROUP BY p.key, p.name, p.grade, p.areas ORDER BY students DESC LIMIT 4`,
    [schoolId],
  );

  const messages = await tx.query(
    `SELECT m.id, m.author, m.body, m.created_at, m.read_at, u.name AS student FROM family_messages m JOIN users u ON u.id = m.student_id
     WHERE m.direction = 'to_school' ORDER BY m.created_at DESC LIMIT 10`,
  );
  const flagsOpen = (await tx.query(
    `SELECT count(DISTINCT f.id)::int AS n FROM item_flags f JOIN attempts a ON a.item_id = f.item_id WHERE f.status = 'open' AND a.school_id = $1`,
    [schoolId],
  ))[0]!.n;

  const high = ids.filter((id) => HIGH_SCHOOL.has(gradeOf.get(id)!));
  const highRitmo = high.flatMap((id) => (snapshots.get(id)?.ritmo == null ? [] : [snapshots.get(id)!.ritmo!]));
  const highBefore = high.flatMap((id) => (snapshots.get(id)?.ritmoWeekAgo == null ? [] : [snapshots.get(id)!.ritmoWeekAgo!]));
  const active = list.filter((s) => s.lastActive !== null && s.lastActive >= now - WEEK_MS).length;
  const ninth = grades.find((g) => g.grade === "9º ano");
  const lowest = grades.filter((g) => g.prereq !== null).sort((x, y) => x.prereq! - y.prereq!)[0];
  const best = classes.filter((c) => c.ritmo !== null).sort((x, y) => y.ritmo! - x.ritmo!)[0];

  return {
    school: { name: school.name },
    headline: ids.length === 0
      ? "A escola ainda não tem alunos importados"
      : lowest ? `${lowest.grade} tem o menor domínio de pré-requisitos da escola` : `${active} de ${ids.length} alunos treinaram nesta semana`,
    metrics: {
      activeWeek: active,
      enrolled: ids.length,
      ritmoHigh: rounded(mean(highRitmo)),
      ritmoDelta: mean(highRitmo) !== null && mean(highBefore) !== null ? Math.round(mean(highRitmo)! - mean(highBefore)!) : null,
      prereqNinth: ninth?.prereq ?? null,
      flagsOpen,
    },
    grades,
    insight: lowest && best ? `${best.name} lidera o Índice Ritmo com ${best.ritmo}%. O pré-requisito mais fraco está no ${lowest.grade}, com ${lowest.prereq}%.` : null,
    gaps: gapRows.map((g) => ({ name: g.name, grade: g.grade, students: g.students, areas: g.areas })),
    areas,
    classes,
    messages: messages.map((m) => ({ id: m.id, from: m.author, student: m.student, body: m.body, at: new Date(m.created_at).getTime(), read: !!m.read_at })),
    dataNotice: school.is_demo ? "Escola de demonstração: alunos e respostas foram simulados pelo próprio motor." : null,
    usage: await schoolUsage(tx, schoolId, now),
  };
}
