// Simulado: prova sem gabarito até a entrega, com o relógio controlado pelo servidor.
import { randomUUID } from "node:crypto";
import { AREA_NAMES, type Area, type ExamResultView, type ExamSittingView, type ExamSummary, type Letter, type PracticeItem } from "@ritmo/contracts";
import {
  accommodationFactor, assembleExam, DEFAULT_SECONDS_PER_QUESTION, difficultyScore, estimateTheta, fatigueCurve, formatClock,
  incoherences, SeededRng, spreadAcrossAreas, whatIfScenarios, type ExamResponse,
} from "@ritmo/engine";
import type { Row, Tx } from "../../platform/db.ts";
import { HttpError } from "../../platform/http.ts";
import { loadCandidates, loadItems, toPracticeItem } from "../catalog/index.ts";
import { createSessionRow, extraMinutesOf, recordAttempts, scoreViewOf } from "../practice/index.ts";

const GRACE_MS = 60_000;

const AVAILABLE_TO_STUDENT = `(e.owner_student_id = $1 OR e.class_id IN (SELECT class_id FROM class_students WHERE student_id = $1))`;

export async function createExam(
  tx: Tx,
  input: { schoolId: string; classId: string; teacherId: string; title: string; parts: { area: Area; discipline?: string; count: number }[] },
  now: number,
) {
  const assembled = assembleExam(input.parts, await loadCandidates(tx), new SeededRng(now % 2_147_483_647));
  if (assembled.itemIds.length === 0) throw new HttpError(422, "no_items", "Não há questões publicadas para esta prova.");
  const seconds = Math.round(DEFAULT_SECONDS_PER_QUESTION);
  const id = randomUUID();
  await tx.query(
    `INSERT INTO exams (id, school_id, class_id, title, item_ids, duration_seconds, seconds_per_question, created_by) VALUES ($1,$2,$3,$4,$5::uuid[],$6,$7,$8)`,
    [id, input.schoolId, input.classId, input.title, assembled.itemIds, assembled.itemIds.length * seconds, seconds, input.teacherId],
  );
  return { id, questions: assembled.itemIds.length, shortages: assembled.shortages };
}

export async function listExams(tx: Tx, studentId: string): Promise<ExamSummary[]> {
  const rows = await tx.query(
    `SELECT e.id, e.title, e.item_ids, e.duration_seconds, e.owner_student_id, s.id AS sitting_id, s.finished_at
     FROM exams e LEFT JOIN exam_sittings s ON s.exam_id = e.id AND s.student_id = $1
     WHERE ${AVAILABLE_TO_STUDENT}
     ORDER BY e.created_at DESC`,
    [studentId],
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    questions: r.item_ids.length,
    durationMinutes: Math.round(r.duration_seconds / 60),
    mine: r.owner_student_id === studentId,
    sitting: r.sitting_id ? { id: r.sitting_id, finished: !!r.finished_at } : null,
  }));
}

async function loadSitting(tx: Tx, sittingId: string, studentId: string) {
  const s = (await tx.query(
    `SELECT s.*, e.title, e.item_ids, e.duration_seconds, e.seconds_per_question FROM exam_sittings s JOIN exams e ON e.id = s.exam_id WHERE s.id = $1 AND s.student_id = $2`,
    [sittingId, studentId],
  ))[0];
  if (!s) throw new HttpError(404, "not_found", "Prova não encontrada.");
  return s;
}

const totalMs = (s: Row, extra: number) => s.duration_seconds * accommodationFactor(extra) * 1000;

export async function startSitting(tx: Tx, student: { id: string; schoolId: string }, examId: string, now: number): Promise<string> {
  const exam = (await tx.query(
    `SELECT e.id FROM exams e WHERE e.id = $2 AND ${AVAILABLE_TO_STUDENT}`,
    [student.id, examId],
  ))[0];
  if (!exam) throw new HttpError(404, "not_found", "Prova não encontrada para sua turma.");
  const rows = await tx.query(
    `INSERT INTO exam_sittings (school_id, exam_id, student_id, started_at) VALUES ($1,$2,$3,$4)
     ON CONFLICT (exam_id, student_id) DO UPDATE SET exam_id = excluded.exam_id RETURNING id`,
    [student.schoolId, examId, student.id, new Date(now)],
  );
  return rows[0]!.id;
}

