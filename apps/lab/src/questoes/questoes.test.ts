import { describe, expect, it } from 'vitest';
import { QUESTOES } from './banco';
import { MODULES } from '../modules/registry';
import { analyticVacuum } from '../modules/projetil/simulate';
import { muvState } from '../modules/muv/physics';
import { forces } from '../modules/newton/physics';
import { TRACKS, energies } from '../modules/energia/physics';
import { smallAnglePeriod } from '../modules/pendulo/physics';
import { equilibriumStretch, periodUndamped } from '../modules/mola/physics';
import { exactPeriod } from '../modules/pendulo/physics';
import { buoyancy, mass } from '../modules/empuxo/physics';
import { circularSpeed } from '../modules/orbitas/physics';
import { genFlux, magnetPeak } from '../modules/inducao/physics';
import { C_LIGHT, brewster } from '../modules/refracao/physics';
import { magnification } from '../modules/lentes/physics';
import { torricelliV2 } from '../modules/muv/physics';
import { enthalpy } from '../modules/calorimetria/physics';
import { componentVar } from '../modules/gases/physics';
import { SIGMA } from '../modules/estufa/physics';
import { bhaskara } from '../modules/funcoes/physics';
import { binomialMoments } from '../modules/estatistica/physics';
import { equivalentRate, pricePMT, simpleFV } from '../modules/juros/physics';
import { collide, energyLoss } from '../modules/colisoes/physics';
import { equilibrium as flutua, pressureAt, P_ATM } from '../modules/empuxo/physics';
import { elements, mu } from '../modules/orbitas/physics';
import { solveDC } from '../modules/circuitos/physics';
import { genPeak } from '../modules/inducao/physics';
import { criticalAngle, snell } from '../modules/refracao/physics';
import { gauss, vergence } from '../modules/lentes/physics';
import { harmonic, waveSpeed } from '../modules/ondas/physics';
import { MATERIALS, equilibrium as calEq, initialEnthalpy } from '../modules/calorimetria/physics';
import { ATM, R_GAS, idealPressure } from '../modules/gases/physics';
import { ANALYTES, exactPH, steepestPoint } from '../modules/ph/physics';
import { REACTIONS, SPECIES, limiting, masses } from '../modules/estequiometria/physics';
import { F, METALS, nernstCell } from '../modules/pilhas/physics';
import { effectiveT, emissivity, equilibrium as clima } from '../modules/estufa/physics';
import { nextQ } from '../modules/selecao/physics';
import { MODES, punnett } from '../modules/genetica/physics';
import { bisect, evaluate, vertex } from '../modules/funcoes/physics';
import { pmf, summary } from '../modules/estatistica/physics';
import { compoundFV, month, newLedger } from '../modules/juros/physics';

const DEG = Math.PI / 180;
const mat = (id: string) => MATERIALS.find((m) => m.id === id)!;
const metal = (id: string) => METALS.find((m) => m.id === id)!;
const modo = (id: string) => MODES.find((m) => m.id === id)!;

