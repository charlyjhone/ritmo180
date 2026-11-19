// Contas fora do painel.
// Uso: npm run conta:admin -- email "Nome" | npm run conta:senha -- email
//      npm run conta:coordenacao -- email "Nome" "Nome da escola" ["Cidade, UF"]
import { randomUUID } from "node:crypto";
import { hashPassword, resetPassword, temporaryPassword } from "../modules/identity/index.ts";
import { openDatabase } from "../platform/open.ts";
import type { Tx } from "../platform/db.ts";

const USAGE = 'Uso: npm run conta:admin -- email "Nome"   ou   npm run conta:senha -- email\n' +
  '     npm run conta:coordenacao -- email "Nome" "Nome da escola" ["Cidade, UF"]';
const [command, email, name, schoolName, city = "Macapá, AP"] = process.argv.slice(2);
const valid = email && (command === "senha" || (command === "admin" && name) || (command === "coordenacao" && name && schoolName));
if (!valid) {
  console.error(USAGE);
  process.exit(1);
}

const slugify = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/** A escola nasce em implantação: a coordenação completa os passos e libera pela página Implantação. */
async function schoolFor(tx: Tx, title: string): Promise<string> {
  const existing = (await tx.query(`SELECT id FROM schools WHERE lower(name) = lower($1)`, [title]))[0];
  if (existing) return existing.id;
  const id = randomUUID();
  await tx.query(`INSERT INTO schools (id, name, city, grades, slug) VALUES ($1,$2,$3,'EM',$4)`, [id, title, city, `${slugify(title)}-${id.slice(0, 4)}`]);
  return id;
}

const db = await openDatabase();
const password = await db.system(async (tx) => {
  const user = (await tx.query(`SELECT id FROM users WHERE lower(email) = lower($1)`, [email]))[0];
  if (user) return resetPassword(tx, user.id);
  if (command === "senha") return null;
  const temporary = temporaryPassword();
  const { hash, salt } = await hashPassword(temporary);
  const school = command === "coordenacao" ? await schoolFor(tx, schoolName!) : null;
  await tx.query(
    `INSERT INTO users (id, school_id, email, name, role, pass_hash, pass_salt, must_change_password) VALUES ($1,$2,$3,$4,$5,$6,$7,true)`,
    [randomUUID(), school, email.toLowerCase(), name, command === "coordenacao" ? "coordinator" : "network_admin", hash, salt],
  );
  return temporary;
});
await db.close();
if (!password) {
  console.error("Nenhuma conta com esse e-mail.");
  process.exit(1);
}
console.log(`Senha provisória de ${email}: ${password}`);
console.log("Ela só aparece agora e precisa ser trocada no primeiro acesso.");
