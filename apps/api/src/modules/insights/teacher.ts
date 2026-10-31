// Painel do professor: leitura da turma com base nas projeções e nas tentativas recentes.
import type { ClassRef, TeacherDashboard } from "@ritmo/contracts";
import { averagePhases, diagnoseTime, PHASE_LABEL, type Phase } from "@ritmo/engine";
import type { Row, Tx } from "../../platform/db.ts";
import { HttpError } from "../../platform/http.ts";
import { loadItems } from "../catalog/index.ts";
import { loadSchoolAttempts, loadSnapshots, scoreViewOf, type Snapshot } from "../practice/index.ts";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;
const INACTIVE_DAYS = 5;
const MAX_TOPICS = 6;
const RITMO_DROP_ALERT = 6;
const LOW_MASTERY = 50;

export const mean = (values: readonly number[]): number | null => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : null);
export const rounded = (value: number | null) => (value === null ? null : Math.round(value));

const shortName = (name: string) => {
  const [first, last] = name.split(/\s+/);
  return last ? `${first} ${last[0]}.` : first!;
};

export async function teacherClasses(tx: Tx, actor: { id: string; role: string }): Promise<ClassRef[]> {
  return tx.query<ClassRef & Row>(
    `SELECT c.id, c.name, c.grade, ct.subject, (SELECT count(*)::int FROM class_students cs WHERE cs.class_id = c.id) AS students
     FROM classes c LEFT JOIN class_teachers ct ON ct.class_id = c.id AND ct.teacher_id = $1
     WHERE $2 = 'coordinator' OR ct.teacher_id IS NOT NULL ORDER BY c.grade, c.name`,
    [actor.id, actor.role],
  );
}

