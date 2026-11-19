import { describe, expect, it } from 'vitest';
import { measuredPeriod, type Sample } from '../core/stepper';
import { muvState, torricelliV2 } from './muv/physics';
import { forces, stepIncline } from './newton/physics';
import { TRACKS, energies, stepTrack } from './energia/physics';
import { DEG, exactPeriod, smallAnglePeriod, stepPendulum } from './pendulo/physics';
import { equilibriumStretch, periodDamped, periodUndamped, springEnergy, stepSpring } from './mola/physics';
import { collide, energyLoss, stepCarts, type CollisionState } from './colisoes/physics';
import { LEVEL, buoyancy, equilibrium, mass, pressureAt, stepBlock, submergedDepth } from './empuxo/physics';
import { elements, initialState, orbitEnergy, stepOrbit } from './orbitas/physics';

/** Integra e devolve um histórico amostrado para medir períodos. */
function run<S>(s0: S, step: (s: S, h: number) => S, pick: (s: S) => Record<string, number>, h: number, tMax: number) {
  const hist: Sample[] = [];
  let s = s0;
  const n = Math.round(tMax / h);
  for (let i = 0; i <= n; i++) {
    hist.push({ t: i * h, ...pick(s) } as Sample);
    s = step(s, h);
  }
  return { s, hist };
}

describe('MUV', () => {
  it('posição e velocidade batem com Torricelli', () => {
    const p = { x0: 2, v0: 3, a: -1.5 };
    const { x, v } = muvState(p, 4);
    expect(x).toBeCloseTo(2 + 12 - 12, 12);
    expect(v).toBeCloseTo(-3, 12);
    expect(v * v).toBeCloseTo(torricelliV2(p.v0, p.a, x - p.x0), 10);
  });
});

describe('Leis de Newton no plano inclinado', () => {
  const base = { m: 2, thetaDeg: 30, muS: 0, muK: 0, F: 0, g: 9.81 };
  it('sem atrito: a = −g·sen θ e N = m·g·cos θ', () => {
    const f = forces(base, 0);
    expect(f.N).toBeCloseTo(2 * 9.81 * Math.cos(30 * DEG), 10);
    expect(f.a).toBeCloseTo(-9.81 * Math.sin(30 * DEG), 10);
  });
  it('atrito estático segura o bloco quando tg θ < μe', () => {
    const f = forces({ ...base, thetaDeg: 20, muS: 0.5, muK: 0.4 }, 0);
    expect(f.regime).toBe('repouso');
    expect(f.a).toBe(0);
  });
  it('bloco lançado rampa acima para no instante certo', () => {
    const p = { ...base, muS: 0.6, muK: 0.6 };
    let s = 0;
    let v = 5;
    for (let i = 0; i < 4000; i++) ({ s, v } = stepIncline(p, s, v, 1e-3));
    const aUp = 9.81 * (Math.sin(30 * DEG) + 0.6 * Math.cos(30 * DEG));
    expect(v).toBe(0);
    expect(s).toBeCloseTo(25 / (2 * aUp), 6);
  });
});

describe('Energia mecânica na pista', () => {
  it('sem atrito, a energia total se conserva', () => {
    const p = { track: TRACKS.U, g: 9.81, m: 1, c: 0 };
    let x = 4;
    let vx = 0;
    const E0 = energies(p, x, vx).E;
    for (let i = 0; i < 6000; i++) ({ x, vx } = stepTrack(p, x, vx, 1 / 600));
    expect(Math.abs(energies(p, x, vx).E - E0) / E0).toBeLessThan(1e-6);
  });
});

describe('Pêndulo simples', () => {
  it('período exato (AGM) para 60°', () => {
    // valor de referência: T/T0 = 1,07318 para 60°
    expect(exactPeriod(1, 9.81, 60 * DEG) / smallAnglePeriod(1, 9.81)).toBeCloseTo(1.07318, 4);
  });
  it('RK4 reproduz o período exato', () => {
    const p = { L: 1.5, g: 9.81, m: 1, b: 0 };
    const { hist } = run({ th: -50 * DEG, w: 0 }, (s, h) => stepPendulum(p, s.th, s.w, h), (s) => ({ th: s.th }), 1e-3, 8);
    expect(measuredPeriod(hist, 'th')!).toBeCloseTo(exactPeriod(1.5, 9.81, 50 * DEG), 4);
  });
});

