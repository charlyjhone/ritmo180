// Cria a escola de demonstração em banco local. Senha em data/credenciais-demonstracao.txt.
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { DATA_DIR, openDatabase } from "../platform/open.ts";
import { seedDemo } from "../seed/demo.ts";

if (process.env.NODE_ENV === "production") {
  console.error("A demonstração usa parâmetros simulados e não pode rodar em produção.");
  process.exit(1);
}

const db = await openDatabase();
const existing = await db.system((tx) => tx.query(`SELECT 1 FROM schools WHERE slug = 'modelo'`));
if (existing.length > 0) {
  console.log("A demonstração já existe. Apague a pasta data/ para recriar.");
} else {
  const password = process.env.SEED_PASSWORD || randomBytes(9).toString("base64url");
  const started = Date.now();
  const a = await seedDemo(db, { now: Date.now(), password });
  writeFileSync(
    `${DATA_DIR}/credenciais-demonstracao.txt`,
    [`senha de todos: ${password}`, `aluno: ${a.student}`, `professor: ${a.teacher}`, `direção: ${a.coordinator}`, `família: ${a.guardian}`, `rede: ${a.network}`, ""].join("\n"),
    { mode: 0o600 },
  );
  console.log(`Demonstração criada em ${Math.round((Date.now() - started) / 1000)} s. Acessos em data/credenciais-demonstracao.txt`);
}
await db.close();
