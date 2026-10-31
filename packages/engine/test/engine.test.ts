import { describe, expect, it } from "vitest";
import {
  accommodationFactor, assembleExam, attemptFlags, calibrateItem, diagnoseTime, estimateTheta, evaluateReading, fatigueCurve,
  guessStreakPositions, incoherences, information, masteryOf, nextAdaptiveItem, paceBalance, planSession, probability, ritmoSummary,
  SeededRng, simulateCorrect, stageOf, targetSeconds, toScore, trainingStreak, whatIfScenarios,
  type AttemptFact, type Candidate, type ExamResponse, type IrtParams,
} from "../src/index.ts";

const item: IrtParams = { a: 2, b: 0.5, c: 0.2 };
const attempt = (over: Partial<AttemptFact> = {}): AttemptFact => ({
  itemId: "i", topic: "Energia", area: "CN", correct: true, totalMs: 100_000, targetMs: 180_000, mode: "guided",
  phases: { readMs: 40_000, pathMs: 20_000, calcMs: 30_000, checkMs: 10_000 }, usedHint: false, valid: true, position: 0, answeredAt: 1000, ...over,
});

describe("irt", () => {
  it("respeita assíntotas e ponto de inflexão do modelo 3PL", () => {
    expect(probability(-10, item)).toBeCloseTo(0.2, 3);
    expect(probability(10, item)).toBeCloseTo(1, 3);
    expect(probability(0.5, item)).toBeCloseTo(0.6, 6);
  });

  it("informação é maior perto da dificuldade do item", () => {
    expect(information(0.6, item)).toBeGreaterThan(information(-2, item));
    expect(information(0.6, item)).toBeGreaterThan(information(3, item));
  });

  it("recupera theta simulado com muitos itens", () => {
    const rng = new SeededRng(7);
    const responses = Array.from({ length: 300 }, () => {
      const params = { a: 1.8, b: rng.normal(0, 1), c: 0.15 };
      return { params, correct: simulateCorrect(rng, 1, params) };
    });
    const estimate = estimateTheta(responses);
    expect(estimate.theta).toBeGreaterThan(0.75);
    expect(estimate.theta).toBeLessThan(1.25);
    expect(estimate.se).toBeLessThan(0.2);
  });

  it("errar item fácil pesa mais do que errar item difícil", () => {
    const easy = { a: 2, b: -1.5, c: 0.1 };
    const hard = { a: 2, b: 1.5, c: 0.1 };
    const base = [{ params: easy, correct: true }, { params: hard, correct: true }];
    const missEasy = estimateTheta([{ params: easy, correct: false }, { params: hard, correct: true }]);
    const missHard = estimateTheta([{ params: easy, correct: true }, { params: hard, correct: false }]);
    expect(missEasy.theta).toBeLessThan(estimateTheta(base).theta);
    expect(missEasy.theta).toBeLessThan(missHard.theta);
  });

  it("converte para a escala da área com faixa de incerteza", () => {
    const band = toScore("CN", { theta: 1, se: 0.2, n: 40 });
    expect(band.score).toBe(614);
    expect(band.low).toBeLessThan(band.score);
    expect(band.high).toBeGreaterThan(band.score);
    expect(toScore("LC", { theta: 0, se: 0.3, n: 40 }).provisional).toBe(true);
  });
});

describe("tempo", () => {
  it("1 hora extra leva 3:00 para 3:40", () => {
    expect(Math.round(180 * accommodationFactor(60))).toBe(220);
  });

  it("usa a mediana real quando há amostra e estimativa quando não há", () => {
    const facts = { wordCount: 80, irt: null, medianCorrectMs: 200_000, correctSamples: 30 };
    expect(targetSeconds(facts)).toBe(200);
    expect(targetSeconds({ ...facts, correctSamples: 5 })).toBe(Math.round(80 / 3.2 + 108));
  });

  it("aponta o gargalo só quando o aluno passou do alvo", () => {
    const slow = diagnoseTime({ readMs: 92_000, pathMs: 48_000, calcMs: 51_000, checkMs: 13_000 }, 180_000);
    expect(slow.bottleneck).toBe("readMs");
    const fine = diagnoseTime({ readMs: 50_000, pathMs: 30_000, calcMs: 50_000, checkMs: 10_000 }, 180_000);
    expect(fine.bottleneck).toBeNull();
  });
});

