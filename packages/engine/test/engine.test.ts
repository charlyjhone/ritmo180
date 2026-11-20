import { describe, expect, it } from "vitest";
import {
  accommodationFactor, assembleExam, attemptFlags, calibrateItem, diagnoseTime, estimateTheta, evaluateReading, fatigueCurve,
  guessStreakPositions, incoherences, information, masteryOf, nextAdaptiveItem, nextEnem, paceBalance, planSession, planUntilEnem, probability, ritmoSummary, spreadAcrossAreas,
  SeededRng, simulateCorrect, stageOf, targetSeconds, toScore, trainingStreak, whatIfScenarios,
  isReviewDueNow, reviewState,
  type AttemptFact, type Candidate, type ExamResponse, type IrtParams, type ReviewFact,
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

describe("plano até o ENEM", () => {
  const at = (date: string) => Date.parse(`${date}T15:00:00Z`);
  const priorities = [
    { discipline: "Física", topic: "Óptica", weight: 0.3, mastery: 0.2 },
    { discipline: "Física", topic: "Mecânica", weight: 0.3, mastery: 0.3 },
    { discipline: "Química", topic: "Soluções", weight: 0.2, mastery: null },
  ];

  it("conta para a próxima prova e encerra depois da última", () => {
    expect(nextEnem(at("2026-10-31"))).toMatchObject({ nextDay: "2026-11-08", daysLeft: 8 });
    expect(nextEnem(at("2026-11-09"))).toMatchObject({ nextDay: "2026-11-15", daysLeft: 6 });
    expect(nextEnem(at("2026-11-16"))).toMatchObject({ year: 2027, nextDay: "2027-11-07", estimated: true });
    expect(nextEnem(at("2027-11-15"))).toBeNull();
    expect(planUntilEnem(at("2027-11-15"), priorities)).toEqual([]);
  });

  it("alterna disciplinas, intercala simulado e deixa a véspera leve", () => {
    const days = planUntilEnem(at("2026-10-31"), priorities);
    expect(days.slice(0, 3).map((d) => d.topic)).toEqual(["Óptica", "Soluções", "Mecânica"]);
    expect(days.find((d) => d.date === "2026-11-05")!.kind).toBe("simulado");
    expect(days.find((d) => d.date === "2026-11-07")!.kind).toBe("light");
    expect(days.find((d) => d.date === "2026-11-08")!.kind).toBe("exam");
    expect(days.at(-1)).toMatchObject({ date: "2026-11-15", kind: "exam", areas: ["CN", "MT"] });
  });
});

describe("simulado montado pelo aluno", () => {
  it("divide entre as áreas e compensa a que tem poucas questões", () => {
    const items = [...Array(30).fill({ area: "CN" }), ...Array(30).fill({ area: "MT" }), { area: "LC" }];
    expect(spreadAcrossAreas(items, 21)).toEqual([{ area: "CN", count: 10 }, { area: "LC", count: 1 }, { area: "MT", count: 10 }]);
    expect(spreadAcrossAreas(items.slice(0, 3), 10)).toEqual([{ area: "CN", count: 3 }]);
  });
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

  it("completa a sessão quando o aluno escolhe um assunto só", () => {
    const pool = Array.from({ length: 12 }, (_, i) => candidate(`q${i}`, "Óptica", 60, 0.2));
    expect(planSession(pool, base, 24).flatMap((b) => b.items)).toHaveLength(8);
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

describe("revisão espaçada", () => {
  const DAY = 86_400_000;
  const T0 = Date.parse("2026-11-20T13:00:00Z");
  const fact = (correct: boolean, days: number, confidence: ReviewFact["confidence"] = "think"): ReviewFact => ({ correct, confidence, answeredAt: T0 + days * DAY });

  it("fica fora do caderno enquanto o aluno acerta com alguma certeza", () => {
    expect(reviewState([fact(true, 0), fact(true, 1, null)]).status).toBe("clear");
  });

  it("erro pede para refazer já e cada acerto empurra a revisão para 2, 7 e 21 dias", () => {
    const miss = reviewState([fact(false, 0, "sure")]);
    expect(miss).toMatchObject({ status: "redo", dueAt: T0, misses: 1, sureMiss: true });
    expect(isReviewDueNow(miss, T0)).toBe(true);

    const redone = reviewState([fact(false, 0), fact(true, 0.01)]);
    expect(redone.status).toBe("spaced");
    expect(redone.dueAt).toBe(Date.parse("2026-11-22T03:00:00Z"));
    expect(isReviewDueNow(redone, T0 + DAY)).toBe(false);
    expect(isReviewDueNow(redone, Date.parse("2026-11-22T10:00:00Z"))).toBe(true);

    const second = reviewState([fact(false, 0), fact(true, 0.01), fact(true, 2)]);
    expect(second).toMatchObject({ status: "spaced", step: 1, dueAt: Date.parse("2026-11-29T03:00:00Z") });
    const third = reviewState([fact(false, 0), fact(true, 0.01), fact(true, 2), fact(true, 9)]);
    expect(third).toMatchObject({ status: "spaced", step: 2, dueAt: Date.parse("2026-12-20T03:00:00Z") });
    expect(reviewState([fact(false, 0), fact(true, 0.01), fact(true, 2), fact(true, 9), fact(true, 30)]).status).toBe("clear");
  });

  it("acerto antes da data não adianta e erro na revisão recomeça", () => {
    expect(reviewState([fact(false, 0), fact(true, 0.01), fact(true, 1)])).toMatchObject({ status: "spaced", step: 0 });
    expect(reviewState([fact(false, 0), fact(true, 0.01), fact(true, 2), fact(false, 9)])).toMatchObject({ status: "redo", step: 0, misses: 2 });
  });

  it("acerto no chute entra no caderno", () => {
    expect(reviewState([fact(true, 0, "guess")])).toMatchObject({ status: "redo", guessed: true, misses: 0 });
    expect(reviewState([fact(false, 0), fact(true, 0.01, "guess")]).status).toBe("redo");
  });
});

describe("ferramentas de estudo", async () => {
  const { cardState, cardsFromLesson, CARD_DAYS, finalStretchTopics, isCardDue, missAdvice, strategyReport } = await import("../src/index.ts");
  const DAY = 86_400_000;
  const T0 = Date.parse("2026-03-02T15:00:00Z");

  it("o cartão sobe de nível a cada lembrança no dia certo e volta ao início quando esquecido", () => {
    expect(cardState([])).toMatchObject({ status: "new" });
    expect(isCardDue(cardState([]), T0)).toBe(true);
    const once = cardState([{ remembered: true, at: T0 }]);
    expect(once).toMatchObject({ status: "learning", level: 1 });
    expect(isCardDue(once, T0 + 6 * 3_600_000)).toBe(false);
    expect(isCardDue(once, T0 + CARD_DAYS[0] * DAY)).toBe(true);
    // Lembrar antes da data não adianta.
    expect(cardState([{ remembered: true, at: T0 }, { remembered: true, at: T0 + 3_600_000 }]).level).toBe(1);
    const forgot = cardState([{ remembered: true, at: T0 }, { remembered: false, at: T0 + 2 * DAY }]);
    expect(forgot).toMatchObject({ status: "learning", level: 0 });
    expect(isCardDue(forgot, T0 + 2 * DAY)).toBe(true);
    let at = T0;
    const facts = [];
    for (const wait of [0, ...CARD_DAYS]) {
      at += wait * DAY;
      facts.push({ remembered: true, at });
    }
    expect(cardState(facts)).toMatchObject({ status: "learned", dueAt: null });
  });

  it("tira cartões dos termos em destaque e do exemplo resolvido", () => {
    const cards = cardsFromLesson({
      discipline: "Física", topic: "Óptica",
      explanationHtml: "<ul><li><strong>Reflexão</strong>: a luz volta ao meio de origem.</li><li>Sem destaque.</li><li><b>Refração</b> (mudança de meio): a luz muda de velocidade &gt; e de direção.</li></ul>",
      exampleHtml: "<p>Por que o lápis parece quebrado na água?</p><p>Por causa da <strong>refração</strong> da luz.</p>",
    });
    expect(cards.map((c) => c.front)).toEqual(["Reflexão", "Refração", "Por que o lápis parece quebrado na água?"]);
    expect(cards[1]!.back).toBe("(mudança de meio): a luz muda de velocidade > e de direção.");
    expect(cards[2]!.back).toBe("Por causa da refração da luz.");
    expect(new Set(cards.map((c) => c.key)).size).toBe(3);
  });

  it("só aconselha com respostas suficientes e aponta o motivo que mais pesa", () => {
    expect(missAdvice({ content: 2 })).toBeNull();
    expect(missAdvice({ content: 1, calc: 3, reading: 1 })).toMatchObject({ dominant: "calc", share: 60, total: 5 });
  });

  it("o relatório de estratégia aponta onde travou, onde correu e o tempo além do ritmo do ENEM", () => {
    const good = strategyReport([{ position: 0, correct: true, totalMs: 120_000, targetMs: 180_000 }]);
    expect(good.tips).toEqual(["Ritmo de prova em dia: você ficou dentro do tempo e não travou em nenhuma questão."]);
    const bad = strategyReport([
      { position: 0, correct: false, totalMs: 400_000, targetMs: 180_000 },
      { position: 1, correct: false, totalMs: 20_000, targetMs: 180_000 },
      { position: 2, correct: false, totalMs: 30_000, targetMs: 180_000 },
    ]);
    expect(bad.stuck).toEqual([1]);
    expect(bad.rushed).toEqual([2, 3]);
    expect(bad.tips).toHaveLength(2);
    expect(bad.tips[0]).toContain("4 min a mais");
    expect(strategyReport([{ position: 0, correct: true, totalMs: 300_000, targetMs: 180_000 }]).tips[0]).toContain("2 min a mais do que o ritmo do ENEM");
  });

  it("na reta final só ficam assuntos já vistos e fracos, os que mais caem primeiro", () => {
    const topics = [
      { discipline: "F", topic: "Novo", weight: 0.9, mastery: null },
      { discipline: "F", topic: "Forte", weight: 0.8, mastery: 0.9 },
      { discipline: "F", topic: "Fraco leve", weight: 0.2, mastery: 0.3 },
      { discipline: "F", topic: "Fraco pesado", weight: 0.7, mastery: 0.5 },
    ];
    expect(finalStretchTopics(topics).map((t) => t.topic)).toEqual(["Fraco pesado", "Fraco leve"]);
    expect(finalStretchTopics(topics, 1)).toHaveLength(1);
  });

  it("perto da prova, o plano deixa de abrir assunto novo", () => {
    const now = Date.parse("2026-10-20T15:00:00Z");
    const priorities = [
      { discipline: "A", topic: "Nunca visto", weight: 0.99, mastery: null },
      { discipline: "B", topic: "Fraco 1", weight: 0.5, mastery: 0.4 },
      { discipline: "C", topic: "Fraco 2", weight: 0.4, mastery: 0.3 },
      { discipline: "D", topic: "Fraco 3", weight: 0.3, mastery: 0.2 },
    ];
    const focus = planUntilEnem(now, priorities).filter((d) => d.kind === "focus").map((d) => d.topic);
    expect(focus.length).toBeGreaterThan(0);
    expect(focus).not.toContain("Nunca visto");
    const far = Date.parse("2027-03-01T15:00:00Z");
    expect(planUntilEnem(far, priorities).filter((d) => d.kind === "focus").map((d) => d.topic)).toContain("Nunca visto");
  });
});
