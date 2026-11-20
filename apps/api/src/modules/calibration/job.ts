// Tarefa periódica sobre as respostas de todas as escolas, menos visitantes. Grava só agregados, sem dado pessoal.
import { calibrateItem, estimateTheta, MIN_RESPONSES_TO_CALIBRATE, type IrtParams } from "@ritmo/engine";
import type { Database, Tx } from "../../platform/db.ts";
import { NOT_GUEST_ATTEMPT } from "../identity/index.ts";
import { refreshSnapshot } from "../practice/index.ts";

const MIN_RESPONSES_TO_FLAG = 30;
const SLOW_FACTOR = 1.6;

export const FLAG_INVERTED = "Quem tem nota alta acerta menos que quem tem nota baixa";
export const FLAG_SLOW = "Leva muito mais tempo que o previsto para esta questão";
/** Abaixo do chute (1 em 5): quase sempre é gabarito trocado. */
export const FLAG_TOO_HARD = "Quase ninguém acerta, menos que no chute: confira o gabarito";
/** Quase todos acertam: a resposta pode estar entregue no enunciado ou nas alternativas. */
export const FLAG_TOO_EASY = "Quase todos acertam: confira se o enunciado não entrega a resposta";
const TOO_HARD_RATE = 0.1;
const TOO_EASY_RATE = 0.97;

async function refreshStats(tx: Tx): Promise<void> {
  await tx.exec(`
    INSERT INTO item_stats (item_id, median_correct_ms, correct_samples, responses, updated_at)
    SELECT item_id,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY total_ms) FILTER (WHERE correct AND valid),
      count(*) FILTER (WHERE correct AND valid), count(*), now()
    FROM attempts a WHERE ${NOT_GUEST_ATTEMPT} GROUP BY item_id
    ON CONFLICT (item_id) DO UPDATE SET median_correct_ms = excluded.median_correct_ms,
      correct_samples = excluded.correct_samples, responses = excluded.responses, updated_at = now()`);
}

/** Posiciona cada aluno só com itens-âncora, para o item novo não influenciar a própria medida. */
async function anchoredThetas(tx: Tx): Promise<Map<string, number>> {
  const rows = await tx.query(`
    SELECT a.student_id, a.area, a.correct, i.irt_a, i.irt_b, i.irt_c
    FROM attempts a JOIN items i ON i.id = a.item_id
    WHERE a.valid AND ${NOT_GUEST_ATTEMPT} AND a.mode <> 'guided' AND i.calibration IN ('official','calibrated') AND i.irt_a IS NOT NULL`);
  const grouped = new Map<string, { params: IrtParams; correct: boolean }[]>();
  for (const r of rows) {
    const key = `${r.student_id}|${r.area}`;
    const entry = { params: { a: r.irt_a, b: r.irt_b, c: r.irt_c }, correct: r.correct };
    const list = grouped.get(key);
    if (list) list.push(entry);
    else grouped.set(key, [entry]);
  }
  return new Map([...grouped].filter(([, list]) => list.length >= 10).map(([key, list]) => [key, estimateTheta(list).theta]));
}

async function flagItem(tx: Tx, itemId: string, reason: string): Promise<void> {
  await tx.query(`INSERT INTO item_flags (item_id, reason) VALUES ($1, $2) ON CONFLICT (item_id, reason) DO NOTHING`, [itemId, reason]);
}

export async function runCalibration(db: Database, now: number) {
  return db.system(async (tx) => {
    await refreshStats(tx);
    const thetas = await anchoredThetas(tx);
    const rows = await tx.query(`
      SELECT a.item_id, a.student_id, a.area, a.correct, i.calibration
      FROM attempts a JOIN items i ON i.id = a.item_id WHERE a.valid AND ${NOT_GUEST_ATTEMPT} AND i.status = 'published'`);
    const byItem = new Map<string, { theta: number; correct: boolean }[]>();
    const calibrationOf = new Map<string, string>();
    for (const r of rows) {
      const theta = thetas.get(`${r.student_id}|${r.area}`);
      if (theta === undefined) continue;
      calibrationOf.set(r.item_id, r.calibration);
      const list = byItem.get(r.item_id);
      if (list) list.push({ theta, correct: r.correct });
      else byItem.set(r.item_id, [{ theta, correct: r.correct }]);
    }

    let examined = 0;
    let calibrated = 0;
    let discarded = 0;
    for (const [itemId, data] of byItem) {
      if (data.length >= MIN_RESPONSES_TO_FLAG) {
        const sorted = [...data].sort((x, y) => x.theta - y.theta);
        const half = Math.floor(sorted.length / 2);
        const rate = (list: typeof sorted) => list.filter((d) => d.correct).length / list.length;
        if (rate(sorted.slice(half)) < rate(sorted.slice(0, half))) await flagItem(tx, itemId, FLAG_INVERTED);
      }
      if (calibrationOf.get(itemId) !== "provisional" || data.length < MIN_RESPONSES_TO_CALIBRATE) continue;
      examined++;
      const result = calibrateItem(data);
      if (result.lowDiscrimination) {
        discarded++;
        await tx.query(`UPDATE items SET calibration = 'discarded', status = 'retired', updated_at = now() WHERE id = $1`, [itemId]);
      } else {
        calibrated++;
        const { a, b, c } = result.params;
        await tx.query(`UPDATE items SET calibration = 'calibrated', irt_a = $2, irt_b = $3, irt_c = $4, updated_at = now() WHERE id = $1`, [itemId, a, b, c]);
      }
    }

    const slow = await tx.query(`
      SELECT a.item_id FROM attempts a WHERE a.valid AND ${NOT_GUEST_ATTEMPT} GROUP BY a.item_id
      HAVING count(*) >= ${MIN_RESPONSES_TO_FLAG} AND percentile_cont(0.5) WITHIN GROUP (ORDER BY a.total_ms) > ${SLOW_FACTOR} * avg(a.target_ms)`);
    for (const r of slow) await flagItem(tx, r.item_id, FLAG_SLOW);

    const extremes = await tx.query(`
      SELECT a.item_id, avg(CASE WHEN a.correct THEN 1 ELSE 0 END)::float AS rate FROM attempts a JOIN items i ON i.id = a.item_id
      WHERE a.valid AND ${NOT_GUEST_ATTEMPT} AND i.status = 'published' GROUP BY a.item_id HAVING count(*) >= ${MIN_RESPONSES_TO_FLAG}`);
    for (const r of extremes) {
      if (r.rate < TOO_HARD_RATE) await flagItem(tx, r.item_id, FLAG_TOO_HARD);
      else if (r.rate > TOO_EASY_RATE) await flagItem(tx, r.item_id, FLAG_TOO_EASY);
    }

    await tx.query(`INSERT INTO calibration_runs (examined, calibrated, discarded) VALUES ($1,$2,$3)`, [examined, calibrated, discarded]);
    if (calibrated + discarded > 0) {
      const students = await tx.query(`SELECT student_id, school_id FROM learner_snapshots`);
      for (const s of students) await refreshSnapshot(tx, s.student_id, s.school_id, now);
    }
    return { examined, calibrated, discarded };
  });
}