/** Gabarito recalculado pela física de cada módulo (independente do texto da questão). */
const RESPOSTAS: Record<string, () => number> = {
  'projetil-1': () => analyticVacuum({ v0: 20, angleDeg: 30, g: 10 }).range,
  'muv-1': () => muvState({ x0: 0, v0: 20, a: -5 }, 20 / 5).x,
  'muv-2': () => muvState({ x0: 0, v0: 0, a: 30 / 6 }, 6).x,
  'newton-1': () => Math.abs(forces({ m: 20, thetaDeg: 30, muS: 0.5, muK: 0.3, F: 0, g: 10 }, 0).a),
  'newton-2': () => Math.abs(forces({ m: 10, thetaDeg: 0, muS: 0.4, muK: 0.3, F: 30, g: 10 }, 0).fric),
  'energia-1': () => {
    const p = { track: TRACKS.U, g: 10, m: 60, c: 0 };
    const U0 = energies(p, Math.sqrt(5 / 0.25), 0).U; // altura 5 m na pista U (h = 0,25x²)
    return Math.sqrt((2 * U0) / p.m);
  },
  'energia-2': () => {
    const p = { track: TRACKS.U, g: 10, m: 60, c: 0 };
    return energies(p, Math.sqrt(20), 0).E - 0.5 * 60 * 8 * 8;
  },
  'pendulo-1': () => (2 / smallAnglePeriod(1, 10)) ** 2 * (Math.PI ** 2 / 10), // T ∝ √L; o enunciado usa π² ≈ 10
  'pendulo-2': () => smallAnglePeriod(4, 10) / smallAnglePeriod(1, 10),
  'mola-1': () => periodUndamped({ k: 200, m: 0.5, b: 0, g: 10 }),
  'mola-2': () => equilibriumStretch({ k: 200, m: 1, b: 0, g: 10 }) * 100,
  'colisoes-1': () => collide(2, 3, 1, 0, 0).v1,
  'colisoes-2': () => energyLoss(2, 3, 1, 0, 0),
  'empuxo-1': () => flutua({ a: 0.2, rhoC: 600, rhoF: 1000, g: 10 }).fraction * 100,
  'empuxo-2': () => pressureAt(1030, 10, 20) / P_ATM,
  'orbitas-1': () => elements({ M: 1, r0: 4, f: 1 }).T,
  'orbitas-2': () => {
    const p = { M: 1, r0: 3, f: Math.SQRT1_2 }; // afélio 3 UA, periélio 1 UA
    const el = elements(p);
    const v = (r: number) => Math.sqrt(mu(p) * (2 / r - 1 / el.a)); // vis-viva (energia), sem usar o momento angular
    return v(el.rPeri) / v(el.rApo);
  },
  'circuitos-1': () => solveDC('paralelo', { emf: 12, r: 1e-9, R1: 6, R2: 6, R3: 6 }).Itotal,
  'circuitos-2': () => solveDC('serie', { emf: 12, r: 1e-9, R1: 2, R2: 4, R3: 6 }).volt.R3,
  'inducao-1': () => genPeak({ N: 100, A: 0.02, B: 0.5, f: 60, R: 10 }),
  'inducao-2': () => genPeak({ N: 100, A: 0.02, B: 0.5, f: 120, R: 10 }) / genPeak({ N: 100, A: 0.02, B: 0.5, f: 60, R: 10 }),
  'refracao-1': () => snell(1, 1.33, 60 * DEG)! / DEG,
  'refracao-2': () => criticalAngle(1.33, 1)! / DEG,
  'lentes-1': () => gauss(10, 15),
  'lentes-2': () => vergence(-25),
  'ondas-1': () => waveSpeed({ T: 20, mu: 0.05 }),
  'ondas-2': () => harmonic({ T: 20, mu: 0.05 }, 3),
  'calorimetria-1': () => {
    const a = { mat: mat('agua'), m: 0.2 };
    const b = { mat: mat('agua'), m: 0.3 };
    return calEq(a, b, initialEnthalpy(a, 80) + initialEnthalpy(b, 20)).T;
  },
  'calorimetria-2': () => {
    const a = { mat: mat('gelo'), m: 0.1 };
    const b = { mat: mat('agua'), m: 0.4 };
    return calEq(a, b, initialEnthalpy(a, 0) + initialEnthalpy(b, 30)).T;
  },
  'gases-1': () => (2 * idealPressure(500, 330, 10)) / idealPressure(500, 300, 10),
  'gases-2': () => ((R_GAS * 273.15) / ATM) * 1000,
  'ph-1': () => exactPH(ANALYTES[0], 0.01, 25, 0.1, 0),
  'ph-2': () => {
    const V: number[] = [];
    const pH: number[] = [];
    for (let i = 0; i <= 1600; i++) {
      V.push(i * 0.025);
      pH.push(exactPH(ANALYTES[1], 0.08, 25, 0.1, i * 0.025));
    }
    return (0.1 * steepestPoint(V, pH)!) / 25; // Ca = Ct·Veq/Va com Veq medido na curva
  },
  'estequiometria-1': () => {
    const r = REACTIONS.find((x) => x.id === 'metano')!;
    const n = [32 / SPECIES.CH4.M, 1000 / SPECIES.O2.M];
    return masses(r, n, limiting(r, n).xiMax)[2];
  },
  'estequiometria-2': () => {
    const r = REACTIONS.find((x) => x.id === 'agua')!;
    const n = [4 / SPECIES.H2.M, 16 / SPECIES.O2.M];
    return masses(r, n, limiting(r, n).xiMax)[2];
  },
  'pilhas-1': () => nernstCell(metal('Zn'), metal('Cu'), 1, 1),
  'pilhas-2': () => (2 * 3600 * metal('Cu').M) / (metal('Cu').n * F),
  'estufa-1': () => effectiveT(1361, 0.3) - 273.15,
  'selecao-2': () => {
    const q = nextQ(0.4, 'escura', 0, 0); // sem seleção, q = √0,16 não muda
    return 2 * q * (1 - q) * 100;
  },
  'genetica-1': () => punnett(modo('mono'), 'Aa', 'Aa').probs.rec * 0.5 * 100,
  'genetica-2': () => {
    const p = punnett(modo('x'), 'XDXd', 'XDY').probs;
    return (100 * p.md) / (p.md + p.mn);
  },
  'genetica-3': () => punnett(modo('abo'), 'IAi', 'IBi').probs.O * 100,
  'funcoes-1': () => vertex({ a: -0.5, b: 4, c: -2 }).yv,
  'funcoes-2': () => bisect((x) => evaluate('exponencial', { a: 2, b: 0, c: 0.5 }, x) - 4, 0, 20),
  'estatistica-1': () => summary([0, 0, 0, 0, 0, 1, 2, 1, 3, 1])!.median,
  'estatistica-2': () => pmf(4, 0.5, 2) * 100,
  'juros-1': () => compoundFV(1000, 0.1, 3),
  'juros-2': () => month(newLedger(0, 12000), 0, 0.01, 0, 12000, 12).lastS,
  // ---------- segunda leva ----------
  'projetil-3': () => analyticVacuum({ v0: 30, angleDeg: 30, g: 10 }).maxHeight,
  'projetil-4': () => analyticVacuum({ v0: 25, angleDeg: 53, g: 10 }).flightTime,
  'muv-3': () => torricelliV2(0, 2.5, 20) ** 0.5,
  'muv-4': () => muvState({ x0: 10, v0: 5, a: -1 }, 4).x,
  'newton-3': () => Math.abs(forces({ m: 5, thetaDeg: 30, muS: 0, muK: 0, F: 0, g: 10 }, 0).a),
  'newton-4': () => -10 * forces({ m: 10, thetaDeg: 30, muS: 0.3, muK: 0.2, F: 0, g: 10 }, 1).a, // F que zera a aceleração subindo
  'newton-5': () => Math.abs(forces({ m: 20, thetaDeg: 30, muS: 0.8, muK: 0.5, F: 0, g: 10 }, 0).fric),
  'energia-3': () => {
    const p = { track: TRACKS.U, g: 10, m: 60, c: 0 };
    const x = bisect((x) => energies(p, x, 0).U - 0.5 * 60 * 64, 0, 6);
    return energies(p, x, 0).h;
  },
  'energia-4': () => {
    const p = { track: TRACKS.W, g: 10, m: 50, c: 0 };
    return Math.sqrt((2 * (energies(p, 0, 0).U - energies(p, 3, 0).U)) / p.m);
  },
  'energia-5': () => {
    const p = { track: TRACKS.U, g: 10, m: 50, c: 0 };
    return energies(p, Math.sqrt(5 / 0.25), 0).U - energies(p, Math.sqrt(3 / 0.25), 0).U;
  },
  'pendulo-3': () => smallAnglePeriod(1, 3.7),
  'pendulo-5': () => exactPeriod(1, 10, 90 * DEG) / smallAnglePeriod(1, 10),
  'mola-3': () => (0.2 * 2 * Math.PI) / periodUndamped({ k: 100, m: 1, b: 0, g: 10 }),
  'mola-4': () => periodUndamped({ k: 100, m: 2, b: 0, g: 10 }) / periodUndamped({ k: 100, m: 0.5, b: 0, g: 10 }),
  'colisoes-3': () => collide(1, 3, 1, 0, 1).v2,
  'colisoes-4': () => collide(2, 3, 1, 0, 0.5).v1,
  'colisoes-5': () => Math.abs(collide(4, 2, 2, -3, 0).v1),
  'empuxo-3': () => {
    const p = { a: 0.2, rhoC: 3000, rhoF: 1000, g: 10 };
    return mass(p) * p.g - buoyancy(p, 0.3); // y = 0,3 m: bloco todo abaixo da superfície
  },
  'empuxo-4': () => bisect((r) => flutua({ a: 0.2, rhoC: r, rhoF: 1000, g: 10 }).fraction - 0.75, 100, 999),
  'orbitas-3': () => elements({ M: 2, r0: 2, f: 1 }).T,
  'orbitas-4': () => circularSpeed({ M: 1, r0: 4, f: 1 }) / circularSpeed({ M: 1, r0: 1, f: 1 }),
  'circuitos-3': () => solveDC('misto', { emf: 12, r: 1e-9, R1: 4, R2: 12, R3: 12 }).I.R2,
  'circuitos-4': () => solveDC('serie', { emf: 12, r: 2, R1: 2, R2: 3, R3: 5 }).terminal,
  'circuitos-5': () => {
    const s = solveDC('paralelo', { emf: 12, r: 1e-9, R1: 6, R2: 6, R3: 6 });
    return s.power.R1 + s.power.R2 + s.power.R3;
  },
  'inducao-3': () => genFlux({ N: 200, A: 0.01, B: 0.4, f: 1, R: 10 }, 0),
  'inducao-4': () => magnetPeak({ N: 200, a: 0.03, m: 1, v: 2 }) / magnetPeak({ N: 200, a: 0.03, m: 1, v: 1 }),
  'refracao-3': () => C_LIGHT / 1.5 / 1e8,
  'refracao-4': () => brewster(1, 1.5) / DEG,
  'lentes-3': () => magnification(30, gauss(10, 30)),
  'lentes-4': () => magnification(10, gauss(20, 10)),
  'ondas-3': () => waveSpeed({ T: 20, mu: 0.05 }) / 4,
  'ondas-4': () => waveSpeed({ T: 20, mu: 0.05 }) / waveSpeed({ T: 5, mu: 0.05 }),
  'calorimetria-3': () => {
    const a = { mat: mat('ferro'), m: 0.5 };
    const b = { mat: mat('agua'), m: 1 };
    return calEq(a, b, initialEnthalpy(a, 100) + initialEnthalpy(b, 20)).T;
  },
  'calorimetria-4': () => {
    const b = { mat: mat('agua'), m: 2 };
    return (enthalpy(b, 70) - enthalpy(b, 20)) / 1000;
  },
  'calorimetria-5': () => mat('aluminio').c / mat('chumbo').c,
  'gases-3': () => idealPressure(500, 300, 5) / idealPressure(500, 300, 10),
  'gases-4': () => {
    const L2 = bisect((L) => idealPressure(500, 400, L) / idealPressure(500, 300, 10) - 2, 4, 20);
    return (3 * L2) / 10;
  },
  'gases-5': () => Math.sqrt(componentVar(300, 4.0026) / componentVar(300, 31.998)),
  'ph-3': () => exactPH(ANALYTES[2], 0.01, 25, 0.1, 0),
  'ph-4': () => exactPH(ANALYTES[1], 0.1, 25, 0.1, 0),
  'ph-5': () => exactPH(ANALYTES[1], 0.1, 25, 0.1, 12.5),
  'estequiometria-3': () => {
    const r = REACTIONS.find((x) => x.id === 'amonia')!;
    const n = [28 / SPECIES.N2.M, 10 / SPECIES.H2.M];
    return masses(r, n, limiting(r, n).xiMax)[2];
  },
  'estequiometria-4': () => {
    const r = REACTIONS.find((x) => x.id === 'amonia')!;
    const n = [28 / SPECIES.N2.M, 10 / SPECIES.H2.M];
    return masses(r, n, limiting(r, n).xiMax)[1];
  },
  'estequiometria-5': () => {
    const r = REACTIONS.find((x) => x.id === 'etanol')!;
    const n = [46 / SPECIES.C2H5OH.M, 200 / SPECIES.O2.M];
    return masses(r, n, 0.8 * limiting(r, n).xiMax)[2];
  },
  'pilhas-3': () => nernstCell(metal('Cu'), metal('Ag'), 1, 1),
  'pilhas-5': () => nernstCell(metal('Zn'), metal('Cu'), 1, 0.01),
  'estufa-3': () => (SIGMA * 600 ** 4) / (SIGMA * 300 ** 4),
  'estufa-4': () => effectiveT(1361, 0.6) - 273.15,
  'selecao-3': () => nextQ(0.3, 'escura', 0, 0) ** 2 * 100,
  'selecao-4': () => nextQ(0.5, 'clara', 0.5, 0),
  'genetica-4': () => punnett(modo('di'), 'AaBb', 'AaBb').probs.ab,
  'genetica-5': () => punnett(modo('incompleta'), 'VB', 'VB').probs.rosa * 100,
  'funcoes-3': () => evaluate('afim', { a: 2.5, b: 5, c: 0 }, 12),
  'funcoes-4': () => bhaskara({ a: -1, b: 8, c: -7 }).roots[1],
  'funcoes-5': () => evaluate('exponencial', { a: 0.5, b: 0, c: 4 }, 3),
  'estatistica-3': () => summary([0, 0, 1, 2, 0, 1, 0, 1])!.mean,
  'estatistica-4': () => Math.sqrt(binomialMoments(20, 0.5).variance),
  'estatistica-5': () => (1 - pmf(3, 0.5, 0)) * 100,
  'juros-3': () => simpleFV(2000, 0.03, 6),
  'juros-4': () => equivalentRate(0.01, 12) * 100,
  'juros-5': () => pricePMT(10000, 0.02, 12),
};


