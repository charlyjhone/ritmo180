import { describe, expect, it } from "vitest";
import { DISCIPLINES, PHET_SIMS, phetUrl } from "@ritmo/contracts";
import { phetIdsFor } from "../src/features/lab-links.tsx";

describe("simulações PhET", () => {
  it("cada simulação tem id único, disciplina do Ritmo e palavras-chave válidas", () => {
    const all = Object.values(DISCIPLINES).flat();
    expect(new Set(PHET_SIMS.map((s) => s.id)).size).toBe(PHET_SIMS.length);
    for (const sim of PHET_SIMS) {
      expect(sim.disciplines.every((d) => all.includes(d))).toBe(true);
      for (const k of sim.keywords) expect(() => new RegExp(k)).not.toThrow();
      expect(sim.keywords.every((k) => k === k.toLowerCase() && !/[̀-ͯ]/.test(k.normalize("NFD")))).toBe(true);
    }
  });

  it("liga a questão pelo enunciado, em português e no site do PhET", () => {
    expect(phetIdsFor("Física", "Eletrodinâmica", "<p>Dois resistores em associação em paralelo num circuito elétrico.</p>")[0]).toBe("circuit-construction-kit-dc");
    expect(phetIdsFor("Química", "Soluções", "Qual o pH da solução?")).toContain("ph-scale");
    expect(phetUrl("ph-scale")).toBe("https://phet.colorado.edu/sims/html/ph-scale/latest/ph-scale_pt_BR.html");
  });

  it("não mostra nada fora das ciências e da matemática, e respeita o limite", () => {
    expect(phetIdsFor("Português", "Interpretação de texto", "onda de calor")).toEqual([]);
    expect(phetIdsFor("Física", "Ondulatória", "onda estacionaria numa corda, frequencia e interferencia", 1)).toHaveLength(1);
  });
});
