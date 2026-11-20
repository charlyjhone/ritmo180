import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openPglite } from "../apps/api/src/platform/db-pglite.ts";
import { migrate } from "../apps/api/src/platform/migrate.ts";
import type { Database } from "../apps/api/src/platform/db.ts";
import { seedDemo } from "../apps/api/src/seed/demo.ts";
import { takeSnapshot, verifySnapshot } from "./backup.ts";

describe("cópia de segurança", () => {
  let db: Database;
  beforeAll(async () => {
    db = await openPglite();
    await migrate(db);
    await seedDemo(db, { now: Date.UTC(2027, 2, 1), password: "senha-de-teste-123", studentsPerClass: 3, days: 7 });
    await db.system((tx) => tx.query(`UPDATE schools SET logo_png = '\\x89504e47'::bytea`));
  }, 120_000);
  afterAll(() => db.close());

  it("copia todas as tabelas, menos as sessões, e a cópia restaura inteira", async () => {
    const snapshot = await takeSnapshot(db);
    expect(snapshot.tables.sessions).toBeUndefined();
    expect(snapshot.tables.schools![0]!.logo_png).toBe("\\x89504e47");
    expect(snapshot.migrations.length).toBeGreaterThan(5);
    const result = await verifySnapshot(JSON.parse(JSON.stringify(snapshot)));
    expect(result.problems).toEqual([]);
    expect(result.rows).toBeGreaterThan(100);
  }, 120_000);

  it("aponta tabela que o projeto não conhece", async () => {
    const result = await verifySnapshot({ createdAt: "", migrations: [], tables: { tabela_antiga: [{ id: 1 }] } });
    expect(result.problems[0]).toContain("tabela_antiga");
  }, 60_000);
});
