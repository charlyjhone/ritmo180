import { describe, expect, it } from 'vitest';
import { binom, crossings, mulberry32 } from '../core/random';
import { alleleQ, createPopulation, haldane, nextGeneration, nextQ } from './selecao/physics';
import { MODES, chiSquare, gametes, offspring, productRule, punnett } from './genetica/physics';
import { bhaskara, bisect, golden, numericRoots, vertex } from './funcoes/physics';
import { binomialMoments, newBall, pmf, summary } from './estatistica/physics';
import { compoundFV, equivalentRate, month, newLedger, pricePMT, sacTotalInterest, simpleFV } from './juros/physics';

describe('Utilitários', () => {
  it('crossings conta limites inteiros e binom confere', () => {
    expect(crossings(0, 1)).toBe(1);
    expect(crossings(0.2, 0.5)).toBe(0);
    expect(crossings(0.7, 0.5)).toBe(1);
    expect(binom(10, 3)).toBe(120);
  });
});

describe('Seleção natural', () => {
  it('recursão por genótipos = fórmulas clássicas (contra recessivo e contra dominante)', () => {
    for (const q of [0.05, 0.3, 0.7, 0.95])
      for (const s of [0.1, 0.5]) {
        expect(nextQ(q, 'escura', s, 0)).toBeCloseTo(haldane(q, 'escura', s), 14);
        expect(nextQ(q, 'clara', s, 0)).toBeCloseTo(haldane(q, 'clara', s), 14);
      }
  });
  it('sem seleção nem mutação, q fica constante (Hardy–Weinberg)', () => {
    expect(nextQ(0.37, 'escura', 0, 0)).toBeCloseTo(0.37, 15);
  });
  it('população grande segue o modelo determinístico dentro de 4σ', () => {
    const r = mulberry32(5);
    let pop = createPopulation(20000, 0.05, r);
    for (let g = 0; g < 40; g++) pop = nextGeneration(pop, 'escura', 0.3, 0, r);
    const q = alleleQ(pop.counts);
    expect(Math.abs(q - pop.qDet)).toBeLessThan(4 * Math.sqrt(pop.varDrift) + 1e-3);
    expect(1 - q).toBeGreaterThan(0.5); // o alelo escuro se espalhou
  });
});

describe('Genética', () => {
  const mode = (id: string) => MODES.find((m) => m.id === id)!;
  it('proporções clássicas', () => {
    expect(punnett(mode('mono'), 'Aa', 'Aa').probs).toEqual({ dom: 0.75, rec: 0.25 });
    expect(punnett(mode('incompleta'), 'VB', 'VB').probs).toEqual({ verm: 0.25, rosa: 0.5, branca: 0.25 });
    const di = punnett(mode('di'), 'AaBb', 'AaBb').probs;
    expect([di.AB, di.Ab, di.aB, di.ab].map((x) => x * 16)).toEqual([9, 3, 3, 1]);
    expect(punnett(mode('abo'), 'IAi', 'IBi').probs).toEqual({ A: 0.25, B: 0.25, AB: 0.25, O: 0.25 });
    expect(punnett(mode('x'), 'XDXd', 'XDY').probs).toEqual({ fn: 0.5, fd: 0, mn: 0.25, md: 0.25 });
  });
  it('gametas: AaBb gera 4 tipos com 1/4 cada; AABB só 1', () => {
    const m = mode('di');
    expect(gametes(m.parse('AaBb')).map((g) => g.p)).toEqual([0.25, 0.25, 0.25, 0.25]);
    expect(gametes(m.parse('AABB'))).toHaveLength(1);
  });
  it('regra do produto = Punnett no diibridismo', () => {
    const m = mode('di');
    for (const [a, b] of [['AaBb', 'aabb'], ['Aabb', 'aaBb'], ['AaBb', 'AaBb']]) {
      const pq = punnett(m, a, b).probs;
      for (const id of ['AB', 'Ab', 'aB', 'ab']) expect(productRule(m.parse(a), m.parse(b), id)).toBeCloseTo(pq[id], 14);
    }
  });
  it('sorteio converge e χ² fica abaixo do crítico', () => {
    const m = mode('di');
    const r = mulberry32(3);
    const G = m.parse('AaBb');
    const counts = [0, 0, 0, 0];
    const ids = ['AB', 'Ab', 'aB', 'ab'];
    for (let i = 0; i < 16000; i++) counts[ids.indexOf(offspring(m, G, G, r))]++;
    expect(chiSquare(counts, [9 / 16, 3 / 16, 3 / 16, 1 / 16], 16000)).toBeLessThan(11.34); // 1% com 3 gl
  });
});

