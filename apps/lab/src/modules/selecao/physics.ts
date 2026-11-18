import { type Rand } from '../../core/random';

/** Genótipos: 0 = CC (escura), 1 = Cc (escura, C dominante), 2 = cc (clara). */
export type Env = 'clara' | 'escura';

/** Aptidão (probabilidade de escapar dos predadores) de cada genótipo no ambiente. */
export function fitness(env: Env, s: number): [number, number, number] {
  return env === 'clara' ? [1 - s, 1 - s, 1] : [1, 1, 1 - s];
}

const mutate = (q: number, mu: number) => q * (1 - mu) + (1 - q) * mu;

/** Modelo determinístico (população infinita, Hardy–Weinberg ao nascer). q = frequência do alelo c. */
export function nextQ(q: number, env: Env, s: number, mu: number) {
  const p = 1 - q;
  const w = fitness(env, s);
  const f = [p * p, 2 * p * q, q * q];
  const wbar = f[0] * w[0] + f[1] * w[1] + f[2] * w[2];
  const qSel = (0.5 * f[1] * w[1] + f[2] * w[2]) / wbar;
  return mutate(qSel, mu);
}

/** Fórmulas clássicas (sem mutação): seleção contra o recessivo ou contra o dominante. */
export function haldane(q: number, env: Env, s: number) {
  const p = 1 - q;
  return env === 'escura' ? (q * (1 - s * q)) / (1 - s * q * q) : (q * (1 - s * p)) / (1 - s * (1 - q * q));
}

export interface Population {
  g: Uint8Array; // genótipos dos indivíduos nascidos nesta geração
  gen: number;
  qDet: number;
  varDrift: number; // variância esperada de q pela deriva (método delta)
  survivors: number; // sobreviventes da última predação
  qPool: number; // frequência de c entre os gametas dos pais desta geração
  counts: [number, number, number];
  last: { q: number; env: Env; s: number; qNext: number } | null;
  extinct: boolean;
}

export function countGenotypes(g: Uint8Array): [number, number, number] {
  const c: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < g.length; i++) c[g[i]]++;
  return c;
}

export const alleleQ = (c: [number, number, number]) => (c[1] + 2 * c[2]) / (2 * (c[0] + c[1] + c[2]));

export function createPopulation(N: number, pC: number, rand: Rand): Population {
  const g = new Uint8Array(N);
  for (let i = 0; i < N; i++) g[i] = (rand() < pC ? 0 : 1) + (rand() < pC ? 0 : 1);
  const counts = countGenotypes(g);
  return { g, gen: 0, qDet: 1 - pC, varDrift: 0, survivors: N, qPool: 1 - pC, counts, last: null, extinct: false };
}

/** Uma geração: predação seletiva, depois acasalamento ao acaso entre os sobreviventes (Wright–Fisher) com mutação. */
export function nextGeneration(pop: Population, env: Env, s: number, mu: number, rand: Rand): Population {
  const N = pop.g.length;
  const w = fitness(env, s);
  // alelos c entre os sobreviventes
  let alive = 0;
  let cAlleles = 0;
  for (let i = 0; i < N; i++) {
    if (rand() < w[pop.g[i]]) {
      alive++;
      cAlleles += pop.g[i];
    }
  }
  const qDetNext = nextQ(pop.qDet, env, s, mu);
  // método delta: a variância herdada é escalada por (dq'/dq)², mais a nova amostragem de 2N gametas
  const e = 1e-6;
  const d = (nextQ(Math.min(1, pop.qDet + e), env, s, mu) - nextQ(Math.max(0, pop.qDet - e), env, s, mu)) / (Math.min(1, pop.qDet + e) - Math.max(0, pop.qDet - e));
  const varNext = pop.varDrift * d * d + (qDetNext * (1 - qDetNext)) / (2 * N);
  const last = { q: pop.qDet, env, s, qNext: qDetNext };
  if (alive === 0) return { ...pop, gen: pop.gen + 1, survivors: 0, extinct: true, qDet: qDetNext, varDrift: varNext, last };
  const qPool = cAlleles / (2 * alive);
  const g = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    let a = rand() < qPool ? 1 : 0;
    let b = rand() < qPool ? 1 : 0;
    if (rand() < mu) a = 1 - a;
    if (rand() < mu) b = 1 - b;
    g[i] = a + b;
  }
  return { g, gen: pop.gen + 1, qDet: qDetNext, varDrift: varNext, survivors: alive, qPool: mutate(qPool, mu), counts: countGenotypes(g), last, extinct: false };
}
