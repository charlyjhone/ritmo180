// Garante as fronteiras da arquitetura: quem mexe em um módulo não quebra outro por acidente.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

const imports = (path: string) => [...readFileSync(path, "utf8").matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);

describe("fronteiras", () => {
  it("módulo só usa outro módulo pelo index", () => {
    const offenders: string[] = [];
    const modulesDir = join(ROOT, "apps/api/src/modules");
    for (const file of sources(modulesDir)) {
      const own = relative(modulesDir, file).split(sep)[0];
      for (const target of imports(file)) {
        const match = target.match(/^\.\.\/([a-z-]+)\/(.+)$/);
        if (match && match[1] !== own && match[1] !== ".." && match[2] !== "index.ts") offenders.push(`${relative(ROOT, file)} -> ${target}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("nada fora de app.ts, seed e cli entra em módulo pelo caminho interno", () => {
    const offenders = ["apps/api/src/app.ts", ...sources(join(ROOT, "apps/api/src/seed")).map((f) => relative(ROOT, f)), ...sources(join(ROOT, "apps/api/src/cli")).map((f) => relative(ROOT, f))]
      .flatMap((file) => imports(join(ROOT, file)).filter((t) => t.includes("/modules/") && !t.endsWith("/index.ts")).map((t) => `${file} -> ${t}`));
    expect(offenders).toEqual([]);
  });

  it("o motor é puro: sem banco, rede, disco nem framework", () => {
    const offenders = sources(join(ROOT, "packages/engine/src")).flatMap((file) => imports(file).filter((t) => !t.startsWith("./")));
    expect(offenders).toEqual([]);
  });

  it("contratos só dependem de zod", () => {
    const offenders = sources(join(ROOT, "packages/contracts/src")).flatMap((file) => imports(file).filter((t) => !t.startsWith("./") && t !== "zod"));
    expect(offenders).toEqual([]);
  });

  it("o importador não conhece a API", () => {
    const offenders = sources(join(ROOT, "packages/ingest/src")).flatMap((file) => imports(file).filter((t) => t.includes("apps/") || t === "@ritmo/api"));
    expect(offenders).toEqual([]);
  });

  it("a interface só fala com o servidor pelos contratos", () => {
    const offenders = sources(join(ROOT, "apps/web/src")).flatMap((file) => imports(file).filter((t) => t.startsWith("@ritmo/") && t !== "@ritmo/contracts" && t !== "@ritmo/engine"));
    expect(offenders).toEqual([]);
  });

  it("toda tabela com dado de escola tem isolamento", () => {
    const sql = readFileSync(join(ROOT, "apps/api/migrations/001_core.sql"), "utf8");
    const withSchool = [...sql.matchAll(/CREATE TABLE (\w+) \(([\s\S]*?)\n\);/g)].filter((m) => /\bschool_id uuid/.test(m[2]!)).map((m) => m[1]!);
    const listed = sql.match(/FOREACH t IN ARRAY ARRAY\[([\s\S]*?)\]/)![1]!;
    expect(withSchool.filter((t) => !listed.includes(`'${t}'`))).toEqual([]);
  });
});
