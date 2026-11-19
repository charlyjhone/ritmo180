// Pede à IA resolução, dica e erros comentados. Uso: npm run content:completar -- 20
import { enrichItems } from "../modules/content/index.ts";
import { createClaudeLlm } from "../platform/llm.ts";
import { openDatabase } from "../platform/open.ts";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 500;

const limit = Number(process.argv[2] ?? DEFAULT_LIMIT);
if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
  console.error(`Informe quantas questões completar, de 1 a ${MAX_LIMIT}.`);
  process.exit(1);
}
const llm = createClaudeLlm();
if (!llm) {
  console.error("Configure ANTHROPIC_API_KEY para usar este comando.");
  process.exit(1);
}
const db = await openDatabase();
const { suggested, failed } = await enrichItems(db, llm, limit);
await db.close();
console.log(`${suggested} sugestões aguardando revisão no painel da rede. ${failed} falharam.`);
