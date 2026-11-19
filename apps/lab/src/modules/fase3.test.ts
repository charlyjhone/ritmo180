import { describe, expect, it } from 'vitest';
import { rk4 } from '../core/stepper';
import { C_WATER, L_FUSION, MATERIALS, equilibrium as calEq, initialEnthalpy, liquidFraction, stepHeat, temperature, timeConstant, type Body } from './calorimetria/physics';
import { GASES, createGas, idealPressure, kineticTemperature, measuredPressure, stepGas } from './gases/physics';
import { ANALYTES, equivalenceVolume, exactPH, halfEquivalencePH, steepestPoint, textbookInitialPH } from './ph/physics';
import { REACTIONS, SPECIES, amounts, limiting, massBalance, masses } from './estequiometria/physics';
import { F, METALS, cellAt, chargeFromSeries, halfPotential, lcm, nernstCell, type Cell } from './pilhas/physics';
import { derivs, emissivity, equilibrium as climEq, effectiveT, fluxes } from './estufa/physics';

const mat = (id: string) => MATERIALS.find((m) => m.id === id)!;

describe('Calorimetria', () => {
  it('água + água: média ponderada', () => {
    const a: Body = { mat: mat('agua'), m: 0.2 };
    const b: Body = { mat: mat('agua'), m: 0.3 };
    const H = initialEnthalpy(a, 80) + initialEnthalpy(b, 20);
    expect(calEq(a, b, H).T).toBeCloseTo((0.2 * 80 + 0.3 * 20) / 0.5, 9);
  });
  it('metal + água: Σ m c ΔT = 0', () => {
    const a: Body = { mat: mat('ferro'), m: 0.5 };
    const b: Body = { mat: mat('agua'), m: 0.2 };
    const H = initialEnthalpy(a, 200) + initialEnthalpy(b, 25);
    const T = calEq(a, b, H).T;
    expect(0.5 * 450 * (T - 200) + 0.2 * C_WATER * (T - 25)).toBeCloseTo(0, 6);
  });
  it('gelo que não derrete todo: fica a 0 °C com fração líquida correta', () => {
    const ice: Body = { mat: mat('gelo'), m: 0.5 };
    const w: Body = { mat: mat('agua'), m: 0.2 };
    const H = initialEnthalpy(ice, 0) + initialEnthalpy(w, 30);
    const eq = calEq(ice, w, H);
    expect(eq.T).toBe(0);
    expect(eq.partial).toBe(true);
    // derrete m = Q/L com Q = 0,2·4186·30
    const melted = (0.2 * C_WATER * 30) / L_FUSION;
    const total = 0.7;
    // a entalpia total dividida entre os dois corpos a 0 °C dá a mesma massa líquida
    expect((H / L_FUSION - 0) / total).toBeCloseTo((0.2 + melted) / total, 9);
  });
  it('integração RK4 converge ao equilíbrio e conserva a entalpia', () => {
    const a: Body = { mat: mat('cobre'), m: 0.3 };
    const b: Body = { mat: mat('agua'), m: 0.25 };
    let HA = initialEnthalpy(a, 150);
    let HB = initialEnthalpy(b, 20);
    const H0 = HA + HB;
    const tau = timeConstant(a, b, 15);
    const h = tau / 1500;
    for (let i = 0; i < 1500 * 25; i++) ({ HA, HB } = stepHeat(a, b, 15, HA, HB, h));
    expect(HA + HB).toBeCloseTo(H0, 6);
    expect(temperature(a, HA)).toBeCloseTo(calEq(a, b, H0).T, 6);
    expect(liquidFraction(b, HB)).toBe(1);
  });
});

describe('Gases ideais', () => {
  it('velocidades iniciais dão exatamente a temperatura pedida', () => {
    const M = GASES[0].M;
    const s = createGas(300, 350, M, 12);
    expect(kineticTemperature(s, M)).toBeCloseTo(350, 9);
  });
  it('pressão medida nas paredes ≈ NkT/V', () => {
    const M = GASES[1].M;
    const s = createGas(400, 300, M, 12, 3);
    for (let i = 0; i < 20000; i++) stepGas(s, 0.02, M); // 400 ps
    const P = measuredPressure(s)!;
    expect(Math.abs(P / idealPressure(400, 300, 12) - 1)).toBeLessThan(0.03);
  });
});

describe('pH e titulação', () => {
  const [hcl, acetic, naoh, nh3] = ANALYTES;
  it('ácido forte: pH inicial = −log C e pH 7 na equivalência', () => {
    expect(exactPH(hcl, 0.1, 25, 0.1, 0)).toBeCloseTo(1, 4);
    expect(exactPH(hcl, 0.1, 25, 0.1, equivalenceVolume(0.1, 25, 0.1))).toBeCloseTo(7, 6);
  });
  it('ácido fraco: aproximação do ensino médio e pH = pKa na meia-equivalência', () => {
    expect(exactPH(acetic, 0.1, 25, 0.1, 0)).toBeCloseTo(textbookInitialPH(acetic, 0.1), 2);
    expect(exactPH(acetic, 0.1, 25, 0.1, 12.5)).toBeCloseTo(halfEquivalencePH(acetic)!, 2);
  });
  it('bases: NaOH pH 13 e NH₃ com pH = 14 − pKb na meia-equivalência', () => {
    expect(exactPH(naoh, 0.1, 25, 0.1, 0)).toBeCloseTo(13, 4);
    expect(exactPH(nh3, 0.1, 25, 0.1, 12.5)).toBeCloseTo(halfEquivalencePH(nh3)!, 2);
  });
  it('máxima inclinação da curva fica no volume de equivalência', () => {
    const V: number[] = [];
    const p: number[] = [];
    for (let i = 0; i <= 800; i++) {
      V.push(i * 0.0625);
      p.push(exactPH(hcl, 0.1, 25, 0.1, i * 0.0625));
    }
    expect(steepestPoint(V, p)!).toBeCloseTo(25, 1);
  });
});

