// Pede à IA as aulas rápidas dos assuntos de mais peso. Uso: npm run content:aulas -- 20
import { generateLessons } from "../modules/lessons/index.ts";
import { createClaudeLlm } from "../platform/llm.ts";
import { openDatabase } from "../platform/open.ts";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;

const limit = Number(process.argv[2] ?? DEFAULT_LIMIT);
if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
  console.error(`Informe quantas aulas gerar, de 1 a ${MAX_LIMIT}.`);
  process.exit(1);
}
const llm = createClaudeLlm();
if (!llm) {
  console.error("Configure ANTHROPIC_API_KEY para usar este comando.");
  process.exit(1);
}
const db = await openDatabase();
const { suggested, failed } = await generateLessons(db, llm, limit);
await db.close();
console.log(`${suggested} aulas aguardando revisão no painel da rede. ${failed} falharam.`);
