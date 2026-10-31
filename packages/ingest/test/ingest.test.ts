import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bancoRow, cleanHtml, normalizeItems, parseCanonicalJson, rowToCandidate } from "../src/index.ts";

const example = readFileSync(new URL("../examples/exemplo-disciplinas.json", import.meta.url), "utf8");
const base = () => structuredClone((parseCanonicalJson(example) as Record<string, any>[])[0]!);

describe("limpeza de HTML", () => {
  it("remove script, evento e link externo", () => {
    const html = cleanHtml(`<p onclick="x()">oi<script>alert(1)</script></p><img src="https://mal.example/x.png"><a href="javascript:x">y</a>`);
    expect(html).toContain("<p>oi</p>");
    expect(html).not.toMatch(/script|onclick|mal\.example|href/);
  });

  it("preserva figura SVG com atributos sensíveis a maiúsculas", () => {
    const html = cleanHtml(`<svg viewBox="0 0 10 10" onload="x()"><path d="M0 0L1 1" stroke="#000"/><text x="1" y="2">v</text></svg>`);
    expect(html).toContain('viewBox="0 0 10 10"');
    expect(html).toContain("<path");
    expect(html).not.toContain("onload");
  });
});

describe("validação canônica", () => {
  it("aceita as três disciplinas do exemplo", () => {
    const batch = normalizeItems(parseCanonicalJson(example));
    expect(batch.rejected).toEqual([]);
    expect(batch.items.map((i) => i.area)).toEqual(["MT", "CH", "LC"]);
  });

  it("rejeita disciplina de outra área e alternativas faltando, sem derrubar o lote", () => {
    const wrongArea = { ...base(), externalId: "a", discipline: "História" };
    const short = { ...base(), externalId: "b", alternatives: base().alternatives.slice(0, 4) };
    const batch = normalizeItems([wrongArea, short, base()]);
    expect(batch.items).toHaveLength(1);
    expect(batch.rejected.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("rejeita id repetido no arquivo", () => {
    expect(normalizeItems([base(), base()]).rejected[0]?.errors[0]).toMatch(/repetido/);
  });

  it("rejeita questão que fica vazia depois da limpeza", () => {
    expect(normalizeItems([{ ...base(), stemHtml: "<script>x</script>" }]).rejected).toHaveLength(1);
  });
});

describe("planilha", () => {
  it("deduz a área pela disciplina e monta as alternativas", () => {
    const row = {
      id: "x-1", disciplina: "História", assunto: "Brasil Colônia", enunciado: "Pergunta?", a: "1", b: "2", c: "3", d: "4", e: "5",
      gabarito: "c", origem: "inep", direitos_ok: "sim", ano: "2019", irt_a: "1,2", irt_b: "0,5", irt_c: "0,18",
    };
    const batch = normalizeItems([rowToCandidate(row)]);
    expect(batch.rejected).toEqual([]);
    expect(batch.items[0]).toMatchObject({ area: "CH", answer: "C", year: 2019, source: "inep_official", irt: { a: 1.2, b: 0.5, c: 0.18 } });
  });
});

describe("Banco ENEM", () => {
  const columns = (values: Record<number, unknown>) => (column: number) => values[column];

  it("lê parâmetros oficiais e ignora duplicatas", () => {
    expect(bancoRow(columns({ 1: "BIO-1", 2: "Biologia", 3: "Genética", 4: 2024, 8: "A", 14: "H11", 17: 2.1, 18: 2, 19: 0.04 })))
      .toMatchObject({ area: "CN", skill: "H11", irt: { a: 2.1, b: 2, c: 0.04 } });
    expect(bancoRow(columns({ 1: "BIO-2", 2: "Biologia", 3: "Genética", 11: "BIO-1" }))).toBeNull();
  });
});