describe('Estequiometria', () => {
  it('todas as equações estão balanceadas em massa e em átomos', () => {
    for (const r of REACTIONS) {
      const mb = massBalance(r);
      expect(mb.products).toBeCloseTo(mb.reactants, 9);
      const count = (ts: typeof r.reactants) => {
        const c: Record<string, number> = {};
        ts.forEach((t) => SPECIES[t.sp].atoms.forEach((a) => (c[a] = (c[a] ?? 0) + t.nu)));
        return c;
      };
      expect(count(r.products)).toEqual(count(r.reactants));
    }
  });
  it('2H₂ + O₂: 4 g de H₂ e 16 g de O₂ → O₂ limitante, 18 g de água', () => {
    const r = REACTIONS[0];
    const n = [4 / SPECIES.H2.M, 16 / SPECIES.O2.M];
    const lim = limiting(r, n);
    expect(lim.limiting).toBe(1);
    const m = masses(r, n, lim.xiMax);
    expect(m[2]).toBeCloseTo(2 * 0.5 * SPECIES.H2O.M, 2);
    expect(m.reduce((a, b) => a + b, 0)).toBeCloseTo(20, 9);
    expect(amounts(r, n, lim.xiMax)[1]).toBeCloseTo(0, 12);
  });
});

describe('Pilhas', () => {
  const Zn = METALS.find((m) => m.id === 'Zn')!;
  const Cu = METALS.find((m) => m.id === 'Cu')!;
  const Ag = METALS.find((m) => m.id === 'Ag')!;
  it('Daniell padrão: 1,10 V e formas de Nernst equivalentes', () => {
    expect(nernstCell(Zn, Cu, 1, 1)).toBeCloseTo(1.1, 12);
    expect(halfPotential(Cu, 0.01) - halfPotential(Zn, 0.5)).toBeCloseTo(nernstCell(Zn, Cu, 0.5, 0.01), 12);
    expect(lcm(Zn.n, Ag.n)).toBe(2);
    expect(halfPotential(Ag, 0.2) - halfPotential(Zn, 1.3)).toBeCloseTo(nernstCell(Zn, Ag, 1.3, 0.2), 12);
  });
  it('0,0592/n por década de concentração', () => {
    expect(nernstCell(Zn, Cu, 1, 0.1) - nernstCell(Zn, Cu, 1, 1)).toBeCloseTo(-0.05916 / 2, 5);
  });
  it('descarga: Faraday e balanço de elétrons', () => {
    const c: Cell = { an: Zn, cat: Cu, cAn0: 1, cCat0: 1, V: 0.1, R: 10, r: 1, U: 0 };
    let q = 0;
    const t: number[] = [0];
    const I: number[] = [cellAt(c, 0).I];
    const h = 0.01;
    for (let i = 0; i < 2000; i++) {
      q = rk4([q], h, ([x]) => [3600 * cellAt(c, x).I])[0];
      t.push((i + 1) * h);
      I.push(cellAt(c, q).I);
    }
    const s = cellAt(c, q);
    expect(chargeFromSeries(t, I) / q).toBeCloseTo(1, 6);
    expect(s.dmCat).toBeCloseTo((q * Cu.M) / (2 * F), 12);
    expect((s.cAn - 1) * 0.1 * 2).toBeCloseTo((1 - s.cCat) * 0.1 * 2, 12);
    expect(s.E).toBeLessThan(1.1);
  });
  it('fonte maior que E inverte a corrente (eletrólise)', () => {
    const c: Cell = { an: Zn, cat: Cu, cAn0: 1, cCat0: 1, V: 0.1, R: 10, r: 1, U: 2 };
    expect(cellAt(c, 0).I).toBeCloseTo((1.1 - 2) / 11, 12);
  });
});

describe('Efeito estufa', () => {
  it('sem atmosfera Te ≈ 255 K; pré-industrial ≈ 288 K', () => {
    expect(effectiveT(1361, 0.3)).toBeCloseTo(254.6, 1);
    expect(climEq(1361, 0.3, emissivity(280)).Ts).toBeCloseTo(288, 0);
  });
  it('2×CO₂ aquece ~1 K no modelo sem retroalimentações', () => {
    const d = climEq(1361, 0.3, emissivity(560)).Ts - climEq(1361, 0.3, emissivity(280)).Ts;
    expect(d).toBeGreaterThan(0.8);
    expect(d).toBeLessThan(1.6);
  });
  it('integração chega ao equilíbrio analítico com entra = sai', () => {
    const c = { S: 1361, albedo: 0.3, eps: emissivity(560) };
    const st = climEq(1361, 0.3, emissivity(280));
    let y = [st.Ts, st.Ta];
    for (let i = 0; i < 16000; i++) y = rk4(y, 0.005, ([a, b]) => derivs(c, a, b));
    const eq = climEq(c.S, c.albedo, c.eps);
    expect(y[0]).toBeCloseTo(eq.Ts, 6);
    expect(y[1]).toBeCloseTo(eq.Ta, 6);
    const f = fluxes(c, y[0], y[1]);
    expect(f.olr).toBeCloseTo(f.absorbed, 5);
  });
});
