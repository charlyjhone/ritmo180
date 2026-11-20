// Importa as aulas escritas em content/aulas.
// Uso: npm run content:aulas:importar             (entram na fila de revisão do painel da rede)
//      npm run content:aulas:importar -- "Nome"   (entram publicadas, em nome de quem conferiu)
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { AuthoredLessons, importLessons } from "../modules/lessons/index.ts";
import { openDatabase } from "../platform/open.ts";

const DIR = fileURLToPath(new URL("../../../../content/aulas", import.meta.url));
const publishedBy = process.argv[2]?.trim() || undefined;

const lessons = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort().flatMap((file) => {
  const parsed = AuthoredLessons.safeParse(JSON.parse(readFileSync(join(DIR, file), "utf8")));
  if (!parsed.success) {
    console.error(`${file}: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
    process.exit(1);
  }
  return parsed.data;
});
const db = await openDatabase();
const report = await importLessons(db, lessons, { publishedBy, now: Date.now() });
await db.close();
console.log(`${report.imported} aulas ${publishedBy ? "publicadas" : "na fila de revisão do painel da rede"}. ${report.kept} já estavam publicadas e foram mantidas.`);
if (report.unknown.length) console.log(`Sem questões no banco, ignoradas: ${report.unknown.join("; ")}`);