describe('Sistema massa-mola', () => {
  const p = { k: 40, m: 1, b: 0, g: 9.81 };
  it('período medido = 2π√(m/k)', () => {
    const { hist } = run({ x: -0.15, v: 0 }, (s, h) => stepSpring(p, s.x, s.v, h), (s) => ({ x: s.x }), 1e-3, 5);
    expect(measuredPeriod(hist, 'x')!).toBeCloseTo(periodUndamped(p), 5);
  });
  it('amortecido: T = 2π/√(k/m − (b/2m)²)', () => {
    const q = { ...p, b: 2 };
    const { hist } = run({ x: -0.15, v: 0 }, (s, h) => stepSpring(q, s.x, s.v, h), (s) => ({ x: s.x }), 1e-3, 5);
    expect(measuredPeriod(hist, 'x')!).toBeCloseTo(periodDamped(q)!, 4);
  });
  it('no equilíbrio Fel = P e a energia se conserva', () => {
    expect(p.k * equilibriumStretch(p)).toBeCloseTo(p.m * p.g, 12);
    let s = { x: 0.15, v: 0 };
    const E0 = springEnergy(p, s.x, s.v).E;
    for (let i = 0; i < 5000; i++) s = stepSpring(p, s.x, s.v, 1e-3);
    expect(springEnergy(p, s.x, s.v).E).toBeCloseTo(E0, 8);
  });
});

describe('Colisões 1D', () => {
  it('elástica conserva p e Ec; inelástica dissipa ½μΔv²', () => {
    const r = collide(2, 2, 1, -1, 1);
    expect(2 * r.v1 + r.v2).toBeCloseTo(3, 12);
    expect(r.v1 * r.v1 + 0.5 * r.v2 * r.v2).toBeCloseTo(4 + 0.5, 12);
    const q = collide(2, 2, 1, -1, 0);
    expect(q.v1).toBeCloseTo(q.v2, 12);
    expect(energyLoss(2, 2, 1, -1, 0)).toBeCloseTo(0.5 * (2 / 3) * 9, 12);
  });
  it('a colisão acontece no instante exato do contato', () => {
    let s: CollisionState = { a: { m: 1, v: 1, x: -2 }, b: { m: 1, v: -1, x: 2 }, collided: false, tCollision: null };
    let t = 0;
    for (let i = 0; i < 1000; i++) {
      s = stepCarts(s, 1 / 240, 1, t);
      t += 1 / 240;
    }
    const w = 0.35; // largura de um carrinho de 1 kg
    expect(s.tCollision!).toBeCloseTo((4 - w) / 2, 10);
    expect(s.a.v).toBeCloseTo(-1, 12);
  });
});

describe('Hidrostática e empuxo', () => {
  it('Stevin: 10 m de água somam ≈ 1 atm', () => {
    expect(pressureAt(1000, 9.81, 10) - pressureAt(1000, 9.81, 0)).toBeCloseTo(98100, 6);
  });
  it('madeira na água flutua com 60% submerso', () => {
    const p = { a: 0.3, rhoC: 600, rhoF: 1000, g: 9.81 };
    let s = { y: LEVEL + 0.15, v: 0 };
    for (let i = 0; i < 30000; i++) s = stepBlock(p, s.y, s.v, 1e-3);
    expect(submergedDepth(p, s.y) / p.a).toBeCloseTo(equilibrium(p).fraction, 4);
    expect(buoyancy(p, s.y)).toBeCloseTo(mass(p) * p.g, 2);
  });
  it('ferro afunda e para no fundo', () => {
    const p = { a: 0.2, rhoC: 7870, rhoF: 1000, g: 9.81 };
    let s = { y: LEVEL + 0.15, v: 0 };
    for (let i = 0; i < 10000; i++) s = stepBlock(p, s.y, s.v, 1e-3);
    expect(s.y).toBe(0);
    expect(equilibrium(p).floats).toBe(false);
  });
});

describe('Órbitas e leis de Kepler', () => {
  it('Terra: órbita circular de 1 ano', () => {
    const e = elements({ M: 1, r0: 1, f: 1 });
    expect(e.T).toBeCloseTo(1, 12);
    expect(e.e).toBeCloseTo(0, 12);
  });
  it('3ª lei e conservação da energia numa elipse', () => {
    const p = { M: 2, r0: 2, f: 0.7 };
    const el = elements(p);
    expect(el.T ** 2).toBeCloseTo(el.a ** 3 / p.M, 10);
    const { s, hist } = run(initialState(p), (q, h) => stepOrbit(p, q, h), (q) => ({ y: q.y }), el.T / 2000, el.T * 2.2);
    const z = hist.filter((h, i) => i > 0 && hist[i - 1].y < 0 && h.y >= 0);
    expect(z[0].t).toBeCloseTo(el.T, 2);
    expect(orbitEnergy(p, s).E).toBeCloseTo(el.energy, 6);
  });
});
