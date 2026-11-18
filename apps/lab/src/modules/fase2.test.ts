import { describe, expect, it } from 'vitest';
import { equivalent, rcExactVc, rcTau, solveDC, solveLinear, stepRC } from './circuitos/physics';
import { dipoleFlux, genFlux, genPeak, magnetEmf, magnetPeak, type MagnetParams } from './inducao/physics';
import { criticalAngle, fermatCrossing, fresnel, snell } from './refracao/physics';
import { gauss, magnification, traceImage } from './lentes/physics';
import { CELLS, DX, advanceWave, createWave, fdDt, measuredProbePeriod, measuredWavelength, pulseT0, waveSpeed, type WaveParams } from './ondas/physics';

const DEG = Math.PI / 180;

describe('Circuitos', () => {
  it('eliminação de Gauss resolve um sistema 3×3', () => {
    const x = solveLinear([[2, 1, -1], [-3, -1, 2], [-2, 1, 2]], [8, -11, -3]);
    expect(x[0]).toBeCloseTo(2, 12);
    expect(x[1]).toBeCloseTo(3, 12);
    expect(x[2]).toBeCloseTo(-1, 12);
  });
  for (const topo of ['serie', 'paralelo', 'misto'] as const) {
    it(`MNA = fórmula de associação (${topo}) e potência fecha`, () => {
      const p = { emf: 12, r: 0.5, R1: 10, R2: 20, R3: 30 };
      const s = solveDC(topo, p);
      expect(s.Itotal).toBeCloseTo(p.emf / (equivalent(topo, p) + p.r), 12);
      expect(s.Isource).toBeCloseTo(s.Itotal, 12);
      const Psum = Object.values(s.power).reduce((a, b) => a + b, 0);
      expect(Psum).toBeCloseTo(p.emf * s.Itotal, 10);
      expect(s.terminal).toBeCloseTo(p.emf - p.r * s.Itotal, 12);
    });
  }
  it('paralelo: correntes nos ramos somam a total e as tensões são iguais', () => {
    const s = solveDC('paralelo', { emf: 9, r: 1, R1: 6, R2: 3, R3: 2 });
    expect(s.I.R1 + s.I.R2 + s.I.R3).toBeCloseTo(s.Itotal, 12);
    expect(s.volt.R1).toBeCloseTo(s.volt.R3, 12);
  });
  it('RC: RK4 segue a exponencial e metade da energia vira calor', () => {
    const p = { emf: 10, r: 0, R: 10, C: 0.2, charging: true };
    const tau = rcTau(p);
    let s = { q: 0, Ebat: 0, Ediss: 0 };
    const h = tau / 400;
    for (let i = 0; i < 4000; i++) s = stepRC(p, s, h);
    expect(s.q / p.C).toBeCloseTo(rcExactVc(p, 4000 * h), 8);
    const Ec = 0.5 * p.C * (s.q / p.C) ** 2;
    expect(s.Ebat).toBeCloseTo(Ec + s.Ediss, 8);
    expect(s.Ediss / Ec).toBeCloseTo(1, 3); // após 10τ: dissipada ≈ armazenada
  });
});

describe('Indução', () => {
  it('gerador: −ΔΦ/Δt atinge N·B·A·ω', () => {
    const p = { N: 100, A: 0.02, B: 0.2, f: 2, R: 10 };
    const h = 1 / (p.f * 4000);
    let peak = 0;
    for (let k = 1; k <= 4000; k++) {
      const e = -(genFlux(p, 2 * Math.PI * p.f * k * h) - genFlux(p, 2 * Math.PI * p.f * (k - 1) * h)) / h;
      peak = Math.max(peak, Math.abs(e));
    }
    expect(peak / genPeak(p)).toBeCloseTo(1, 5);
  });
  it('ímã: ε = −dΦ/dt, pico em z = a/2 e ∫ε dt = −NΔΦ', () => {
    const p: MagnetParams = { N: 300, a: 0.02, m: 1.2, v: 1 };
    const z = 0.013;
    const dz = 1e-7;
    expect(magnetEmf(p, z)).toBeCloseTo((-(dipoleFlux(p, z + dz) - dipoleFlux(p, z - dz)) / (2 * dz)) * p.v, 9);
    expect(magnetPeak(p)).toBeGreaterThan(Math.abs(magnetEmf(p, 0.45 * p.a)));
    expect(magnetPeak(p)).toBeGreaterThan(Math.abs(magnetEmf(p, 0.55 * p.a)));
    // integral numérica (Simpson) de ε dt de −25 cm a 0
    const n = 20000;
    const z0 = -0.25;
    const dzz = (0 - z0) / n;
    let I = 0;
    for (let k = 0; k <= n; k++) I += (k === 0 || k === n ? 1 : k % 2 ? 4 : 2) * magnetEmf(p, z0 + k * dzz);
    I *= dzz / 3 / p.v;
    expect(I).toBeCloseTo(-(dipoleFlux(p, 0) - dipoleFlux(p, z0)), 9);
  });
});

