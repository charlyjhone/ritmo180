// Importa questões. Uso: npm run ingest -- <arquivo> [--relatorio saida.json]
import { writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { normalizeItems, parseBanco, parseCanonicalJson, parseSpreadsheet } from "@ritmo/ingest";
import { openDatabase } from "../platform/open.ts";
import { importBanco, importBatch, installBaseContent } from "../seed/install.ts";

const [file, flag, reportPath] = process.argv.slice(2);
if (!file) {
  console.error("Uso: npm run ingest -- <arquivo.json|arquivo.xlsx> [--relatorio saida.json]");
  process.exit(1);
}

const isBanco = /^Banco_ENEM/i.test(basename(file));
const db = await openDatabase();
await installBaseContent(db);
if (isBanco) {
  console.log(await importBanco(db, await parseBanco(file), basename(file)));
} else {
  const raw = extname(file).toLowerCase() === ".json" ? parseCanonicalJson(await readFile(file, "utf8")) : await parseSpreadsheet(file);
  const batch = normalizeItems(raw);
  console.log(await importBatch(db, batch, extname(file).slice(1), basename(file)));
  for (const r of batch.rejected.slice(0, 20)) console.log(`Rejeitada ${r.id}: ${r.errors.join("; ")}`);
  if (flag === "--relatorio" && reportPath) writeFileSync(reportPath, JSON.stringify(batch.rejected, null, 1));
}
await db.close();
