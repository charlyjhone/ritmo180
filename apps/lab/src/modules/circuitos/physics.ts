import { rk4 } from '../../core/stepper';

/** Resolve A·x = b por eliminação de Gauss com pivotamento parcial. */
export function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-15) throw new Error('sistema singular');
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

export interface Resistor {
  id: string;
  a: number; // nó de onde a corrente positiva sai
  b: number; // nó para onde ela vai
  R: number;
}

/**
 * Análise nodal modificada (MNA): resistores + uma fonte ideal de fem `emf` entre `plus` e o nó 0 (terra).
 * Devolve potenciais dos nós e correntes (a → b) em cada resistor.
 */
export function solveCircuit(nodes: number, resistors: Resistor[], plus: number, emf: number) {
  const n = nodes - 1; // incógnitas V1..V(n) + corrente da fonte
  const size = n + 1;
  const A = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  const b = new Array<number>(size).fill(0);
  const idx = (node: number) => node - 1;
  for (const r of resistors) {
    const g = 1 / r.R;
    if (r.a) A[idx(r.a)][idx(r.a)] += g;
    if (r.b) A[idx(r.b)][idx(r.b)] += g;
    if (r.a && r.b) {
      A[idx(r.a)][idx(r.b)] -= g;
      A[idx(r.b)][idx(r.a)] -= g;
    }
  }
  // fonte: V(plus) − V(0) = emf; a corrente da fonte entra no nó plus
  A[idx(plus)][n] -= 1;
  A[n][idx(plus)] = 1;
  b[n] = emf;
  const x = solveLinear(A, b);
  const V = [0, ...x.slice(0, n)];
  const I: Record<string, number> = {};
  for (const r of resistors) I[r.id] = (V[r.a] - V[r.b]) / r.R;
  return { V, I, Isource: x[n] };
}

export type Topology = 'serie' | 'paralelo' | 'misto';

export interface DCParams {
  emf: number;
  r: number;
  R1: number;
  R2: number;
  R3: number;
}

/** Monta o netlist de cada associação. Nó 1 = polo +, a resistência interna r liga 1 → 2. */
export function netlist(topo: Topology, p: DCParams): { nodes: number; resistors: Resistor[] } {
  const r = { id: 'r', a: 1, b: 2, R: p.r };
  if (topo === 'serie')
    return {
      nodes: 5,
      resistors: [r, { id: 'R1', a: 2, b: 3, R: p.R1 }, { id: 'R2', a: 3, b: 4, R: p.R2 }, { id: 'R3', a: 4, b: 0, R: p.R3 }],
    };
  if (topo === 'paralelo')
    return {
      nodes: 3,
      resistors: [r, { id: 'R1', a: 2, b: 0, R: p.R1 }, { id: 'R2', a: 2, b: 0, R: p.R2 }, { id: 'R3', a: 2, b: 0, R: p.R3 }],
    };
  return {
    nodes: 4,
    resistors: [r, { id: 'R1', a: 2, b: 3, R: p.R1 }, { id: 'R2', a: 3, b: 0, R: p.R2 }, { id: 'R3', a: 3, b: 0, R: p.R3 }],
  };
}

/** Resistência equivalente pelas fórmulas de associação (para conferir a MNA). */
export function equivalent(topo: Topology, p: DCParams) {
  if (topo === 'serie') return p.R1 + p.R2 + p.R3;
  if (topo === 'paralelo') return 1 / (1 / p.R1 + 1 / p.R2 + 1 / p.R3);
  return p.R1 + (p.R2 * p.R3) / (p.R2 + p.R3);
}

export function solveDC(topo: Topology, p: DCParams) {
  const net = netlist(topo, p);
  const sol = solveCircuit(net.nodes, net.resistors, 1, p.emf);
  const volt: Record<string, number> = {};
  for (const r of net.resistors) volt[r.id] = sol.V[r.a] - sol.V[r.b];
  const power: Record<string, number> = {};
  for (const r of net.resistors) power[r.id] = r.R * sol.I[r.id] ** 2;
  return { ...sol, volt, power, I: sol.I, Itotal: sol.I.r, terminal: sol.V[2] };
}

// ---------- Circuito RC ----------

export interface RCParams {
  emf: number;
  r: number;
  R: number;
  C: number; // F
  charging: boolean;
}

export interface RCState {
  q: number; // C
  Ebat: number; // energia fornecida pela bateria (J)
  Ediss: number; // energia dissipada nos resistores (J)
}

export const rcTau = (p: RCParams) => (p.R + (p.charging ? p.r : 0)) * p.C;

export function rcCurrent(p: RCParams, q: number) {
  const e = p.charging ? p.emf : 0;
  const Rt = p.R + (p.charging ? p.r : 0);
  return (e - q / p.C) / Rt;
}

export function stepRC(p: RCParams, s: RCState, h: number): RCState {
  const e = p.charging ? p.emf : 0;
  const Rt = p.R + (p.charging ? p.r : 0);
  // estado aumentado: [q, Ebat, Ediss]
  const [q, Eb, Ed] = rk4([s.q, s.Ebat, s.Ediss], h, ([qq]) => {
    const i = (e - qq / p.C) / Rt;
    return [i, e * i, i * i * Rt];
  });
  return { q, Ebat: Eb, Ediss: Ed };
}

/** Solução exata de V_C(t). */
export function rcExactVc(p: RCParams, t: number) {
  const tau = rcTau(p);
  return p.charging ? p.emf * (1 - Math.exp(-t / tau)) : p.emf * Math.exp(-t / tau);
}
