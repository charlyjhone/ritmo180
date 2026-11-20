// Aula rápida de cada assunto e as bases que ele usa, com o domínio do aluno em cada uma.
import type { Area, LessonIndex, LessonView } from "@ritmo/contracts";
import { diagnoseTime, sumPhases } from "@ritmo/engine";
import type { Tx } from "../../platform/db.ts";
import { HttpError } from "../../platform/http.ts";
import { computeSnapshot, irtFor, loadAttempts, type Snapshot } from "../practice/index.ts";
import { prerequisitesOf } from "./map.ts";

/** Abaixo disso a base é fraca o bastante para valer revisar antes. */
const WEAK_BELOW = 0.6;
/** Assunto com menos questões que isso não entra no índice: não daria para praticar. */
const MIN_QUESTIONS = 5;

interface Learner {
  mastery: Snapshot["mastery"];
  calcBottleneck: boolean;
}

const NOBODY: Learner = { mastery: {}, calcBottleneck: false };

async function learnerOf(tx: Tx, studentId: string | null, now: number): Promise<Learner> {
  if (!studentId) return NOBODY;
  const attempts = await loadAttempts(tx, studentId);
  const snapshot = computeSnapshot(studentId, attempts, await irtFor(tx, attempts), now);
  const targetMs = attempts.length ? attempts.slice(0, 40).reduce((sum, a) => sum + a.targetMs, 0) / Math.min(40, attempts.length) : 0;
  const bottleneck = snapshot.phases && sumPhases(snapshot.phases) && targetMs ? diagnoseTime(snapshot.phases, targetMs).bottleneck : null;
  return { mastery: snapshot.mastery, calcBottleneck: bottleneck === "calcMs" };
}

const percent = (learner: Learner, topic: string) => (learner.mastery[topic] ? Math.round(learner.mastery[topic]!.mastery * 100) : null);
const statusOf = (mastery: number | null) => (mastery === null ? "untested" : mastery < WEAK_BELOW * 100 ? "weak" : "ok");

async function topicCounts(tx: Tx): Promise<Map<string, { area: Area; discipline: string; topic: string; questions: number }>> {
  const rows = await tx.query(
    `SELECT area, discipline, topic, count(*)::int AS questions FROM items WHERE status = 'published' GROUP BY area, discipline, topic`,
  );
  return new Map(rows.map((r) => [`${r.discipline}\n${r.topic}`, { area: r.area as Area, discipline: r.discipline, topic: r.topic, questions: r.questions }]));
}

async function publishedLessons(tx: Tx): Promise<Set<string>> {
  return new Set((await tx.query(`SELECT discipline, topic FROM lessons WHERE status = 'published'`)).map((r) => `${r.discipline}\n${r.topic}`));
}

export async function lessonView(tx: Tx, studentId: string | null, discipline: string, topic: string, now: number): Promise<LessonView> {
  const counts = await topicCounts(tx);
  const subject = counts.get(`${discipline}\n${topic}`);
  if (!subject) throw new HttpError(404, "not_found", "Assunto não encontrado.");
  const row = (await tx.query(
    `SELECT title, explanation_html, example_html, pitfalls_html FROM lessons WHERE discipline = $1 AND topic = $2 AND status = 'published'`,
    [discipline, topic],
  ))[0];
  const lessons = await publishedLessons(tx);
  const learner = await learnerOf(tx, studentId, now);
  const order = { weak: 0, untested: 1, ok: 2 } as const;
  const prerequisites = prerequisitesOf(discipline, topic)
    .filter((p) => counts.has(`${p.discipline}\n${p.topic}`))
    .map((p) => {
      const mastery = percent(learner, p.topic);
      return { ...p, mastery, status: statusOf(mastery), hasLesson: lessons.has(`${p.discipline}\n${p.topic}`) } as LessonView["prerequisites"][number];
    })
    .sort((x, y) => order[x.status] - order[y.status]);
  return {
    area: subject.area, discipline, topic, questions: subject.questions,
    lesson: row ? { title: row.title, explanationHtml: row.explanation_html, exampleHtml: row.example_html, pitfallsHtml: row.pitfalls_html } : null,
    mastery: percent(learner, topic),
    prerequisites,
    calcBottleneck: learner.calcBottleneck && prerequisites.some((p) => p.discipline === "Matemática"),
  };
}

export async function lessonIndex(tx: Tx, studentId: string | null, now: number): Promise<LessonIndex> {
  const counts = await topicCounts(tx);
  const lessons = await publishedLessons(tx);
  const learner = await learnerOf(tx, studentId, now);
  const weights = new Map((await tx.query(`SELECT discipline, topic, weight FROM topics`)).map((r) => [`${r.discipline}\n${r.topic}`, r.weight as number]));
  const disciplines = new Map<string, LessonIndex["disciplines"][number]>();
  const subjects = [...counts.entries()]
    .filter(([key, s]) => s.questions >= MIN_QUESTIONS || lessons.has(key))
    .sort(([a, x], [b, y]) => (weights.get(b) ?? 0) - (weights.get(a) ?? 0) || y.questions - x.questions);
  for (const [key, s] of subjects) {
    const entry = disciplines.get(s.discipline) ?? { area: s.area, discipline: s.discipline, topics: [] };
    const weakPrerequisites = prerequisitesOf(s.discipline, s.topic).filter((p) => counts.has(`${p.discipline}\n${p.topic}`) && statusOf(percent(learner, p.topic)) === "weak").length;
    entry.topics.push({ topic: s.topic, questions: s.questions, hasLesson: lessons.has(key), mastery: percent(learner, s.topic), weakPrerequisites });
    disciplines.set(s.discipline, entry);
  }
  return { disciplines: [...disciplines.values()].sort((x, y) => x.area.localeCompare(y.area) || x.discipline.localeCompare(y.discipline, "pt-BR")) };
}
