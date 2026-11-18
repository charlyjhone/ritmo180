import { describe, expect, it } from 'vitest';
import { analyticVacuum, simulate, sampleAt, AIR_DENSITY_SEA_LEVEL, type LaunchParams } from './simulate';

const base: LaunchParams = {
  v0: 20,
  angleDeg: 45,
  g: 9.81,
  cd: 0,
  mass: 1,
  diameter: 0.1,
  airDensity: AIR_DENSITY_SEA_LEVEL,
};

describe('vácuo (arrasto = 0)', () => {
  const cases: Array<[number, number, number]> = [];
  for (const v0 of [1, 5, 18, 20, 37.5, 100]) {
    for (const ang of [5, 15, 30, 45, 60, 75, 89]) {
      for (const g of [1.62, 3.71, 9.81, 24.79]) cases.push([v0, ang, g]);
    }
  }

  it.each(cases)('v0=%s m/s, θ=%s°, g=%s m/s² → R e H batem com as fórmulas', (v0, ang, g) => {
    const p = { ...base, v0, angleDeg: ang, g };
    const sim = simulate(p).summary;
    const ref = analyticVacuum(p);
    // erro relativo < 1e-9
    expect(Math.abs(sim.range - ref.range)).toBeLessThanOrEqual(1e-9 * Math.max(1, ref.range));
    expect(Math.abs(sim.maxHeight - ref.maxHeight)).toBeLessThanOrEqual(1e-9 * Math.max(1, ref.maxHeight));
    expect(Math.abs(sim.flightTime - ref.flightTime)).toBeLessThanOrEqual(1e-9 * Math.max(1, ref.flightTime));
  });

  it('45° maximiza o alcance', () => {
    const r = (a: number) => simulate({ ...base, angleDeg: a }).summary.range;
    expect(r(45)).toBeGreaterThan(r(44));
    expect(r(45)).toBeGreaterThan(r(46));
  });

  it('ângulos complementares têm o mesmo alcance', () => {
    const r30 = simulate({ ...base, angleDeg: 30 }).summary.range;
    const r60 = simulate({ ...base, angleDeg: 60 }).summary.range;
    expect(Math.abs(r30 - r60)).toBeLessThan(1e-9);
  });

  it('90°: alcance nulo e altura v0²/2g', () => {
    const s = simulate({ ...base, angleDeg: 90 }).summary;
    expect(Math.abs(s.range)).toBeLessThan(1e-9);
    expect(s.maxHeight).toBeCloseTo((20 * 20) / (2 * 9.81), 9);
  });

  it('energia mecânica se conserva ao longo dos pontos', () => {
    const res = simulate(base);
    const e0 = 0.5 * base.v0 * base.v0;
    for (const q of res.points) {
      const e = 0.5 * (q.vx * q.vx + q.vy * q.vy) + base.g * q.y;
      expect(Math.abs(e - e0)).toBeLessThan(1e-9);
    }
  });

  it('interpolação é exata no vácuo', () => {
    const res = simulate(base);
    const t = 1.2345;
    const q = sampleAt(res.points, t);
    const th = (45 * Math.PI) / 180;
    expect(q.x).toBeCloseTo(20 * Math.cos(th) * t, 9);
    expect(q.y).toBeCloseTo(20 * Math.sin(th) * t - 0.5 * 9.81 * t * t, 9);
  });
});

describe('com arrasto', () => {
  it('reduz alcance, altura e diminui a velocidade de impacto', () => {
    const vac = simulate(base).summary;
    const air = simulate({ ...base, cd: 0.47 }).summary;
    expect(air.range).toBeLessThan(vac.range);
    expect(air.maxHeight).toBeLessThan(vac.maxHeight);
    expect(air.impactSpeed).toBeLessThan(base.v0);
  });

  it('ângulo ótimo cai abaixo de 45°', () => {
    const p = { ...base, v0: 60, cd: 0.47, mass: 0.2, diameter: 0.2 };
    let best = 0;
    let bestR = -1;
    for (let a = 20; a <= 60; a++) {
      const r = simulate({ ...p, angleDeg: a }).summary.range;
      if (r > bestR) {
        bestR = r;
        best = a;
      }
    }
    expect(best).toBeLessThan(45);
  });

  it('energia mecânica só diminui', () => {
    const p = { ...base, cd: 0.47 };
    const res = simulate(p);
    let prev = Infinity;
    for (const q of res.points) {
      const e = 0.5 * (q.vx * q.vx + q.vy * q.vy) + p.g * q.y;
      expect(e).toBeLessThanOrEqual(prev + 1e-9);
      prev = e;
    }
  });
});
