// Projeção do progresso do aluno. Tudo aqui pode ser recalculado a partir das tentativas.
import { AREAS, type Area, type ScoreView } from "@ritmo/contracts";
import {
  averagePhases, estimateTheta, masteryByTopic, MIN_ITEMS_FOR_SCORE, ritmoSummary, toScore,
  type AttemptFact, type IrtParams, type PhaseTimes,
} from "@ritmo/engine";
import type { Tx } from "../../platform/db.ts";
import { loadItems } from "../catalog/index.ts";

const WEEK_MS = 7 * 86_400_000;
const HISTORY_LIMIT = 3000;
const PHASE_WINDOW = 60;

export interface StoredAttempt extends AttemptFact {
  discipline: string;
  examLike: boolean;
}

const toFact = (r: Record<string, any>): StoredAttempt => ({
  itemId: r.item_id,
  topic: r.topic,
  area: r.area,
  discipline: r.discipline,
  correct: r.correct,
  totalMs: r.total_ms,
  targetMs: r.target_ms,
  mode: r.mode === "guided" ? "guided" : "exam",
  examLike: r.mode !== "guided",
  phases: r.read_ms === null ? null : { readMs: r.read_ms, pathMs: r.path_ms, calcMs: r.calc_ms, checkMs: r.check_ms },
  usedHint: r.used_hint,
  valid: r.valid,
  position: r.position,
  answeredAt: new Date(r.answered_at).getTime(),
});

export async function loadAttempts(tx: Tx, studentId: string): Promise<StoredAttempt[]> {
  const rows = await tx.query(`SELECT * FROM attempts WHERE student_id = $1 ORDER BY answered_at DESC LIMIT ${HISTORY_LIMIT}`, [studentId]);
  return rows.map(toFact);
}

export async function loadSchoolAttempts(tx: Tx, studentIds: readonly string[], since: number): Promise<Map<string, StoredAttempt[]>> {
  const rows = await tx.query(`SELECT * FROM attempts WHERE student_id = ANY($1::uuid[]) AND answered_at >= $2`, [[...studentIds], new Date(since)]);
  const out = new Map<string, StoredAttempt[]>();
  for (const r of rows) {
    const list = out.get(r.student_id);
    if (list) list.push(toFact(r));
    else out.set(r.student_id, [toFact(r)]);
  }
  return out;
}

export async function irtFor(tx: Tx, attempts: readonly AttemptFact[]): Promise<Map<string, IrtParams>> {
  const items = await loadItems(tx, attempts.map((a) => a.itemId));
  const out = new Map<string, IrtParams>();
  for (const [id, item] of items) if (item.irt) out.set(id, item.irt);
  return out;
}

/** Só prova e diagnóstico pesam na nota: treino com dica e item sem calibração ficam de fora. */
export function scoreResponses(attempts: readonly StoredAttempt[], irt: ReadonlyMap<string, IrtParams>, area: Area) {
  const latest = new Map<string, StoredAttempt>();
  for (const a of attempts) {
    if (a.area !== area || !a.examLike || !a.valid || a.usedHint || !irt.has(a.itemId)) continue;
    const seen = latest.get(a.itemId);
    if (!seen || a.answeredAt > seen.answeredAt) latest.set(a.itemId, a);
  }
  return [...latest.values()].map((a) => ({ params: irt.get(a.itemId)!, correct: a.correct }));
}

export function scoreViewOf(area: Area, estimate: { theta: number; se: number; n: number } | undefined): ScoreView {
  const n = estimate?.n ?? 0;
  if (!estimate || n < MIN_ITEMS_FOR_SCORE) {
    return { area, score: null, low: null, high: null, provisional: true, items: n, neededItems: MIN_ITEMS_FOR_SCORE };
  }
  const band = toScore(area, estimate);
  return { area, ...band, items: n, neededItems: MIN_ITEMS_FOR_SCORE };
}

export interface Snapshot {
  studentId: string;
  ritmo: number | null;
  ritmoWeekAgo: number | null;
  avgMs: number | null;
  samples: number;
  thetas: Partial<Record<Area, { theta: number; se: number; n: number }>>;
  mastery: Record<string, { mastery: number; attempts: number; stage: number }>;
  phases: PhaseTimes | null;
  lastActive: number | null;
}

export function computeSnapshot(studentId: string, attempts: readonly StoredAttempt[], irt: ReadonlyMap<string, IrtParams>, now: number): Snapshot {
  const current = ritmoSummary(attempts);
  const before = ritmoSummary(attempts.filter((a) => a.answeredAt <= now - WEEK_MS));
  const thetas: Snapshot["thetas"] = {};
  for (const area of AREAS) {
    const responses = scoreResponses(attempts, irt, area);
    if (responses.length > 0) thetas[area] = estimateTheta(responses);
  }
  const mastery: Snapshot["mastery"] = {};
  for (const m of masteryByTopic(attempts)) mastery[m.topic] = { mastery: m.mastery, attempts: m.attempts, stage: m.stage };
  const phases = attempts.filter((a) => a.valid && a.phases).slice(0, PHASE_WINDOW).map((a) => a.phases!);
  return {
    studentId,
    ritmo: current.index,
    ritmoWeekAgo: before.index,
    avgMs: current.avgMs,
    samples: current.samples,
    thetas,
    mastery,
    phases: averagePhases(phases),
    lastActive: attempts.reduce<number | null>((max, a) => (max === null || a.answeredAt > max ? a.answeredAt : max), null),
  };
}

export async function refreshSnapshot(tx: Tx, studentId: string, schoolId: string, now: number): Promise<void> {
  const attempts = await loadAttempts(tx, studentId);
  const s = computeSnapshot(studentId, attempts, await irtFor(tx, attempts), now);
  await tx.query(
    `INSERT INTO learner_snapshots (student_id, school_id, ritmo, ritmo_week_ago, avg_ms, samples, thetas, mastery, phases, last_active, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
     ON CONFLICT (student_id) DO UPDATE SET ritmo = excluded.ritmo, ritmo_week_ago = excluded.ritmo_week_ago, avg_ms = excluded.avg_ms,
       samples = excluded.samples, thetas = excluded.thetas, mastery = excluded.mastery, phases = excluded.phases,
       last_active = excluded.last_active, updated_at = now()`,
    [studentId, schoolId, s.ritmo, s.ritmoWeekAgo, s.avgMs, s.samples, JSON.stringify(s.thetas), JSON.stringify(s.mastery),
     s.phases ? JSON.stringify(s.phases) : null, s.lastActive ? new Date(s.lastActive) : null],
  );
}

export async function loadSnapshots(tx: Tx, studentIds: readonly string[]): Promise<Map<string, Snapshot>> {
  const rows = await tx.query(`SELECT * FROM learner_snapshots WHERE student_id = ANY($1::uuid[])`, [[...studentIds]]);
  return new Map(rows.map((r) => [r.student_id, {
    studentId: r.student_id,
    ritmo: r.ritmo,
    ritmoWeekAgo: r.ritmo_week_ago,
    avgMs: r.avg_ms,
    samples: r.samples,
    thetas: r.thetas,
    mastery: r.mastery,
    phases: r.phases,
    lastActive: r.last_active ? new Date(r.last_active).getTime() : null,
  } satisfies Snapshot]));
}

export async function extraMinutesOf(tx: Tx, studentId: string): Promise<number> {
  return (await tx.query(`SELECT extra_minutes FROM accommodations WHERE student_id = $1`, [studentId]))[0]?.extra_minutes ?? 0;
}
