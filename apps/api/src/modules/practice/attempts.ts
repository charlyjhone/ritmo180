// Registro de tentativas. A correção acontece aqui, nunca no aparelho do aluno.
import { randomUUID } from "node:crypto";
import type { AttemptInput, SyncResult } from "@ritmo/contracts";
import { attemptFlags, guessStreakPositions, targetSeconds } from "@ritmo/engine";
import type { Tx } from "../../platform/db.ts";
import { loadItems, toCandidate } from "../catalog/index.ts";
import { extraMinutesOf, refreshSnapshot } from "./progress.ts";

const MAX_CLOCK_SKEW_MS = 5 * 60_000;

export async function recordAttempts(
  tx: Tx,
  student: { id: string; schoolId: string },
  attempts: readonly AttemptInput[],
  now: number,
  options: { refresh?: boolean } = {},
): Promise<SyncResult> {
  const result: SyncResult = { accepted: [], duplicates: [], rejected: [] };
  const sessionIds = [...new Set(attempts.map((a) => a.sessionId))];
  const owned = new Set((await tx.query(`SELECT id FROM practice_sessions WHERE id = ANY($1::uuid[]) AND student_id = $2`, [sessionIds, student.id])).map((r) => r.id));
  const items = await loadItems(tx, attempts.map((a) => a.itemId));
  const extra = await extraMinutesOf(tx, student.id);

  const guesses = new Map<string, Set<string>>();
  for (const sessionId of sessionIds) {
    const inSession = attempts.filter((a) => a.sessionId === sessionId).sort((x, y) => x.position - y.position);
    const marked = guessStreakPositions(inSession.map((a) => a.totalMs));
    guesses.set(sessionId, new Set(inSession.filter((_, i) => marked.has(i)).map((a) => a.id)));
  }

  for (const a of attempts) {
    const item = items.get(a.itemId);
    if (!owned.has(a.sessionId)) {
      result.rejected.push({ id: a.id, reason: "Sessão de outro aluno ou inexistente." });
      continue;
    }
    if (!item) {
      result.rejected.push({ id: a.id, reason: "Questão não encontrada." });
      continue;
    }
    const correct = a.choice === item.answer;
    const flags: string[] = attemptFlags({ correct, totalMs: a.totalMs, hiddenMs: a.hiddenMs, wordCount: item.wordCount, b: item.irt?.b ?? null });
    if (guesses.get(a.sessionId)?.has(a.id)) flags.push("guess_streak");
    const targetMs = targetSeconds(toCandidate(item), extra) * 1000;
    const rows = await tx.query(
      `INSERT INTO attempts (id, school_id, student_id, session_id, item_id, area, discipline, topic, mode, choice, correct, total_ms, target_ms,
         read_ms, path_ms, calc_ms, check_ms, used_hint, hidden_ms, position, valid, flags, answered_at, confidence)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
       ON CONFLICT (id) DO NOTHING RETURNING id`,
      [a.id, student.schoolId, student.id, a.sessionId, a.itemId, item.area, item.discipline, item.topic, a.mode, a.choice, correct, a.totalMs, targetMs,
       a.phases?.readMs ?? null, a.phases?.pathMs ?? null, a.phases?.calcMs ?? null, a.phases?.checkMs ?? null, a.usedHint, a.hiddenMs, a.position,
       flags.length === 0, flags, new Date(Math.min(a.answeredAt, now + MAX_CLOCK_SKEW_MS)), a.confidence ?? null],
    );
    (rows.length > 0 ? result.accepted : result.duplicates).push(a.id);
  }
  if (result.accepted.length > 0 && options.refresh !== false) await refreshSnapshot(tx, student.id, student.schoolId, now);
  return result;
}

export async function createSessionRow(tx: Tx, student: { id: string; schoolId: string }, mode: string, plan: unknown = []): Promise<string> {
  const id = randomUUID();
  await tx.query(`INSERT INTO practice_sessions (id, school_id, student_id, mode, plan) VALUES ($1,$2,$3,$4,$5)`, [id, student.schoolId, student.id, mode, JSON.stringify(plan)]);
  return id;
}
