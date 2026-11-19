import { rk4 } from '../../core/stepper';

export const P_ATM = 101325; // Pa
export const LEVEL = 1.2; // altura da superfície do fluido (m)

export interface BuoyParams {
  a: number; // aresta do cubo (m)
  rhoC: number; // densidade do corpo (kg/m³)
  rhoF: number; // densidade do fluido (kg/m³)
  g: number;
}

export const mass = (p: BuoyParams) => p.rhoC * p.a ** 3;
export const submergedDepth = (p: BuoyParams, y: number) => Math.min(p.a, Math.max(0, LEVEL - y));

/** Empuxo de Arquimedes: E = ρ_f · g · V_sub */
export const buoyancy = (p: BuoyParams, y: number) => p.rhoF * p.g * p.a * p.a * submergedDepth(p, y);

/** Força total vertical (sem contato com o fundo). Inclui arrasto do fluido para o corpo chegar ao repouso. */
export function netForce(p: BuoyParams, y: number, v: number) {
  const m = mass(p);
  const frac = submergedDepth(p, y) / p.a;
  const kEff = p.rhoF * p.g * p.a * p.a;
  const lin = 2 * 0.25 * Math.sqrt(kEff * m) * frac;
  const quad = 0.5 * p.rhoF * 1.05 * p.a * p.a * frac;
  return -m * p.g + buoyancy(p, y) - lin * v - quad * Math.abs(v) * v;
}

/** y = altura da base do cubo acima do fundo do recipiente. */
export function stepBlock(p: BuoyParams, y: number, v: number, h: number) {
  const m = mass(p);
  let [ny, nv] = rk4([y, v], h, ([q, w]) => [w, netForce(p, q, w) / m]);
  if (ny <= 0) {
    ny = 0;
    nv = Math.max(0, nv);
  }
  return { y: ny, v: nv };
}

/** Lei de Stevin: P = P₀ + ρ·g·h */
export const pressureAt = (rho: number, g: number, depth: number) => P_ATM + rho * g * depth;

/** Altura de equilíbrio da base (flutuando) ou 0 (afunda). */
export function equilibrium(p: BuoyParams) {
  if (p.rhoC < p.rhoF) return { floats: true, y: LEVEL - (p.rhoC / p.rhoF) * p.a, fraction: p.rhoC / p.rhoF };
  return { floats: false, y: 0, fraction: 1 };
}