describe("integridade", () => {
  it("marca texto impossível de ler e questão difícil acertada rápido", () => {
    expect(attemptFlags({ correct: true, totalMs: 5000, hiddenMs: 0, wordCount: 200, b: 0 })).toContain("too_fast");
    expect(attemptFlags({ correct: true, totalMs: 10_000, hiddenMs: 0, wordCount: 20, b: 2 })).toContain("too_fast");
    expect(attemptFlags({ correct: true, totalMs: 120_000, hiddenMs: 0, wordCount: 100, b: 1 })).toEqual([]);
  });

  it("marca saída longa seguida de acerto, mas não erro", () => {
    expect(attemptFlags({ correct: true, totalMs: 200_000, hiddenMs: 90_000, wordCount: 100, b: 0 })).toContain("away_then_perfect");
    expect(attemptFlags({ correct: false, totalMs: 200_000, hiddenMs: 90_000, wordCount: 100, b: 0 })).toEqual([]);
  });

  it("detecta chute em série", () => {
    expect([...guessStreakPositions([3000, 3000, 3000, 3000, 3000, 90_000])]).toEqual([0, 1, 2, 3, 4]);
    expect(guessStreakPositions([3000, 90_000, 3000]).size).toBe(0);
  });

  it("não valida leitura com velocidade impossível", () => {
    expect(evaluateReading(120, 1243, 3).verdict).toBe("implausible_speed");
    expect(evaluateReading(120, 60_000, 2).verdict).toBe("low_comprehension");
    expect(evaluateReading(120, 60_000, 3)).toEqual({ ppm: 120, score: 3, verdict: "valid" });
  });
});

describe("índice e progresso", () => {
  it("conta só acertos dentro do alvo e ignora tentativas inválidas", () => {
    const summary = ritmoSummary([
      attempt({ answeredAt: 1 }),
      attempt({ answeredAt: 2, totalMs: 200_000 }),
      attempt({ answeredAt: 3, correct: false }),
      attempt({ answeredAt: 4, valid: false }),
    ]);
    expect(summary.index).toBe(33);
    expect(summary.samples).toBe(3);
  });

  it("não dá 100% de domínio com uma resposta", () => {
    expect(masteryOf([attempt()])).toBeLessThan(0.7);
  });

  it("avança de etapa conforme precisão, rapidez e resistência", () => {
    expect(stageOf([attempt()])).toBe(1);
    const strong = Array.from({ length: 12 }, (_, i) => attempt({ answeredAt: i, phases: { readMs: 30_000, pathMs: 20_000, calcMs: 30_000, checkMs: 10_000 } }));
    expect(stageOf(strong)).toBe(4);
    const late = Array.from({ length: 6 }, (_, i) => attempt({ answeredAt: 100 + i, position: 25 }));
    expect(stageOf([...strong, ...late])).toBe(5);
  });

  it("calcula sequência sem quebrar antes do treino de hoje", () => {
    const day = 86_400_000;
    const now = 1_000 * day;
    expect(trainingStreak([now - day, now - 2 * day], now, 0)).toBe(2);
    expect(trainingStreak([now - 3 * day], now, 0)).toBe(0);
  });
});

const candidate = (id: string, topic: string, wordCount: number, topicWeight: number): Candidate => ({
  id, topic, area: "CN", discipline: "Física", wordCount, topicWeight, irt: { a: 1.5, b: 0, c: 0.2 }, medianCorrectMs: null, correctSamples: 0,
});

describe("seleção", () => {
  const now = 100 * 86_400_000;
  const base = { theta: 0, mastery: new Map([["Óptica", 0.2], ["Energia", 0.9]]), bottleneck: null, attempts: [], now };

  it("prioriza lacuna em assunto de peso", () => {
    const blocks = planSession([candidate("a", "Energia", 60, 0.2), candidate("b", "Óptica", 60, 0.2)], base, 6);
    expect(blocks[0]!.items[0]!.itemId).toBe("b");
    expect(blocks[0]!.items[0]!.reason).toContain("Óptica");
  });

  it("cria bloco de leitura quando o gargalo é leitura", () => {
    const pool = [candidate("long", "Energia", 150, 0.2), candidate("short", "Energia", 30, 0.2)];
    const blocks = planSession(pool, { ...base, bottleneck: "readMs" }, 6);
    expect(blocks[0]!.kind).toBe("LEITURA");
    expect(blocks[0]!.items.map((i) => i.itemId)).toEqual(["long"]);
  });

  it("mistura disciplinas e varia entre alunos sem completar menos que o pedido", () => {
    const pool = ["Física", "Química", "Biologia", "Matemática"].flatMap((discipline, d) =>
      Array.from({ length: 20 }, (_, i) => ({ ...candidate(`${d}-${i}`, `${discipline} ${i % 4}`, 60, 0.2), discipline })),
    );
    const plan = (seed: string, items = pool) => planSession(items, { ...base, seed, bottleneck: "readMs" }, 24).flatMap((b) => b.items.map((i) => i.itemId));
    const perDiscipline = new Map<string, number>();
    for (const id of plan("aluno-1")) perDiscipline.set(id[0]!, (perDiscipline.get(id[0]!) ?? 0) + 1);
    expect(Math.max(...perDiscipline.values())).toBeLessThanOrEqual(3);
    expect(perDiscipline.size).toBeGreaterThanOrEqual(3);
    expect(plan("aluno-2")).not.toEqual(plan("aluno-1"));
    expect(plan("aluno-1", pool.filter((c) => c.discipline === "Física"))).toHaveLength(8);
  });

  it("não repete questão recente e traz erro antigo para revisão", () => {
    const pool = [candidate("seen", "Energia", 60, 0.2), candidate("wrong", "Energia", 60, 0.2), candidate("new", "Energia", 60, 0.2)];
    const attempts = [
      attempt({ itemId: "seen", answeredAt: now - 86_400_000 }),
      attempt({ itemId: "wrong", correct: false, answeredAt: now - 5 * 86_400_000 }),
    ];
    const blocks = planSession(pool, { ...base, attempts }, 9);
    const ids = blocks.flatMap((b) => b.items.map((i) => i.itemId));
    expect(ids).not.toContain("seen");
    expect(blocks[0]!.kind).toBe("REVISAO");
    expect(ids[0]).toBe("wrong");
  });
});

