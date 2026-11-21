// Importa um lote validado para o banco. Usado pela linha de comando e pela demonstração.
import { randomUUID } from "node:crypto";
import type { BancoEntry, IngestBatch } from "@ritmo/ingest";
import type { Database } from "../platform/db.ts";
import { saveCatalogEntry, saveItem, setTopicWeights } from "../modules/catalog/index.ts";
import { countWords, PREREQUISITES, READING_TEXTS } from "./content.ts";

/** `review`: as questões vão para a fila de revisão em vez de serem publicadas direto. */
export async function importBatch(db: Database, batch: IngestBatch, adapter: string, origin: string, review = false) {
  return db.system(async (tx) => {
    const runId = randomUUID();
    await tx.query(`INSERT INTO ingest_runs (id, adapter, origin) VALUES ($1,$2,$3)`, [runId, adapter, origin]);
    const counts = { created: 0, updated: 0, unchanged: 0, rejected: batch.rejected.length, toReview: 0 };
    for (const item of batch.items) {
      counts[await saveItem(tx, item, runId, undefined, review)]++;
      if (!item.rightsCleared || review) counts.toReview++;
    }
    await tx.query(`UPDATE ingest_runs SET created = $2, updated = $3, rejected = $4 WHERE id = $1`, [runId, counts.created, counts.updated, counts.rejected]);
    await setTopicWeights(tx);
    return counts;
  });
}

export async function importBanco(db: Database, entries: readonly BancoEntry[], origin: string) {
  return db.system(async (tx) => {
    const runId = randomUUID();
    await tx.query(`INSERT INTO ingest_runs (id, adapter, origin, created) VALUES ($1,'banco',$2,$3)`, [runId, origin, entries.length]);
    for (const entry of entries) await saveCatalogEntry(tx, entry, runId);
    await setTopicWeights(tx);
    return { catalogued: entries.length, withOfficialParams: entries.filter((e) => e.irt).length };
  });
}

/** Publica as questões oficiais em revisão. Só deve rodar depois que alguém confirmar os direitos de uso. */
export async function releaseOfficialItems(db: Database, confirmedBy: string): Promise<number> {
  return db.system(async (tx) => {
    const released = await tx.query(
      `UPDATE items SET status = 'published', rights_cleared = true, rights_note = coalesce(rights_note, '') || $1, updated_at = now()
       WHERE source = 'inep_official' AND status = 'review' AND stem_html IS NOT NULL AND alternatives IS NOT NULL AND answer IS NOT NULL RETURNING id`,
      [` Direitos confirmados por ${confirmedBy}.`],
    );
    await setTopicWeights(tx);
    return released.length;
  });
}

export async function installBaseContent(db: Database): Promise<void> {
  await db.system(async (tx) => {
    for (const p of PREREQUISITES) {
      await tx.query(`INSERT INTO prerequisites (key, name, grade, areas) VALUES ($1,$2,$3,$4) ON CONFLICT (key) DO UPDATE SET name = excluded.name`, [p.key, p.name, p.grade, p.areas]);
    }
    for (const t of READING_TEXTS) {
      await tx.query(
        `INSERT INTO reading_texts (external_id, title, body, words, grade, questions, rights_cleared) VALUES ($1,$2,$3,$4,$5,$6,true)
         ON CONFLICT (external_id) DO UPDATE SET title = excluded.title, body = excluded.body, words = excluded.words, questions = excluded.questions`,
        [t.externalId, t.title, t.body, countWords(t.body), t.grade, JSON.stringify(t.questions)],
      );
    }
  });
}
