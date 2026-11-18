import { describe, expect, it } from "vitest";
import { LAB_MODULES, labUrl } from "@ritmo/contracts";
import { labModulesFor, labRefIn, normalizeLabText } from "../src/index.ts";

const ligar = (discipline: string, topic: string, text: string) => labModulesFor({ discipline, topic, text }, LAB_MODULES);

describe("ligação questão → simulador", () => {
  it("normaliza acentos, maiúsculas e HTML", () => {
    expect(normalizeLabText("<p>Pêndulo&nbsp;<b>SIMPLES</b></p>")).toBe(" pendulo simples ");
  });

  it("usa a palavra-chave do enunciado antes do assunto", () => {
    expect(ligar("Física", "Cinemática", "<p>Uma bola é lançada obliquamente e atinge o alcance horizontal máximo.</p>")[0]).toBe("projetil");
    expect(ligar("Física", "Dinâmica", "Um pêndulo simples oscila com pequena amplitude.")).toEqual(["pendulo", "newton"]);
    expect(ligar("Física", "Termologia", "Mistura-se água com gelo até o equilíbrio térmico; o calor específico da água é 1 cal/g°C.")).toEqual(["calorimetria"]);
    expect(ligar("Física", "Óptica Geométrica", "Para corrigir a miopia, o oftalmologista receitou lentes divergentes.")).toEqual(["lentes"]);
    expect(ligar("Química", "Soluções", "O pH de uma solução de HCl 0,01 mol/L é")).toEqual(["ph"]);
    expect(ligar("Matemática", "Razão e Proporção", "Um financiamento com taxa de juros de 2% ao mês")).toEqual(["juros"]);
  });

  it("o assunto sozinho basta quando é específico", () => {
    expect(ligar("Química", "Eletroquímica", "Na reação de oxirredução abaixo,")).toEqual(["pilhas"]);
    expect(ligar("Biologia", "Genética", "Um casal planeja ter filhos.")).toEqual(["genetica"]);
    expect(ligar("Matemática", "Função Quadrática", "Determine o valor máximo.")).toEqual(["funcoes"]);
  });

  it("não liga quando não há simulador do assunto", () => {
    expect(ligar("Física", "Termologia", "A dilatação linear de uma barra de aço")).toEqual([]);
    expect(ligar("Física", "Óptica Geométrica", "Um espelho plano forma imagens")).toEqual([]);
    expect(ligar("Biologia", "Ecologia", "As cadeias alimentares de um manguezal")).toEqual([]);
    expect(ligar("Matemática", "Geometria Plana", "A área de um triângulo")).toEqual([]);
    expect(ligar("Português", "Interpretação", "O efeito estufa no texto é usado como metáfora")).toEqual([]);
  });

  it("respeita a disciplina e o limite de simuladores", () => {
    expect(ligar("Química", "Química Orgânica", "pêndulo")).toEqual([]);
    const muitos = ligar("Física", "Eletrodinâmica", "resistor, transformador, lente, pêndulo, mola e empuxo");
    expect(muitos).toHaveLength(2);
  });

  it("todo simulador do catálogo tem id único e endereço no laboratório", () => {
    expect(new Set(LAB_MODULES.map((m) => m.id)).size).toBe(LAB_MODULES.length);
    for (const m of LAB_MODULES) for (const k of m.keywords) expect(() => new RegExp(k), `${m.id}: ${k}`).not.toThrow();
    expect(labUrl("projetil", { v0: 20, angulo: 30 })).toBe("/laboratorio/#projetil?v0=20&angulo=30");
    expect(labUrl("ph")).toBe("/laboratorio/#ph");
  });
});

describe("labRefIn", () => {
  it("lê a rota do simulador montado na resolução", () => {
    expect(labRefIn('<p>x</p><span class="lab-ref">pendulo?L=1&amp;g=3.7</span>')).toEqual({ id: "pendulo", query: "L=1&g=3.7" });
    expect(labRefIn('<span class="lab-ref">gases</span>')).toEqual({ id: "gases", query: "" });
    expect(labRefIn("<p>sem simulador</p>")).toBeNull();
  });
});