describe('Funções', () => {
  it('Bhaskara = raízes numéricas; Girard; vértice', () => {
    const p = { a: 0.5, b: -1, c: -4 };
    const f = (x: number) => p.a * x * x + p.b * x + p.c;
    const bh = bhaskara(p);
    const nr = numericRoots(f, -1e3, 1e3, 200000);
    expect(nr).toHaveLength(2);
    expect(nr[0]).toBeCloseTo(bh.roots[0], 10);
    expect(nr[1]).toBeCloseTo(bh.roots[1], 10);
    expect(nr[0] + nr[1]).toBeCloseTo(-p.b / p.a, 10);
    expect(nr[0] * nr[1]).toBeCloseTo(p.c / p.a, 9);
    const v = vertex(p);
    expect(golden(f, -100, 100)).toBeCloseTo(v.xv, 6);
    expect(bisect((x) => (f(x + 1) - f(x - 1)) / 2, -1e3, 1e3)).toBeCloseTo(v.xv, 12);
    expect(f(v.xv)).toBeCloseTo(v.yv, 12);
  });
  it('Δ < 0 não tem raízes reais', () => {
    expect(bhaskara({ a: 1, b: 0, c: 1 }).roots).toHaveLength(0);
    expect(numericRoots((x) => x * x + 1, -50, 50)).toHaveLength(0);
  });
});

describe('Estatística', () => {
  it('momentos da binomial: np e npq', () => {
    const m = binomialMoments(12, 0.3);
    expect(m.mean).toBeCloseTo(3.6, 12);
    expect(m.variance).toBeCloseTo(12 * 0.3 * 0.7, 12);
    let s = 0;
    for (let k = 0; k <= 12; k++) s += pmf(12, 0.3, k);
    expect(s).toBeCloseTo(1, 14);
  });
  it('média, mediana e moda de um histograma', () => {
    // valores: 0,1,1,2,2,2,3 → média 11/7, mediana 2, moda 2
    const st = summary([1, 2, 3, 1])!;
    expect(st.mean).toBeCloseTo(11 / 7, 12);
    expect(st.median).toBe(2);
    expect(st.mode).toBe(2);
    expect(summary([1, 1])!.median).toBe(0.5);
  });
  it('bolinhas de Galton seguem a binomial', () => {
    const r = mulberry32(11);
    const counts = new Array(11).fill(0);
    for (let i = 0; i < 20000; i++) counts[newBall(10, 0.5, 0, r).k]++;
    const st = summary(counts)!;
    expect(Math.abs(st.mean - 5)).toBeLessThan(4 * Math.sqrt(2.5 / 20000));
    expect(Math.abs(st.variance - 2.5)).toBeLessThan(0.1);
  });
});

describe('Matemática financeira', () => {
  it('iteração mês a mês = fórmulas fechadas', () => {
    let l = newLedger(1000, 30000);
    for (let m = 0; m < 36; m++) l = month(l, 1000, 0.01, 200, 30000, 36);
    expect(l.compound).toBeCloseTo(compoundFV(1000, 0.01, 36, 200), 8);
    expect(l.simple).toBeCloseTo(simpleFV(1000, 0.01, 36, 200), 8);
    expect(l.balP).toBeCloseTo(0, 6);
    expect(l.balS).toBeCloseTo(0, 6);
    expect(l.intS).toBeCloseTo(sacTotalInterest(30000, 0.01, 36), 6);
    expect(l.intP).toBeGreaterThan(l.intS); // Price paga mais juros
    expect(l.paidP).toBeCloseTo(36 * pricePMT(30000, 0.01, 36), 6);
  });
  it('valores de referência', () => {
    expect(compoundFV(1000, 0.1, 2)).toBeCloseTo(1210, 10);
    expect(simpleFV(1000, 0.1, 2)).toBeCloseTo(1200, 10);
    expect(equivalentRate(0.01, 12)).toBeCloseTo(0.126825030131, 10);
    expect(pricePMT(10000, 0.02, 12)).toBeCloseTo(945.596, 3);
  });
});
