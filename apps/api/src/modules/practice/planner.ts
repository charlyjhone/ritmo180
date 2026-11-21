// Monta o treino do dia a partir do banco de questões e do histórico do aluno.
import type { CommandModule, PlannedBlockView, PracticeSessionPack } from "@ritmo/contracts";
import { diagnoseTime, estimateTheta, planSession, sumPhases, type LearnerSnapshot, type PlannedBlock } from "@ritmo/engine";
import type { Tx } from "../../platform/db.ts";
import { loadCandidates, loadItems, toAnswerKey, toPracticeItem } from "../catalog/index.ts";
import { createSessionRow } from "./attempts.ts";
import { dueReviews } from "./mistakes.ts";
import { computeSnapshot, extraMinutesOf, irtFor, loadAttempts, scoreResponses } from "./progress.ts";

const DAY_MS = 86_400_000;
const ASSIGNMENT_DAYS = 7;
const ASSIGNMENT_BOOST = 1;

/**
 * Assuntos que sobem na fila: tarefas do professor ainda abertas e assuntos em que o aluno disse
 * mais de uma vez que errou por não saber o conteúdo.
 */
async function assignedTopics(tx: Tx, studentId: string, now: number): Promise<Set<string>> {
  const rows = await tx.query(
    `SELECT DISTINCT a.topic FROM assignments a
     LEFT JOIN class_students cs ON cs.class_id = a.class_id AND cs.student_id = $1
     WHERE (a.student_id = $1 OR (a.student_id IS NULL AND cs.student_id IS NOT NULL))
       AND CASE WHEN a.due_on IS NULL THEN a.created_at >= $2 ELSE a.due_on >= ($3::timestamptz - interval '3 hours')::date END
     UNION
     SELECT topic FROM miss_reasons WHERE student_id = $1 AND reason = 'content' AND at >= $4 GROUP BY topic HAVING count(*) >= $5`,
    [studentId, new Date(now - ASSIGNMENT_DAYS * DAY_MS), new Date(now), new Date(now - CONTENT_MISS_DAYS * DAY_MS), CONTENT_MISSES_TO_BOOST],
  );
  return new Set(rows.map((r) => r.topic));
}
const CONTENT_MISS_DAYS = 21;
const CONTENT_MISSES_TO_BOOST = 2;

interface Focus {
  discipline?: string;
  topic?: string;
  mistakes?: boolean;
}

async function buildPlan(tx: Tx, studentId: string, minutes: number, now: number, focus: Focus = {}, mistakes: Map<string, string> | null = null): Promise<PlannedBlock[]> {
  const items = (await loadCandidates(tx, focus)).filter((item) => !mistakes || mistakes.has(item.id));
  const attempts = await loadAttempts(tx, studentId);
  const irt = await irtFor(tx, attempts);
  const snapshot = computeSnapshot(studentId, attempts, irt, now);
  const assigned = await assignedTopics(tx, studentId, now);
  const main = (["CN", "MT", "LC", "CH"] as const).map((area) => scoreResponses(attempts, irt, area)).sort((x, y) => y.length - x.length)[0] ?? [];
  const targetMs = attempts.length ? attempts.slice(0, 40).reduce((sum, a) => sum + a.targetMs, 0) / Math.min(40, attempts.length) : 0;
  const learner: LearnerSnapshot = {
    theta: main.length ? estimateTheta(main).theta : null,
    mastery: new Map(Object.entries(snapshot.mastery).map(([topic, m]) => [topic, m.mastery])),
    bottleneck: snapshot.phases && sumPhases(snapshot.phases) ? diagnoseTime(snapshot.phases, targetMs).bottleneck : null,
    // No caderno de erros o aluno pede para refazer: o intervalo sem repetir não vale.
    attempts: mistakes ? attempts.filter((a) => !mistakes.has(a.itemId)) : attempts,
    now,
    seed: `${studentId}:${Math.floor(now / DAY_MS)}`,
  };
  const candidates = items.map((item) => ({ ...item, topicWeight: item.topicWeight + (assigned.has(item.topic) ? ASSIGNMENT_BOOST : 0) }));
  return planSession(candidates, learner, minutes);
}

