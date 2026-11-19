// Publica as questões oficiais importadas. Uso: npm run content:liberar -- "Nome de quem confirmou os direitos"
import { openDatabase } from "../platform/open.ts";
import { releaseOfficialItems } from "../seed/install.ts";

const confirmedBy = process.argv[2]?.trim();
if (!confirmedBy) {
  console.error('Informe quem confirmou os direitos: npm run content:liberar -- "Nome"');
  process.exit(1);
}
const db = await openDatabase();
console.log(`${await releaseOfficialItems(db, confirmedBy)} questões publicadas.`);
await db.close();