export async function sittingView(tx: Tx, sittingId: string, studentId: string, now: number): Promise<ExamSittingView> {
  const s = await loadSitting(tx, sittingId, studentId);
  const extra = await extraMinutesOf(tx, studentId);
  const items = await loadItems(tx, s.item_ids);
  const responses = await tx.query(`SELECT position, choice, triage, time_ms FROM exam_responses WHERE sitting_id = $1`, [sittingId]);
  return {
    id: s.id,
    title: s.title,
    startedAt: new Date(s.started_at).getTime(),
    durationSeconds: Math.round(totalMs(s, extra) / 1000),
    secondsPerQuestion: Math.round(s.seconds_per_question * accommodationFactor(extra)),
    items: s.item_ids.map((id: string) => {
      const { targetSeconds: _, ...item } = toPracticeItem(items.get(id)!, 0) as PracticeItem;
      return item;
    }),
    responses: responses.map((r) => ({ position: r.position, choice: r.choice, triage: r.triage, timeMs: r.time_ms })),
    serverNow: now,
  };
}

export async function saveResponse(
  tx: Tx,
  sittingId: string,
  student: { id: string; schoolId: string },
  response: { position: number; choice: Letter | null; triage: string; timeMs: number },
  now: number,
): Promise<void> {
  const s = await loadSitting(tx, sittingId, student.id);
  if (s.finished_at) throw new HttpError(409, "finished", "Esta prova já foi entregue.");
  const extra = await extraMinutesOf(tx, student.id);
  if (now > new Date(s.started_at).getTime() + totalMs(s, extra) + GRACE_MS) throw new HttpError(409, "time_up", "O tempo da prova acabou.");
  const itemId = s.item_ids[response.position];
  if (!itemId) throw new HttpError(400, "bad_position", "Questão inexistente nesta prova.");
  await tx.query(
    `INSERT INTO exam_responses (sitting_id, school_id, position, item_id, choice, triage, time_ms) VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (sitting_id, position) DO UPDATE SET choice = excluded.choice, triage = excluded.triage, time_ms = excluded.time_ms`,
    [sittingId, student.schoolId, response.position, itemId, response.choice, response.triage, response.timeMs],
  );
}

const OWN_EXAM_FRESH_DAYS = 21;

function ownExamTitle(input: { area?: Area; discipline?: string; topic?: string }): string {
  const subject = input.topic ?? input.discipline ?? (input.area ? AREA_NAMES[input.area] : null);
  return subject ? `Simulado de ${subject}` : "Simulado geral";
}

/** Monta e já inicia a prova, dando preferência a questões que o aluno não viu nas últimas semanas. */
export async function createOwnExam(
  tx: Tx,
  student: { id: string; schoolId: string },
  input: { area?: Area; discipline?: string; topic?: string; questions: number },
  now: number,
): Promise<{ sittingId: string; questions: number }> {
  const open = await tx.query(
    `SELECT s.id FROM exam_sittings s JOIN exams e ON e.id = s.exam_id WHERE e.owner_student_id = $1 AND s.finished_at IS NULL LIMIT 1`,
    [student.id],
  );
  if (open[0]) throw new HttpError(409, "exam_open", "Termine o simulado em andamento antes de criar outro.");
  const pool = await loadCandidates(tx, input);
  const seen = await tx.query(`SELECT DISTINCT item_id FROM attempts WHERE student_id = $1 AND answered_at >= $2`, [student.id, new Date(now - OWN_EXAM_FRESH_DAYS * 86_400_000)]);
  const seenIds = new Set(seen.map((r) => r.item_id));
  const rng = new SeededRng(now % 2_147_483_647);
  const fresh = assembleExam(spreadAcrossAreas(pool, input.questions), pool.filter((i) => !seenIds.has(i.id)), rng);
  const repeats = assembleExam(fresh.shortages.map((s) => ({ area: s.area, count: s.missing })), pool.filter((i) => seenIds.has(i.id)), rng);
  const itemIds = [...fresh.itemIds, ...repeats.itemIds];
  if (itemIds.length === 0) throw new HttpError(422, "no_items", "Ainda não há questões publicadas para essa escolha.");
  const seconds = Math.round(DEFAULT_SECONDS_PER_QUESTION);
  const id = randomUUID();
  await tx.query(
    `INSERT INTO exams (id, school_id, owner_student_id, title, item_ids, duration_seconds, seconds_per_question, created_by) VALUES ($1,$2,$3,$4,$5::uuid[],$6,$7,$3)`,
    [id, student.schoolId, student.id, ownExamTitle(input), itemIds, itemIds.length * seconds, seconds],
  );
  return { sittingId: await startSitting(tx, student, id, now), questions: itemIds.length };
}