const blockView = (b: PlannedBlock): PlannedBlockView => ({ kind: b.kind, title: b.title, reason: b.reason, minutes: b.minutes, itemIds: b.items.map((i) => i.itemId) });

export async function previewPlan(tx: Tx, studentId: string, now: number): Promise<PlannedBlockView[]> {
  return (await buildPlan(tx, studentId, 25, now)).map(blockView);
}

export async function createPracticeSession(
  tx: Tx,
  student: { id: string; schoolId: string },
  input: { mode: "guided" | "exam"; minutes: number } & Focus,
  now: number,
): Promise<PracticeSessionPack> {
  const due = input.mistakes ? await dueReviews(tx, student.id, now) : null;
  const blocks = await buildPlan(tx, student.id, input.minutes, now, input, due);
  const views = blocks.map(blockView);
  const sessionId = await createSessionRow(tx, student, input.mode, views);
  const extra = await extraMinutesOf(tx, student.id);
  const planned = blocks.flatMap((b) => b.items);
  const items = await loadItems(tx, planned.map((p) => p.itemId));
  const chosen = planned.map((entry) => {
    const item = items.get(entry.itemId)!;
    return { ...toPracticeItem(item, extra), key: toAnswerKey(item), reason: !due ? entry.reason : due.get(item.id) === "spaced" ? "Revisão espaçada: você acertou antes, veja se ainda lembra" : "Questão do seu caderno de erros" };
  });
  const wanted = Math.floor(input.minutes / 3);
  let notice: string | null = null;
  if (chosen.length === 0 && input.mistakes) notice = "Não há questões para rever hoje nesta escolha. Seu caderno de erros está em dia.";
  else if (chosen.length === 0) notice = input.discipline ? "Você já praticou todas as questões desta escolha nas últimas semanas. Escolha outro assunto ou volte em alguns dias." : "Você já praticou todas as questões disponíveis nas últimas semanas. Novas questões aparecem aqui assim que entrarem no banco.";
  else if (chosen.length < wanted) notice = `Só há ${chosen.length} ${chosen.length === 1 ? "questão inédita" : "questões inéditas"} para você agora; o restante do tempo fica para quando o banco crescer.`;
  return { sessionId, mode: input.mode, blocks: views, items: chosen, notice };
}

/**
 * Leitura de comando: as questões do módulo, na ordem do guia, com a explicação de cada
 * alternativa errada. Questão que não estiver publicada neste banco fica de fora.
 */
export async function createCommandSession(
  tx: Tx,
  student: { id: string; schoolId: string },
  module: CommandModule,
): Promise<PracticeSessionPack> {
  const rows = await tx.query(`SELECT id, external_id FROM items WHERE status = 'published' AND external_id = ANY($1)`, [module.items.map((i) => i.externalId)]);
  const idOf = new Map(rows.map((r) => [r.external_id as string, r.id as string]));
  const present = module.items.filter((i) => idOf.has(i.externalId));
  const items = await loadItems(tx, present.map((i) => idOf.get(i.externalId)!));
  const extra = await extraMinutesOf(tx, student.id);
  const reason = `Leitura de comando ${module.id} · ${module.errorName}. ${module.check}`;
  const chosen = present.map((entry) => {
    const item = items.get(idOf.get(entry.externalId)!)!;
    const key = toAnswerKey(item);
    return { ...toPracticeItem(item, extra), key: { ...key, traps: { ...key.traps, ...entry.traps } }, reason };
  });
  const view: PlannedBlockView = { kind: "command", title: `Leitura de comando ${module.id}: ${module.title}`, reason: module.problem, minutes: chosen.length * 4, itemIds: chosen.map((i) => i.id) };
  const sessionId = await createSessionRow(tx, student, "guided", [view]);
  const notice = chosen.length ? null : "As questões deste módulo ainda não estão no banco da sua escola.";
  return { sessionId, mode: "guided", blocks: [view], items: chosen, notice };
}
