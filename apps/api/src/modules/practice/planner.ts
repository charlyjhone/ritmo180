// Monta o treino do dia a partir do banco de questões e do histórico do aluno.
import type { PlannedBlockView, PracticeSessionPack } from "@ritmo/contracts";
import { diagnoseTime, estimateTheta, planSession, sumPhases, type LearnerSnapshot, type PlannedBlock } from "@ritmo/engine";
import type { Tx } from "../../platform/db.ts";
import { loadCandidates, loadItems, toAnswerKey, toPracticeItem } from "../catalog/index.ts";
import { createSessionRow } from "./attempts.ts";
import { pendingMistakeIds } from "./mistakes.ts";
import { computeSnapshot, extraMinutesOf, irtFor, loadAttempts, scoreResponses } from "./progress.ts";

const DAY_MS = 86_400_000;
const ASSIGNMENT_DAYS = 7;
const ASSIGNMENT_BOOST = 1;

async function assignedTopics(tx: Tx, studentId: string, now: number): Promise<Set<string>> {
  const rows = await tx.query(
    `SELECT DISTINCT a.topic FROM assignments a
     LEFT JOIN class_students cs ON cs.class_id = a.class_id AND cs.student_id = $1
     WHERE a.created_at >= $2 AND (a.student_id = $1 OR (a.student_id IS NULL AND cs.student_id IS NOT NULL))`,
    [studentId, new Date(now - ASSIGNMENT_DAYS * DAY_MS)],
  );
  return new Set(rows.map((r) => r.topic));
}

interface Focus {
  discipline?: string;
  topic?: string;
  mistakes?: boolean;
}

async function buildPlan(tx: Tx, studentId: string, minutes: number, now: number, focus: Focus = {}): Promise<PlannedBlock[]> {
  const mistakes = focus.mistakes ? await pendingMistakeIds(tx, studentId) : null;
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
  const blocks = await buildPlan(tx, student.id, input.minutes, now, input);
  const views = blocks.map(blockView);
  const sessionId = await createSessionRow(tx, student, input.mode, views);
  const extra = await extraMinutesOf(tx, student.id);
  const planned = blocks.flatMap((b) => b.items);
  const items = await loadItems(tx, planned.map((p) => p.itemId));
  const chosen = planned.map((entry) => {
    const item = items.get(entry.itemId)!;
    return { ...toPracticeItem(item, extra), key: toAnswerKey(item), reason: input.mistakes ? "Questão do seu caderno de erros" : entry.reason };
  });
  const wanted = Math.floor(input.minutes / 3);
  let notice: string | null = null;
  if (chosen.length === 0 && input.mistakes) notice = "Não há questões para refazer nesta escolha. Seu caderno de erros está em dia.";
  else if (chosen.length === 0) notice = input.discipline ? "Você já praticou todas as questões desta escolha nas últimas semanas. Escolha outro assunto ou volte em alguns dias." : "Você já praticou todas as questões disponíveis nas últimas semanas. Novas questões aparecem aqui assim que entrarem no banco.";
  else if (chosen.length < wanted) notice = `Só há ${chosen.length} ${chosen.length === 1 ? "questão inédita" : "questões inéditas"} para você agora; o restante do tempo fica para quando o banco crescer.`;
  return { sessionId, mode: input.mode, blocks: views, items: chosen, notice };
}
