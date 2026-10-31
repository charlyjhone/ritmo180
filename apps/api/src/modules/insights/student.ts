// Painel do aluno e resumo da família. Tudo vem das tentativas, sem número fixo.
import { AREAS, type FamilyChild, type StudentDashboard } from "@ritmo/contracts";
import {
  bestStreak, DEFAULT_SECONDS_PER_QUESTION, diagnoseTime, nextEnem, PHASE_LABEL, ritmoSummary, STAGES, trainingStreak, weeklyRitmo,
  type Phase,
} from "@ritmo/engine";
import type { Tx } from "../../platform/db.ts";
import { HttpError } from "../../platform/http.ts";
import { loadItems } from "../catalog/index.ts";
import { computeSnapshot, extraMinutesOf, irtFor, loadAttempts, pendingDiagnostics, previewPlan, scoreViewOf, type StoredAttempt } from "../practice/index.ts";
import { readingHistory } from "../reading/index.ts";

const WEEKS = 6;
const RECENT_FOR_GAPS = 200;

async function gapsOf(tx: Tx, attempts: readonly StoredAttempt[]) {
  const recent = attempts.slice(0, RECENT_FOR_GAPS).filter((a) => a.valid);
  const items = await loadItems(tx, recent.map((a) => a.itemId));
  const errors = recent.filter((a) => !a.correct);
  const counts = new Map<string, number>();
  for (const a of errors) for (const key of items.get(a.itemId)?.prerequisites ?? []) counts.set(key, (counts.get(key) ?? 0) + 1);
  if (counts.size === 0) return [];
  const catalog = await tx.query(`SELECT key, name, grade FROM prerequisites WHERE key = ANY($1::text[])`, [[...counts.keys()]]);
  return catalog
    .map((p) => ({ name: p.name as string, grade: p.grade as string, errors: counts.get(p.key)!, errorShare: Math.round((counts.get(p.key)! / errors.length) * 100) }))
    .sort((x, y) => y.errors - x.errors)
    .slice(0, 4);
}

export async function studentDashboard(tx: Tx, student: { id: string; name: string; grade: string | null }, now: number): Promise<StudentDashboard> {
  const attempts = await loadAttempts(tx, student.id);
  const irt = await irtFor(tx, attempts);
  const snapshot = computeSnapshot(student.id, attempts, irt, now);
  const klass = (await tx.query(`SELECT c.name FROM class_students cs JOIN classes c ON c.id = cs.class_id WHERE cs.student_id = $1 LIMIT 1`, [student.id]))[0];
  const extra = await extraMinutesOf(tx, student.id);
  const goalSeconds = attempts.length ? Math.round(attempts.slice(0, 40).reduce((s, a) => s + a.targetMs, 0) / Math.min(40, attempts.length) / 1000) : Math.round(DEFAULT_SECONDS_PER_QUESTION * (1 + extra / 270));
  const phases = snapshot.phases;
  const diagnosis = phases ? diagnoseTime(phases, goalSeconds * 1000) : null;
  const timestamps = attempts.map((a) => a.answeredAt);
  const items = await loadItems(tx, attempts.map((a) => a.itemId));
  const disciplineOf = new Map([...items.values()].map((i) => [i.topic, i.discipline]));
  const scores = AREAS.map((area) => scoreViewOf(area, snapshot.thetas[area]));
  const measured = new Set(scores.filter((s) => s.score !== null).map((s) => s.area));
  return {
    student: { name: student.name, grade: student.grade, className: klass?.name ?? null },
    ritmo: {
      index: snapshot.ritmo,
      samples: snapshot.samples,
      weekDelta: snapshot.ritmo !== null && snapshot.ritmoWeekAgo !== null ? snapshot.ritmo - snapshot.ritmoWeekAgo : null,
      weekly: weeklyRitmo(attempts, WEEKS, now),
    },
    time: {
      avgSeconds: snapshot.avgMs === null ? null : Math.round(snapshot.avgMs / 1000),
      goalSeconds,
      breakdown: phases ? { ...phases, samples: attempts.filter((a) => a.phases && a.valid).length } : null,
      diagnosis: diagnosis?.message ?? null,
      bottleneck: diagnosis?.bottleneck ? PHASE_LABEL[diagnosis.bottleneck as Phase] : null,
    },
    scores,
    streak: { current: trainingStreak(timestamps, now), best: bestStreak(timestamps) },
    skills: Object.entries(snapshot.mastery)
      .map(([topic, m]) => ({ topic, discipline: disciplineOf.get(topic) ?? "", stage: m.stage, stageName: STAGES[m.stage - 1]!, mastery: Math.round(m.mastery * 100), attempts: m.attempts }))
      .sort((x, y) => x.mastery - y.mastery),
    gaps: await gapsOf(tx, attempts),
    plan: await previewPlan(tx, student.id, now),
    diagnosticPending: (await pendingDiagnostics(tx, student)).filter((area) => !measured.has(area)),
    syncedAttempts: attempts.length,
    enem: nextEnem(now),
  };
}