describe("diagnóstico adaptativo", () => {
  it("converge para o nível do aluno com menos itens que a prova inteira", () => {
    const rng = new SeededRng(11);
    const pool = Array.from({ length: 300 }, (_, i) => ({ id: `i${i}`, topic: `t${i % 8}`, params: { a: 1.8, b: rng.normal(0, 1.2), c: 0.15 } }));
    const answered: { itemId: string; topic: string; params: IrtParams; correct: boolean }[] = [];
    for (;;) {
      const state = nextAdaptiveItem(pool, answered);
      if (state.done) {
        expect(answered.length).toBeLessThanOrEqual(30);
        expect(state.theta).toBeGreaterThan(0.2);
        expect(state.theta).toBeLessThan(1.8);
        return;
      }
      const next = pool.find((p) => p.id === state.nextItemId)!;
      answered.push({ itemId: next.id, topic: next.topic, params: next.params, correct: simulateCorrect(rng, 1, next.params) });
    }
  });
});

describe("simulado", () => {
  it("o saldo de ritmo acusa atraso de verdade", () => {
    expect(paceBalance(138.5 * 60, 35, 180) / 60).toBeCloseTo(-33.5);
    expect(paceBalance(99 * 60, 35, 180) / 60).toBe(6);
  });

  it("avisa quando faltam questões para o blueprint", () => {
    const items = [{ id: "a", area: "CN", discipline: "Física", topic: "x", wordCount: 10, irt: null, medianCorrectMs: null, correctSamples: 0 }] as const;
    const exam = assembleExam([{ area: "CN", count: 2 }, { area: "MT", count: 1 }], items, new SeededRng(1));
    expect(exam.itemIds).toEqual(["a"]);
    expect(exam.shortages).toEqual([{ area: "CN", discipline: undefined, missing: 1 }, { area: "MT", discipline: undefined, missing: 1 }]);
  });

  const response = (i: number, over: Partial<ExamResponse> = {}): ExamResponse => ({
    itemId: `q${i}`, position: i, correct: true, blank: false, timeMs: 100_000, targetMs: 180_000, params: { a: 2, b: (i - 15) / 6, c: 0.15 }, ...over,
  });

  it("mede fadiga por terço e calcula ganho real do que-e-se", () => {
    const list = Array.from({ length: 30 }, (_, i) => response(i, { correct: i < 20, ...(i === 2 ? { correct: false } : {}) }));
    expect(fatigueCurve(list)[0]!.accuracy).toBe(90);
    expect(fatigueCurve(list)[2]!.accuracy).toBe(0);
    expect(incoherences(list).some((x) => x.itemId === "q2" && x.kind === "easy_missed")).toBe(true);
    const scenario = whatIfScenarios("CN", list).find((w) => w.title.includes("fáceis"));
    expect(scenario?.gain).toBeGreaterThan(0);
  });
});

describe("calibração", () => {
  it("recupera dificuldade e discriminação de um item", () => {
    const rng = new SeededRng(3);
    const truth = { a: 1.6, b: 0.7, c: 0.15 };
    const data = Array.from({ length: 3000 }, () => {
      const theta = rng.normal(0, 1);
      return { theta, correct: simulateCorrect(rng, theta, truth) };
    });
    const { params, lowDiscrimination } = calibrateItem(data);
    expect(params.b).toBeGreaterThan(0.45);
    expect(params.b).toBeLessThan(0.95);
    expect(params.a).toBeGreaterThan(1.1);
    expect(params.a).toBeLessThan(2.2);
    expect(lowDiscrimination).toBe(false);
  });

  it("sinaliza item que não discrimina", () => {
    const rng = new SeededRng(4);
    const data = Array.from({ length: 2000 }, () => ({ theta: rng.normal(0, 1), correct: rng.next() < 0.5 }));
    expect(calibrateItem(data).lowDiscrimination).toBe(true);
  });
});