export async function teacherDashboard(tx: Tx, actor: { id: string; role: string }, classId: string, now: number): Promise<TeacherDashboard> {
  const klass = (await teacherClasses(tx, actor)).find((c) => c.id === classId);
  if (!klass) throw new HttpError(403, "forbidden", "Esta turma não está atribuída a você.");
  const students = await tx.query(`SELECT u.id, u.name FROM class_students cs JOIN users u ON u.id = cs.student_id WHERE cs.class_id = $1 ORDER BY u.name`, [classId]);
  const ids = students.map((s) => s.id as string);
  const snapshots = await loadSnapshots(tx, ids);
  const recent = await loadSchoolAttempts(tx, ids, now - MONTH_MS);
  const list = [...snapshots.values()];

  const activeSince = (since: number) => list.filter((s) => s.lastActive !== null && s.lastActive >= since).length;
  const inactive = ids.filter((id) => (snapshots.get(id)?.lastActive ?? 0) < now - INACTIVE_DAYS * DAY_MS).length;
  const ritmo = mean(list.flatMap((s) => (s.ritmo === null ? [] : [s.ritmo])));
  const ritmoBefore = mean(list.flatMap((s) => (s.ritmoWeekAgo === null ? [] : [s.ritmoWeekAgo])));
  const avgMs = mean(list.flatMap((s) => (s.avgMs === null ? [] : [s.avgMs])));

  const area = (["CN", "MT", "LC", "CH"] as const).find((a) => list.some((s) => s.thetas[a]));
  const thetas = area ? list.flatMap((s) => (s.thetas[area] ? [s.thetas[area]!] : [])).filter((t) => t.n >= 10) : [];
  const classTheta = mean(thetas.map((t) => t.theta));
  const score = area ? scoreViewOf(area, classTheta === null ? undefined : { theta: classTheta, se: 0.1, n: Math.round(mean(thetas.map((t) => t.n))!) }) : null;

  const topicTotals = new Map<string, { weakSum: number; count: number }>();
  for (const s of list) {
    for (const [topic, m] of Object.entries(s.mastery)) {
      const t = topicTotals.get(topic) ?? { weakSum: 0, count: 0 };
      t.weakSum += m.mastery;
      t.count++;
      topicTotals.set(topic, t);
    }
  }
  const topics = [...topicTotals].filter(([, t]) => t.count >= Math.max(1, ids.length / 3)).map(([topic, t]) => ({ topic, avg: t.weakSum / t.count }))
    .sort((x, y) => x.avg - y.avg).slice(0, MAX_TOPICS);
  const weakest = topics[0];
  const heat = {
    topics: topics.map((t) => t.topic),
    rows: students.map((s) => {
      const snap = snapshots.get(s.id);
      return { studentId: s.id, name: shortName(s.name), ritmo: snap?.ritmo ?? null, cells: topics.map((t) => (snap?.mastery[t.topic] ? Math.round(snap.mastery[t.topic]!.mastery * 100) : null)) };
    }),
  };

  const phases = averagePhases(list.flatMap((s) => (s.phases ? [s.phases] : [])));
  const attempts = [...recent.values()].flat();
  const target = mean(attempts.map((a) => a.targetMs)) ?? 180_000;
  const diagnosis = phases ? diagnoseTime(phases, target) : null;
  const bottleneck = diagnosis?.bottleneck ? PHASE_LABEL[diagnosis.bottleneck as Phase] : null;

  const wrong = await tx.query(`SELECT item_id, choice FROM attempts WHERE student_id = ANY($1::uuid[]) AND NOT correct AND valid AND answered_at >= $2`, [ids, new Date(now - MONTH_MS)]);
  const items = await loadItems(tx, wrong.map((w) => w.item_id));
  const trapCounts = new Map<string, { where: string; n: number }>();
  for (const w of wrong) {
    const item = items.get(w.item_id);
    const trap = item?.alternatives.find((a) => a.letter === w.choice)?.trap;
    if (!item || !trap) continue;
    const entry = trapCounts.get(trap) ?? { where: item.topic, n: 0 };
    entry.n++;
    trapCounts.set(trap, entry);
  }
  const traps = [...trapCounts].sort((x, y) => y[1].n - x[1].n).slice(0, 3)
    .map(([name, t]) => ({ name, where: t.where, share: Math.round((t.n / wrong.length) * 100) }));

  const alerts: TeacherDashboard["alerts"] = [];
  for (const s of students) {
    const snap: Snapshot | undefined = snapshots.get(s.id);
    const days = snap?.lastActive ? Math.floor((now - snap.lastActive) / DAY_MS) : null;
    if (days === null || days >= INACTIVE_DAYS) alerts.push({ studentId: s.id, name: shortName(s.name), why: days === null ? "Ainda não treinou" : `Sem treinar há ${days} dias`, action: "avisar_familia" });
    else if (snap && snap.ritmo !== null && snap.ritmoWeekAgo !== null && snap.ritmoWeekAgo - snap.ritmo >= RITMO_DROP_ALERT) alerts.push({ studentId: s.id, name: shortName(s.name), why: `Índice Ritmo caiu ${snap.ritmoWeekAgo - snap.ritmo} pontos na semana`, action: "ver_trilha" });
    else if (snap && Object.values(snap.mastery).filter((m) => m.mastery * 100 < LOW_MASTERY).length >= 3) alerts.push({ studentId: s.id, name: shortName(s.name), why: "Três ou mais assuntos abaixo de 50%", action: "enviar_sprints" });
  }

  const flagRows = await tx.query(
    `SELECT f.id, f.item_id, f.reason, i.external_id, i.topic, i.discipline FROM item_flags f JOIN items i ON i.id = f.item_id
     WHERE f.status = 'open' AND EXISTS (SELECT 1 FROM attempts a WHERE a.item_id = f.item_id AND a.student_id = ANY($1::uuid[])) LIMIT 5`,
    [ids],
  );
  const assignable = await tx.query<TeacherDashboard["assignableTopics"][number] & Row>(`SELECT topic, discipline, count(*)::int AS items FROM items WHERE status = 'published' GROUP BY topic, discipline ORDER BY discipline, topic`);

  const headline = !attempts.length
    ? "A turma ainda não tem treinos registrados"
    : `${weakest ? `${weakest.topic} é o ponto mais fraco da turma` : "A turma está em dia"}${bottleneck ? `, e ${bottleneck.toLowerCase()} é o gargalo de tempo` : ""}`;

  return {
    class: klass,
    headline,
    metrics: {
      ritmo: rounded(ritmo),
      ritmoDelta: ritmo !== null && ritmoBefore !== null ? Math.round(ritmo - ritmoBefore) : null,
      avgSeconds: avgMs === null ? null : Math.round(avgMs / 1000),
      score,
      activeWeek: activeSince(now - WEEK_MS),
      total: ids.length,
      inactive,
    },
    heat,
    time: phases ? { ...phases, samples: attempts.filter((a) => a.phases).length } : null,
    suggestion: diagnosis?.bottleneck ? `Trabalhe ${bottleneck!.toLowerCase()} em sala: ${diagnosis.message.replace(/^Você está/, "a turma está").replace("Seu tempo", "O tempo")}` : null,
    traps,
    alerts: alerts.slice(0, 5),
    flags: flagRows.map((f) => ({ id: f.id, itemId: f.item_id, label: f.external_id, area: `${f.discipline} · ${f.topic}`, why: f.reason })),
    assignableTopics: assignable,
  };
}