const DAY_MS = 86_400_000;
const WEEK_DAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTHS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
const TIME_ZONE_MS = 3 * 3_600_000;
const GOAL_DAYS = 5;

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export async function familyChildren(tx: Tx, guardianId: string, now: number): Promise<FamilyChild[]> {
  const links = await tx.query(
    `SELECT u.id, u.name, u.grade, c.id AS class_id FROM guardian_links gl JOIN users u ON u.id = gl.student_id
     LEFT JOIN class_students cs ON cs.student_id = u.id LEFT JOIN classes c ON c.id = cs.class_id
     WHERE gl.guardian_id = $1 ORDER BY u.name`,
    [guardianId],
  );
  const children: FamilyChild[] = [];
  for (const child of links) {
    const first = child.name.split(" ")[0] as string;
    const attempts = await loadAttempts(tx, child.id);
    const irt = await irtFor(tx, attempts);
    const snapshot = computeSnapshot(child.id, attempts, irt, now);
    const reading = await readingHistory(tx, child.id);
    const delta = snapshot.ritmo !== null && snapshot.ritmoWeekAgo !== null ? snapshot.ritmo - snapshot.ritmoWeekAgo : null;
    const stats: FamilyChild["stats"] = [
      { label: "Índice Ritmo", value: snapshot.ritmo === null ? "—" : `${snapshot.ritmo}%`, delta: delta === null ? null : `${signed(delta)} na semana` },
    ];
    const area = AREAS.find((a) => snapshot.thetas[a] && scoreViewOf(a, snapshot.thetas[a]).score !== null);
    if (area) stats.push({ label: `Nota estimada ${area}`, value: String(scoreViewOf(area, snapshot.thetas[area]).score), delta: null });
    else if (reading.validPpm !== null) stats.push({ label: "Leitura válida", value: `${reading.validPpm} ppm`, delta: reading.firstPpm !== null ? `${signed(reading.validPpm - reading.firstPpm)} desde o início` : null });

    const dayStart = (t: number) => Math.floor((t - TIME_ZONE_MS) / DAY_MS);
    const today = dayStart(now);
    const practiced = new Set(attempts.map((a) => dayStart(a.answeredAt)));
    const week = Array.from({ length: 7 }, (_, i) => {
      const day = today - 6 + i;
      return { day: WEEK_DAYS[new Date(day * DAY_MS + TIME_ZONE_MS).getUTCDay()]!, trained: practiced.has(day) };
    });
    const trained = week.filter((d) => d.trained).length;
    const points = weeklyRitmo(attempts, WEEKS, now).flatMap((value, i) => (value === null ? [] : [{ label: `sem ${i + 1}`, value }]));
    const ritmoRecent = ritmoSummary(attempts);
    const headline = attempts.length === 0
      ? `${first} ainda não começou a treinar.`
      : trained >= GOAL_DAYS
        ? `${first} cumpriu a rotina da semana${delta !== null && delta > 0 ? " e melhorou o ritmo" : ""}.`
        : trained === 0
          ? `${first} não treinou nos últimos 7 dias.`
          : `${first} treinou ${trained} de ${GOAL_DAYS} dias nesta semana${ritmoRecent.accuracy !== null ? `, com ${ritmoRecent.accuracy}% de acerto` : ""}.`;

    const note = (await tx.query(`SELECT author, body FROM family_messages WHERE student_id = $1 AND direction = 'to_family' ORDER BY created_at DESC LIMIT 1`, [child.id]))[0];
    const exams = child.class_id
      ? await tx.query(`SELECT title, created_at FROM exams WHERE class_id = $1 ORDER BY created_at DESC LIMIT 2`, [child.class_id])
      : [];
    const diagnostic = (await tx.query(`SELECT diagnostic_date FROM schools s JOIN users u ON u.school_id = s.id WHERE u.id = $1`, [child.id]))[0]?.diagnostic_date;
    const agenda: FamilyChild["agenda"] = [];
    if (diagnostic) {
      const d = new Date(diagnostic);
      agenda.push({ day: String(d.getUTCDate()).padStart(2, "0"), month: MONTHS[d.getUTCMonth()]!, title: "Diagnóstico", detail: "Na escola" });
    }
    for (const e of exams) {
      const d = new Date(e.created_at);
      agenda.push({ day: String(d.getUTCDate()).padStart(2, "0"), month: MONTHS[d.getUTCMonth()]!, title: e.title, detail: "Simulado disponível" });
    }
    const help = trained < GOAL_DAYS
      ? `Combine um horário fixo de 15 minutos por dia. Rotina curta e frequente rende mais do que uma sessão longa no fim de semana.`
      : `Peça para ${first} explicar em voz alta o erro mais recente. Explicar o próprio erro ajuda a fixar.`;
    children.push({
      id: child.id, name: first, grade: child.grade, headline, stats, week, goalDays: GOAL_DAYS,
      evolution: points.length >= 2 ? { title: `Índice Ritmo: de ${points[0]!.value}% para ${points.at(-1)!.value}%`, points } : null,
      note: note ? { from: note.author, initials: initials(note.author), body: note.body } : null,
      help, agenda,
    });
  }
  return children;
}

export async function assertGuardianOf(tx: Tx, guardianId: string, studentId: string): Promise<void> {
  const link = (await tx.query(`SELECT 1 FROM guardian_links WHERE guardian_id = $1 AND student_id = $2`, [guardianId, studentId]))[0];
  if (!link) throw new HttpError(403, "forbidden", "Este aluno não está vinculado à sua conta.");
}

