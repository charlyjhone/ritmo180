// Leitura do banco de questões. Cada módulo que precisa de questão passa por aqui.
import type { Area, CanonicalItem, Letter, PracticeAnswerKey, PracticeItem } from "@ritmo/contracts";
import { targetSeconds, type Candidate, type IrtParams } from "@ritmo/engine";
import type { Tx } from "../../platform/db.ts";
import { createHash } from "node:crypto";

export interface CatalogItem {
  id: string;
  area: Area;
  discipline: string;
  topic: string;
  skill: string | null;
  contextHtml: string;
  stemHtml: string;
  alternatives: { letter: Letter; html: string; trap?: string }[];
  answer: Letter;
  solutionHtml: string;
  hint: string | null;
  prerequisites: string[];
  wordCount: number;
  /** Só presente quando o item pode pesar na nota. */
  irt: IrtParams | null;
  medianCorrectMs: number | null;
  correctSamples: number;
  topicWeight: number;
}

const SELECT = `
  SELECT i.*, st.median_correct_ms, coalesce(st.correct_samples, 0) AS correct_samples, coalesce(t.weight, 0) AS weight
  FROM items i
  LEFT JOIN item_stats st ON st.item_id = i.id
  LEFT JOIN topics t ON t.area = i.area AND t.discipline = i.discipline AND t.topic = i.topic`;

const SCORING = new Set(["official", "calibrated"]);

function toItem(r: Record<string, any>): CatalogItem {
  return {
    id: r.id,
    area: r.area,
    discipline: r.discipline,
    topic: r.topic,
    skill: r.skill,
    contextHtml: r.context_html,
    stemHtml: r.stem_html,
    alternatives: r.alternatives,
    answer: r.answer,
    solutionHtml: r.solution_html,
    hint: r.hint,
    prerequisites: r.prerequisites,
    wordCount: r.word_count,
    irt: SCORING.has(r.calibration) && r.irt_a !== null ? { a: r.irt_a, b: r.irt_b, c: r.irt_c } : null,
    medianCorrectMs: r.median_correct_ms,
    correctSamples: r.correct_samples,
    topicWeight: r.weight,
  };
}

export async function loadServable(tx: Tx, filter: { area?: Area; discipline?: string } = {}): Promise<CatalogItem[]> {
  const rows = await tx.query(
    `${SELECT} WHERE i.status = 'published' AND ($1::text IS NULL OR i.area = $1) AND ($2::text IS NULL OR i.discipline = $2)`,
    [filter.area ?? null, filter.discipline ?? null],
  );
  return rows.map(toItem);
}

/** Inclui itens aposentados: uma tentativa antiga continua sendo corrigível. */
export async function loadItems(tx: Tx, ids: readonly string[]): Promise<Map<string, CatalogItem>> {
  if (ids.length === 0) return new Map();
  const rows = await tx.query(`${SELECT} WHERE i.id = ANY($1::uuid[]) AND i.stem_html IS NOT NULL`, [[...new Set(ids)]]);
  return new Map(rows.map((r) => [r.id, toItem(r)]));
}

export const toCandidate = (item: CatalogItem): Candidate => ({
  id: item.id,
  area: item.area,
  discipline: item.discipline,
  topic: item.topic,
  wordCount: item.wordCount,
  irt: item.irt,
  medianCorrectMs: item.medianCorrectMs,
  correctSamples: item.correctSamples,
  topicWeight: item.topicWeight,
});

export const toPracticeItem = (item: CatalogItem, extraMinutes: number): PracticeItem => ({
  id: item.id,
  area: item.area,
  discipline: item.discipline,
  topic: item.topic,
  skill: item.skill,
  contextHtml: item.contextHtml,
  stemHtml: item.stemHtml,
  alternatives: item.alternatives.map(({ letter, html }) => ({ letter, html })),
  targetSeconds: targetSeconds(toCandidate(item), extraMinutes),
  wordCount: item.wordCount,
});

export const toAnswerKey = (item: CatalogItem): PracticeAnswerKey => ({
  answer: item.answer,
  solutionHtml: item.solutionHtml,
  hint: item.hint,
  traps: Object.fromEntries(item.alternatives.filter((a) => a.trap).map((a) => [a.letter, a.trap!])),
});

