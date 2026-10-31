// Contas fora do painel. Uso: npm run conta:admin -- email "Nome" | npm run conta:senha -- email
import { randomUUID } from "node:crypto";
import { hashPassword, resetPassword, temporaryPassword } from "../modules/identity/index.ts";
import { openDatabase } from "../platform/open.ts";

const [command, email, name] = process.argv.slice(2);
if (!email || (command === "admin" && !name) || !["admin", "senha"].includes(command ?? "")) {
  console.error('Uso: npm run conta:admin -- email "Nome"   ou   npm run conta:senha -- email');
  process.exit(1);
}
const db = await openDatabase();
const password = await db.system(async (tx) => {
  const user = (await tx.query(`SELECT id FROM users WHERE lower(email) = lower($1)`, [email]))[0];
  if (user) return resetPassword(tx, user.id);
  if (command === "senha") return null;
  const temporary = temporaryPassword();
  const { hash, salt } = await hashPassword(temporary);
  await tx.query(
    `INSERT INTO users (id, email, name, role, pass_hash, pass_salt, must_change_password) VALUES ($1,$2,$3,'network_admin',$4,$5,true)`,
    [randomUUID(), email.toLowerCase(), name, hash, salt],
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
