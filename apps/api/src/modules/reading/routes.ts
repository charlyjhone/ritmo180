import { ReadingSubmit, type ReadingNext, type ReadingResultView } from "@ritmo/contracts";
import { evaluateReading, READING_GOALS } from "@ritmo/engine";
import type { Tx } from "../../platform/db.ts";
import { HttpError, type ModuleRoutes } from "../../platform/http.ts";
import { requireActor, tenantOf } from "../identity/index.ts";

interface ReadingQuestion {
  kind: string;
  prompt: string;
  options: string[];
  answer: number;
  why: string;
}

export interface ReadingHistory {
  validPpm: number | null;
  firstPpm: number | null;
  comprehension: number | null;
  weakKind: string | null;
}

const RECENT = 12;

export async function readingHistory(tx: Tx, studentId: string): Promise<ReadingHistory> {
  const rows = await tx.query(
    `SELECT ra.ppm, ra.score, ra.verdict, ra.answers, t.questions FROM reading_attempts ra JOIN reading_texts t ON t.id = ra.text_id
     WHERE ra.student_id = $1 ORDER BY ra.at DESC`,
    [studentId],
  );
  const valid = rows.filter((r) => r.verdict === "valid");
  const recent = rows.slice(0, RECENT);
  const misses = new Map<string, number>();
  for (const r of recent) {
    (r.questions as ReadingQuestion[]).forEach((q, i) => {
      if (r.answers[i] !== q.answer) misses.set(q.kind, (misses.get(q.kind) ?? 0) + 1);
    });
  }
  return {
    validPpm: valid.length ? Math.round(valid.slice(0, RECENT).reduce((s, r) => s + r.ppm, 0) / Math.min(RECENT, valid.length)) : null,
    firstPpm: valid.at(-1)?.ppm ?? null,
    comprehension: recent.length ? Math.round((recent.reduce((s, r) => s + r.score, 0) / (recent.length * 4)) * 100) : null,
    weakKind: [...misses].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null,
  };
}

const goalOf = (grade: string | null) => (grade ? (READING_GOALS[grade] ?? null) : null);

export const readingRoutes: ModuleRoutes = (app, { db }) => {
  app.get("/api/reading/next", async (request): Promise<ReadingNext> => {
    const actor = requireActor(request, "student");
    return db.tenant(tenantOf(actor), async (tx) => {
      const text = (await tx.query(
        `SELECT t.*, (SELECT count(*) FROM reading_attempts ra WHERE ra.text_id = t.id AND ra.student_id = $1) AS seen
         FROM reading_texts t WHERE t.rights_cleared ORDER BY seen, abs(CASE WHEN t.grade = $2 THEN 0 ELSE 1 END), t.title LIMIT 1`,
        [actor.id, actor.grade],
      ))[0];
      if (!text) throw new HttpError(404, "no_texts", "Ainda não há textos de leitura no banco.");
      return {
        text: { id: text.id, title: text.title, body: text.body, words: text.words, grade: text.grade },
        questions: (text.questions as ReadingQuestion[]).map(({ kind, prompt, options }) => ({ kind, prompt, options })),
        history: { ...(await readingHistory(tx, actor.id)), goalPpm: goalOf(actor.grade) },
      };
    });
  });

  app.post("/api/reading/submit", async (request): Promise<ReadingResultView> => {
    const actor = requireActor(request, "student");
    const { textId, readMs, answers } = ReadingSubmit.parse(request.body);
    return db.tenant(tenantOf(actor), async (tx) => {
      const text = (await tx.query(`SELECT words, questions FROM reading_texts WHERE id = $1`, [textId]))[0];
      if (!text) throw new HttpError(404, "not_found", "Texto não encontrado.");
      const questions = text.questions as ReadingQuestion[];
      const review = questions.map((q, i) => ({ kind: q.kind, correct: answers[i] === q.answer, why: q.why }));
      const result = evaluateReading(text.words, readMs, review.filter((r) => r.correct).length);
      await tx.query(
        `INSERT INTO reading_attempts (school_id, student_id, text_id, ppm, score, verdict, answers) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [actor.schoolId, actor.id, textId, result.ppm, result.score, result.verdict, JSON.stringify(answers)],
      );
      return { ...result, goalPpm: goalOf(actor.grade), review };
    });
  });
};
