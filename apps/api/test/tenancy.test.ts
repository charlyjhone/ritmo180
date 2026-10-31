import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { openPglite } from "../src/platform/db-pglite.ts";
import { migrate } from "../src/platform/migrate.ts";
import { one, type Database } from "../src/platform/db.ts";

let db: Database;
let schoolA: string;
let schoolB: string;

beforeAll(async () => {
  db = await openPglite();
  await migrate(db);
  await db.system(async (tx) => {
    schoolA = one(await tx.query(`INSERT INTO schools (name, city, grades, slug) VALUES ('A','X','EM','a') RETURNING id`)).id;
    schoolB = one(await tx.query(`INSERT INTO schools (name, city, grades, slug) VALUES ('B','Y','EM','b') RETURNING id`)).id;
    await tx.query(`INSERT INTO users (school_id, email, name, role) VALUES ($1,'a@x.br','Aluno A','student'), ($2,'b@x.br','Aluno B','student')`, [schoolA, schoolB]);
  });
});
afterAll(() => db.close());

describe("isolamento por escola no banco", () => {
  it("uma escola não lê dados da outra, mesmo sem filtro na consulta", async () => {
    const rows = await db.tenant({ schoolId: schoolA }, (tx) => tx.query(`SELECT name FROM users`));
    expect(rows.map((r) => r.name)).toEqual(["Aluno A"]);
  });

  it("uma escola não grava linha em nome de outra", async () => {
    await expect(
      db.tenant({ schoolId: schoolA }, (tx) => tx.query(`INSERT INTO users (school_id, name, role) VALUES ($1, 'Invasor', 'student')`, [schoolB])),
    ).rejects.toThrow(/row-level security/);
  });

  it("sem escola definida nenhuma linha aparece", async () => {
    const rows = await db.tenant({ schoolId: "00000000-0000-0000-0000-000000000000" }, (tx) => tx.query(`SELECT * FROM users`));
    expect(rows).toEqual([]);
  });

  it("escopo de rede lê todas as escolas, mas não altera", async () => {
    const rows = await db.network((tx) => tx.query(`SELECT name FROM users ORDER BY name`));
    expect(rows).toHaveLength(2);
    await expect(db.network((tx) => tx.query(`UPDATE users SET name = 'x'`))).resolves.toEqual([]);
    const after = await db.network((tx) => tx.query(`SELECT name FROM users ORDER BY name`));
    expect(after.map((r) => r.name)).toEqual(["Aluno A", "Aluno B"]);
  });

  it("tentativas são imutáveis para a aplicação", async () => {
    await expect(db.tenant({ schoolId: schoolA }, (tx) => tx.query(`DELETE FROM attempts`))).rejects.toThrow(/permission denied/);
  });

  it("não publica questão sem direitos confirmados", async () => {
    await expect(
      db.system((tx) => tx.query(`INSERT INTO items (external_id, source, area, discipline, topic, stem_html, alternatives, answer, status)
        VALUES ('x','third_party','CN','Física','t','s','[]','A','published')`)),
    ).rejects.toThrow(/check constraint/);
  });
});