describe('Refração', () => {
  it('Fermat reproduz Snell', () => {
    const n1 = 1;
    const n2 = 1.333;
    const t1 = 40 * DEG;
    const t2 = snell(n1, n2, t1)!;
    const r = fermatCrossing(n1, n2, [-1.7, 1.1], [0.9, -1.4]);
    expect(n1 * Math.sin(r.theta1)).toBeCloseTo(n2 * Math.sin(r.theta2), 7);
    const r2 = fermatCrossing(n1, n2, [-Math.sin(t1), Math.cos(t1)], [Math.sin(t2), -Math.cos(t2)]);
    expect(r2.x).toBeCloseTo(0, 7);
  });
  it('reflexão total acima do ângulo crítico e R + T = 1', () => {
    const tc = criticalAngle(1.52, 1)!;
    expect(snell(1.52, 1, tc + 0.01)).toBeNull();
    expect(snell(1.52, 1, tc - 0.01)).not.toBeNull();
    for (const a of [0, 20, 45, 70, 85]) {
      const f = fresnel(1, 1.52, a * DEG);
      expect(f.Rs + f.Ts).toBeCloseTo(1, 12);
      expect(f.Rp + f.Tp).toBeCloseTo(1, 12);
    }
    expect(fresnel(1, 1.5, 0).R).toBeCloseTo(0.04, 12); // 4% em incidência normal no vidro
    expect(fresnel(1, 1.5, Math.atan(1.5)).Rp).toBeCloseTo(0, 12); // Brewster
  });
});

describe('Lentes e espelhos', () => {
  const cases = [
    ['convergente', 10, 25],
    ['convergente', 10, 5],
    ['divergente', 10, 25],
    ['concavo', 12, 30],
    ['concavo', 12, 8],
    ['convexo', 12, 20],
  ] as const;
  for (const [el, f, p] of cases) {
    it(`raios = Gauss (${el}, f=${f}, p=${p})`, () => {
      const fs = el === 'convergente' || el === 'concavo' ? f : -f;
      const tr = traceImage(el, f, p, 5);
      const pi = gauss(fs, p);
      expect(tr.pi).toBeCloseTo(pi, 9);
      expect(tr.y / 5).toBeCloseTo(magnification(p, pi), 9);
    });
  }
  it('objeto em 2f forma imagem real, invertida e do mesmo tamanho', () => {
    expect(gauss(10, 20)).toBeCloseTo(20, 12);
    expect(magnification(20, 20)).toBe(-1);
  });
});

describe('Ondas em corda', () => {
  const base: WaveParams = { T: 4, mu: 0.25, gamma: 0, A: 0.08, f: 1, source: 'oscilador', end: 'sem-fim' };
  it('λ = v/f e T = 1/f medidos na malha', () => {
    const s = createWave(4);
    advanceWave(base, s, 7);
    const lam = measuredWavelength(s.u, 0.3, waveSpeed(base) * s.t - 2);
    expect(lam!).toBeCloseTo(waveSpeed(base) / base.f, 3);
    expect(measuredProbePeriod(s.crossings)!).toBeCloseTo(1, 4);
  });
  it('pulso chega à sonda em x/v', () => {
    const p: WaveParams = { ...base, source: 'pulso', T: 9, mu: 0.36 };
    const s = createWave(5);
    advanceWave(p, s, 5 / waveSpeed(p) + 1);
    expect(5 / (s.peak!.t - pulseT0(p))).toBeCloseTo(waveSpeed(p), 3);
  });
  it('Courant 1 é exato: o perfil é u(x,t) = A·sen(ω(t − x/v))', () => {
    const s = createWave(4);
    advanceWave(base, s, 3);
    const v = waveSpeed(base);
    for (const i of [10, 50, 100, 200]) {
      const x = i * DX;
      expect(s.u[i]).toBeCloseTo(base.A * Math.sin(2 * Math.PI * base.f * (s.t - x / v)), 10);
    }
    expect(CELLS * DX).toBeCloseTo(8, 12);
    expect(fdDt(base)).toBeCloseTo(DX / v, 15);
  });
  it('ponta fixa inverte o pulso; ponta livre não', () => {
    for (const end of ['fixa', 'livre'] as const) {
      const p: WaveParams = { ...base, source: 'pulso', end };
      const s = createWave(4);
      advanceWave(p, s, pulseT0(p) + (8 + 4) / waveSpeed(p)); // pulso volta e para no meio
      const ext = s.u.reduce((m, u) => (Math.abs(u) > Math.abs(m) ? u : m), 0);
      expect(Math.sign(ext)).toBe(end === 'fixa' ? -1 : 1);
    }
  });
});
