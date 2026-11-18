export const F = 96485.33212; // C/mol
export const R_GAS = 8.314462618; // J/(mol·K)
export const T25 = 298.15; // K

export interface Metal {
  id: string;
  name: string;
  ion: string;
  n: number; // elétrons na semirreação Mⁿ⁺ + n e⁻ → M
  E0: number; // potencial padrão de redução (V)
  M: number; // g/mol
  color: string; // eletrodo
  ionColor: [number, number, number]; // cor da solução (a 1 mol/L)
}

export const METALS: Metal[] = [
  { id: 'Mg', name: 'Magnésio', ion: 'Mg²⁺', n: 2, E0: -2.37, M: 24.305, color: '#CBD5E1', ionColor: [200, 210, 225] },
  { id: 'Al', name: 'Alumínio', ion: 'Al³⁺', n: 3, E0: -1.66, M: 26.982, color: '#D1D5DB', ionColor: [200, 210, 225] },
  { id: 'Zn', name: 'Zinco', ion: 'Zn²⁺', n: 2, E0: -0.76, M: 65.38, color: '#94A3B8', ionColor: [200, 210, 225] },
  { id: 'Fe', name: 'Ferro', ion: 'Fe²⁺', n: 2, E0: -0.44, M: 55.845, color: '#78716C', ionColor: [150, 200, 140] },
  { id: 'Ni', name: 'Níquel', ion: 'Ni²⁺', n: 2, E0: -0.25, M: 58.693, color: '#A8A29E', ionColor: [60, 180, 110] },
  { id: 'Pb', name: 'Chumbo', ion: 'Pb²⁺', n: 2, E0: -0.13, M: 207.2, color: '#64748B', ionColor: [200, 210, 225] },
  { id: 'Cu', name: 'Cobre', ion: 'Cu²⁺', n: 2, E0: 0.34, M: 63.546, color: '#C2410C', ionColor: [40, 120, 230] },
  { id: 'Ag', name: 'Prata', ion: 'Ag⁺', n: 1, E0: 0.8, M: 107.868, color: '#E2E8F0', ionColor: [200, 210, 225] },
];

export const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
export const lcm = (a: number, b: number) => (a * b) / gcd(a, b);

/** Potencial de redução de uma semicélula (Nernst na forma de semirreação). */
export function halfPotential(m: Metal, c: number, T = T25) {
  return m.E0 + ((R_GAS * T) / (m.n * F)) * Math.log(Math.max(c, 1e-300));
}

/** Força eletromotriz pela equação global: E = E° − (RT/nF)·ln Q, com n = mmc dos elétrons. */
export function nernstCell(an: Metal, cat: Metal, cAn: number, cCat: number, T = T25) {
  const n = lcm(an.n, cat.n);
  const lnQ = (n / an.n) * Math.log(cAn) - (n / cat.n) * Math.log(cCat);
  return cat.E0 - an.E0 - ((R_GAS * T) / (n * F)) * lnQ;
}

export interface Cell {
  an: Metal; // eletrodo da esquerda (menor E°): ânodo quando a pilha descarrega
  cat: Metal;
  cAn0: number; // mol/L
  cCat0: number;
  V: number; // L de solução em cada béquer
  R: number; // Ω externo
  r: number; // Ω interno (ponte salina)
  U: number; // V da fonte externa (oposta à pilha)
}

/** Estado em função da carga q (C) que atravessou o circuito no sentido de descarga. */
export function cellAt(c: Cell, q: number) {
  const cAn = c.cAn0 + q / (c.an.n * F * c.V);
  const cCat = c.cCat0 - q / (c.cat.n * F * c.V);
  const E = halfPotential(c.cat, cCat) - halfPotential(c.an, cAn);
  const I = (E - c.U) / (c.R + c.r);
  return { cAn, cCat, E, I, dmAn: (-q * c.an.M) / (c.an.n * F), dmCat: (q * c.cat.M) / (c.cat.n * F) };
}

/** Trapézio de uma série (t em horas, I em A) → carga em C. */
export function chargeFromSeries(t: number[], I: number[]) {
  let q = 0;
  for (let i = 1; i < t.length; i++) q += 0.5 * (I[i] + I[i - 1]) * (t[i] - t[i - 1]) * 3600;
  return q;
}
