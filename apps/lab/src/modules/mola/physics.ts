import { rk4 } from '../../core/stepper';

export interface SpringParams {
  k: number; // N/m
  m: number; // kg
  b: number; // kg/s
  g: number; // m/s²
}

/** x = deslocamento a partir do equilíbrio (positivo para baixo). */
export function stepSpring(p: SpringParams, x: number, v: number, h: number) {
  const [nx, nv] = rk4([x, v], h, ([q, w]) => [w, -(p.k / p.m) * q - (p.b / p.m) * w]);
  return { x: nx, v: nv };
}

export const periodUndamped = (p: SpringParams) => 2 * Math.PI * Math.sqrt(p.m / p.k);

/** Período do oscilador subamortecido; null se não oscila. */
export function periodDamped(p: SpringParams) {
  const w0sq = p.k / p.m;
  const gam = p.b / (2 * p.m);
  const wd2 = w0sq - gam * gam;
  return wd2 > 0 ? (2 * Math.PI) / Math.sqrt(wd2) : null;
}

export const equilibriumStretch = (p: SpringParams) => (p.m * p.g) / p.k;

/** Energias com referência gravitacional no equilíbrio. */
export function springEnergy(p: SpringParams, x: number, v: number) {
  const d = equilibriumStretch(p);
  const K = 0.5 * p.m * v * v;
  const Uel = 0.5 * p.k * (d + x) ** 2;
  const Ug = -p.m * p.g * x;
  return { K, Uel, Ug, E: K + Uel + Ug };
}
