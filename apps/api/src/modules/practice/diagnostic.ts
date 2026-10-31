// Diagnóstico adaptativo: usa só itens calibrados e para quando a nota fica precisa o bastante.
import { randomUUID } from "node:crypto";
import { AREAS, type Area, type DiagnosticStep, type Letter, type PracticeItem } from "@ritmo/contracts";
import { DEFAULT_ADAPTIVE, estimateTheta, nextAdaptiveItem } from "@ritmo/engine";
import type { Tx } from "../../platform/db.ts";
import { HttpError } from "../../platform/http.ts";
import { loadServable, toPracticeItem, type CatalogItem } from "../catalog/index.ts";
import { createSessionRow, recordAttempts } from "./attempts.ts";
import { scoreViewOf } from "./progress.ts";

const stripTarget = ({ targetSeconds: _, ...item }: PracticeItem) => item;

async function pool(tx: Tx, area: Area): Promise<CatalogItem[]> {
  return (await loadServable(tx, { area })).filter((i) => i.irt);
}

async function answeredIn(tx: Tx, sessionId: string, items: Map<string, CatalogItem>) {
  const rows = await tx.query(`SELECT item_id, correct, topic FROM attempts WHERE session_id = $1 ORDER BY position`, [sessionId]);
  return rows.filter((r) => items.get(r.item_id)?.irt).map((r) => ({ itemId: r.item_id, topic: r.topic, correct: r.correct, params: items.get(r.item_id)!.irt! }));
}

async function step(tx: Tx, sessionId: string, area: Area, candidates: CatalogItem[]): Promise<DiagnosticStep> {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const answered = await answeredIn(tx, sessionId, byId);
  const next = nextAdaptiveItem(candidates.map((c) => ({ id: c.id, topic: c.topic, params: c.irt! })), answered);
  const score = next.done ? scoreViewOf(area, estimateTheta(answered)) : null;
  if (next.done) await tx.query(`UPDATE practice_sessions SET plan = jsonb_set(plan, '{done}', 'true') WHERE id = $1`, [sessionId]);
  return { sessionId, done: next.done, answered: answered.length, item: next.nextItemId ? stripTarget(toPracticeItem(byId.get(next.nextItemId)!, 0)) : null, score, unavailable: null };
}

export async function startDiagnostic(tx: Tx, student: { id: string; schoolId: string }, area: Area): Promise<DiagnosticStep> {
  const candidates = await pool(tx, area);
  if (candidates.length < DEFAULT_ADAPTIVE.minItems) {
    return { sessionId: "", done: false, answered: 0, item: null, score: null, unavailable: `Ainda não há questões calibradas suficientes nesta área (${candidates.length} de ${DEFAULT_ADAPTIVE.minItems}).` };
  }
  const open = (await tx.query(
    `SELECT id FROM practice_sessions WHERE student_id = $1 AND mode = 'diagnostic' AND plan->>'area' = $2 AND plan->>'done' = 'false' ORDER BY created_at DESC LIMIT 1`,
    [student.id, area],
  ))[0];
  const sessionId = open?.id ?? (await createSessionRow(tx, student, "diagnostic", { area, done: false }));
  return step(tx, sessionId, area, candidates);
}

export async function answerDiagnostic(
  tx: Tx,
  student: { id: string; schoolId: string },
  sessionId: string,
  answer: { itemId: string; choice: Letter; totalMs: number },
  now: number,
): Promise<DiagnosticStep> {
  const session = (await tx.query(`SELECT plan FROM practice_sessions WHERE id = $1 AND student_id = $2 AND mode = 'diagnostic'`, [sessionId, student.id]))[0];
  if (!session) throw new HttpError(404, "not_found", "Diagnóstico não encontrado.");
  const area = session.plan.area as Area;
  const candidates = await pool(tx, area);
  const position = (await tx.query(`SELECT count(*)::int AS n FROM attempts WHERE session_id = $1`, [sessionId]))[0]!.n;
  await recordAttempts(tx, student, [{
    id: randomUUID(), sessionId, itemId: answer.itemId, mode: "diagnostic", choice: answer.choice, totalMs: answer.totalMs,
    phases: null, usedHint: false, hiddenMs: 0, position, answeredAt: now,
  }], now);
  return step(tx, sessionId, area, candidates);
}

/** Áreas com banco pronto em que o aluno ainda não tem estimativa. */
export async function pendingDiagnostics(tx: Tx, student: { id: string }): Promise<Area[]> {
  const done = new Set((await tx.query(`SELECT plan->>'area' AS area FROM practice_sessions WHERE student_id = $1 AND mode = 'diagnostic' AND plan->>'done' = 'true'`, [student.id])).map((r) => r.area));
  const counts = await tx.query(`SELECT area, count(*)::int AS n FROM items WHERE status = 'published' AND calibration IN ('official','calibrated') GROUP BY area`);
  const ready = new Set(counts.filter((c) => c.n >= DEFAULT_ADAPTIVE.minItems).map((c) => c.area));
  return AREAS.filter((a) => ready.has(a) && !done.has(a));
}