const plain = (html: string) => html.replace(/<svg[\s\S]*?<\/svg>/g, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ");

export function countWords(item: Pick<CanonicalItem, "contextHtml" | "stemHtml">): number {
  return plain(`${item.contextHtml} ${item.stemHtml}`).split(/\s+/).filter(Boolean).length;
}

export type SaveOutcome = "created" | "updated" | "unchanged";

/**
 * Grava uma questão canônica. Parâmetros oficiais já catalogados são preservados
 * quando o texto chega depois, e item de IA nunca é publicado sem revisão.
 */
export async function saveItem(tx: Tx, item: CanonicalItem, runId: string, calibrationOverride?: string): Promise<SaveOutcome> {
  const hash = createHash("sha256").update(JSON.stringify(item)).digest("hex");
  const current = (await tx.query(`SELECT id, content_hash, calibration, irt_a FROM items WHERE external_id = $1`, [item.externalId]))[0];
  if (current?.content_hash === hash) return "unchanged";
  const status = item.rightsCleared && item.source !== "ai_generated" ? "published" : "review";
  const hasOfficial = !item.irt && current?.calibration === "official";
  const calibration = calibrationOverride ?? (hasOfficial ? "official" : item.irt && item.source === "inep_official" ? "official" : "provisional");
  await tx.query(
    `INSERT INTO items (external_id, source, area, discipline, topic, skill, competency, year, application, context_html, stem_html,
       alternatives, answer, solution_html, hint, prerequisites, word_count, status, rights_cleared, rights_note, calibration,
       irt_a, irt_b, irt_c, content_hash, ingest_run_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
     ON CONFLICT (external_id) DO UPDATE SET source = excluded.source, area = excluded.area, discipline = excluded.discipline,
       topic = excluded.topic, skill = coalesce(excluded.skill, items.skill), competency = coalesce(excluded.competency, items.competency),
       year = coalesce(excluded.year, items.year), application = coalesce(excluded.application, items.application),
       context_html = excluded.context_html, stem_html = excluded.stem_html, alternatives = excluded.alternatives, answer = excluded.answer,
       solution_html = excluded.solution_html, hint = excluded.hint, prerequisites = excluded.prerequisites, word_count = excluded.word_count,
       status = excluded.status, rights_cleared = excluded.rights_cleared, rights_note = excluded.rights_note, calibration = excluded.calibration,
       irt_a = coalesce(excluded.irt_a, items.irt_a), irt_b = coalesce(excluded.irt_b, items.irt_b), irt_c = coalesce(excluded.irt_c, items.irt_c),
       content_hash = excluded.content_hash, ingest_run_id = excluded.ingest_run_id, updated_at = now()`,
    [item.externalId, item.source, item.area, item.discipline, item.topic, item.skill ?? null, item.competency ?? null, item.year ?? null,
     item.application ?? null, item.contextHtml, item.stemHtml, JSON.stringify(item.alternatives), item.answer, item.solutionHtml,
     item.hint ?? null, item.prerequisites, countWords(item), status, item.rightsCleared, item.rightsNote ?? null, calibration,
     item.irt?.a ?? null, item.irt?.b ?? null, item.irt?.c ?? null, hash, runId],
  );
  return current ? "updated" : "created";
}

export interface CatalogEntry {
  externalId: string;
  area: Area;
  discipline: string;
  topic: string;
  skill?: string;
  year?: number;
  application?: string;
  answer?: Letter;
  irt?: IrtParams;
}

/** Só metadados: guarda parâmetros e peso sem texto. Fica fora do alcance do aluno. */
export async function saveCatalogEntry(tx: Tx, e: CatalogEntry, runId: string): Promise<void> {
  await tx.query(
    `INSERT INTO items (external_id, source, area, discipline, topic, skill, year, application, answer, status, calibration, irt_a, irt_b, irt_c, ingest_run_id)
     VALUES ($1,'inep_official',$2,$3,$4,$5,$6,$7,$8,'catalog',$9,$10,$11,$12,$13)
     ON CONFLICT (external_id) DO UPDATE SET irt_a = coalesce(items.irt_a, excluded.irt_a), irt_b = coalesce(items.irt_b, excluded.irt_b),
       irt_c = coalesce(items.irt_c, excluded.irt_c), skill = coalesce(items.skill, excluded.skill),
       calibration = CASE WHEN items.calibration = 'provisional' AND excluded.irt_a IS NOT NULL THEN 'official' ELSE items.calibration END`,
    [e.externalId, e.area, e.discipline, e.topic, e.skill ?? null, e.year ?? null, e.application ?? null, e.answer ?? null,
     e.irt ? "official" : "provisional", e.irt?.a ?? null, e.irt?.b ?? null, e.irt?.c ?? null, runId],
  );
}

export async function setTopicWeights(tx: Tx): Promise<void> {
  await tx.exec(`
    DELETE FROM topics;
    INSERT INTO topics (area, discipline, topic, weight)
    SELECT area, discipline, topic, count(*)::float / sum(count(*)) OVER (PARTITION BY area, discipline)
    FROM items WHERE source = 'inep_official' GROUP BY area, discipline, topic;
    INSERT INTO topics (area, discipline, topic, weight)
    SELECT DISTINCT area, discipline, topic, 0.02 FROM items WHERE status = 'published'
    ON CONFLICT DO NOTHING;`);
}