/** A entrega joga as respostas no mesmo registro do treino: uma só fonte para nota e painéis. */
export async function finishSitting(tx: Tx, sittingId: string, student: { id: string; schoolId: string }, now: number): Promise<void> {
  const s = await loadSitting(tx, sittingId, student.id);
  if (s.finished_at) return;
  const responses = await tx.query(`SELECT * FROM exam_responses WHERE sitting_id = $1 AND choice IS NOT NULL`, [sittingId]);
  if (responses.length > 0) {
    const sessionId = await createSessionRow(tx, student, "exam", { sittingId });
    await recordAttempts(tx, student, responses.map((r) => ({
      id: randomUUID(), sessionId, itemId: r.item_id, mode: "exam" as const, choice: r.choice, totalMs: r.time_ms,
      phases: null, usedHint: false, hiddenMs: 0, position: r.position, answeredAt: now,
    })), now);
  }
  await tx.query(`UPDATE exam_sittings SET finished_at = $2 WHERE id = $1`, [sittingId, new Date(now)]);
}

export async function examResult(tx: Tx, sittingId: string, studentId: string): Promise<ExamResultView> {
  const s = await loadSitting(tx, sittingId, studentId);
  if (!s.finished_at) throw new HttpError(409, "not_finished", "A prova ainda não foi entregue.");
  const items = await loadItems(tx, s.item_ids);
  const rows = await tx.query(`SELECT position, choice, time_ms FROM exam_responses WHERE sitting_id = $1`, [sittingId]);
  const byPosition = new Map(rows.map((r) => [r.position, r]));
  const responses: (ExamResponse & { area: Area })[] = s.item_ids.map((id: string, position: number) => {
    const item = items.get(id)!;
    const r = byPosition.get(position);
    return {
      itemId: id, position, area: item.area, correct: r?.choice === item.answer, blank: !r?.choice, timeMs: r?.time_ms ?? 0,
      targetMs: s.seconds_per_question * 1000, params: item.irt,
    };
  });
  const areas = [...new Set(responses.map((r) => r.area))];
  const scores = areas.map((area) => {
    const scored = responses.filter((r) => r.area === area && r.params);
    return scoreViewOf(area, scored.length ? estimateTheta(scored.map((r) => ({ params: r.params!, correct: r.correct }))) : undefined);
  });
  const answered = responses.filter((r) => !r.blank);
  const topics = new Map<string, ExamResultView["byTopic"][number] & { ms: number }>();
  for (const r of responses) {
    const { discipline, topic } = items.get(r.itemId)!;
    const key = `${discipline}\n${topic}`;
    const entry = topics.get(key) ?? { discipline, topic, correct: 0, total: 0, avgSeconds: 0, ms: 0 };
    entry.total++;
    entry.correct += r.correct ? 1 : 0;
    entry.ms += r.timeMs;
    topics.set(key, entry);
  }
  const main = areas[0]!;
  const inMain = responses.filter((r) => r.area === main);
  const incoherent = incoherences(inMain).map((i) => {
    const r = inMain.find((x) => x.itemId === i.itemId)!;
    return {
      number: r.position + 1,
      difficulty: r.params ? String(difficultyScore(main, r.params.b)) : "—",
      hit: r.correct,
      time: formatClock(r.timeMs / 1000),
      note: i.kind === "easy_missed" ? "Errou uma questão da sua faixa" : "Acerto improvável: confira se foi segurança ou sorte",
    };
  });
  return {
    title: s.title,
    scores,
    avgSeconds: answered.length ? Math.round(answered.reduce((t, r) => t + r.timeMs, 0) / answered.length / 1000) : 0,
    secondsPerQuestion: s.seconds_per_question,
    answered: answered.length,
    total: responses.length,
    fatigue: fatigueCurve(responses),
    whatIf: whatIfScenarios(main, inMain),
    incoherent,
    correct: responses.filter((r) => r.correct).length,
    byTopic: [...topics.values()]
      .map(({ ms, ...t }) => ({ ...t, avgSeconds: Math.round(ms / t.total / 1000) }))
      .sort((x, y) => x.correct / x.total - y.correct / y.total || y.total - x.total),
    review: responses.map((r) => {
      const item = items.get(r.itemId)!;
      return {
        number: r.position + 1, seconds: Math.round(r.timeMs / 1000), discipline: item.discipline, topic: item.topic, contextHtml: item.contextHtml,
        stemHtml: item.stemHtml, alternatives: item.alternatives, answer: item.answer, choice: byPosition.get(r.position)?.choice ?? null, solutionHtml: item.solutionHtml,
      };
    }),
  };
}