describe('Banco de questões', () => {
  it('estrutura: ids únicos, 5 alternativas distintas, módulo existente', () => {
    const ids = new Set<string>();
    for (const q of QUESTOES) {
      expect(ids.has(q.id), q.id).toBe(false);
      ids.add(q.id);
      expect(new Set(q.alternativas).size, q.id).toBe(5);
      expect(q.correta).toBeGreaterThanOrEqual(0);
      expect(q.correta).toBeLessThanOrEqual(4);
      expect(MODULES.find((m) => m.id === q.modulo)?.component, q.id).toBeTruthy();
      expect(q.texto.length).toBeGreaterThan(0);
      expect(q.resolucao.length).toBeGreaterThan(0);
    }
  });
  it('todo experimento disponível tem pelo menos duas questões', () => {
    for (const m of MODULES.filter((x) => x.component)) expect(QUESTOES.filter((q) => q.modulo === m.id).length, m.id).toBeGreaterThanOrEqual(2);
  });
  it('gabarito equilibrado entre as letras', () => {
    const c = [0, 0, 0, 0, 0];
    QUESTOES.forEach((q) => c[q.correta]++);
    for (const n of c) expect(n).toBeGreaterThanOrEqual(Math.floor(QUESTOES.length / 5) - 2);
  });
  it('toda questão numérica tem conferência pela física', () => {
    for (const q of QUESTOES) if (q.valores) expect(RESPOSTAS[q.id], q.id).toBeTypeOf('function');
  });
  for (const q of QUESTOES.filter((x) => x.valores)) {
    it(`${q.id}: o gabarito é a alternativa mais próxima do valor calculado`, () => {
      const v = RESPOSTAS[q.id]();
      const vals = q.valores!;
      const best = vals.reduce((bi, x, i) => (Math.abs(x - v) < Math.abs(vals[bi] - v) ? i : bi), 0);
      expect(best, `calculado ${v}`).toBe(q.correta);
      expect(Math.abs(vals[q.correta] - v) / Math.max(Math.abs(v), 1e-9), `calculado ${v}`).toBeLessThanOrEqual(q.tol ?? 0.02);
    });
  }
  it('estufa: 2× CO₂ aquece (sanidade da questão de albedo)', () => {
    expect(clima(1361, 0.25, emissivity(280)).Ts).toBeGreaterThan(clima(1361, 0.3, emissivity(280)).Ts);
  });
});
