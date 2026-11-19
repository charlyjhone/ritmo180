import { rk4 } from '../../core/stepper';

export const DEG = Math.PI / 180;

export interface PendParams {
  L: number;
  g: number;
  m: number;
  /** amortecimento linear (1/s) */
  b: number;
}

export function stepPendulum(p: PendParams, th: number, w: number, h: number) {
  const [a, b] = rk4([th, w], h, ([t, o]) => [o, -(p.g / p.L) * Math.sin(t) - p.b * o]);
  return { th: a, w: b };
}

/** Média aritmético-geométrica. */
export function agm(a: number, b: number) {
  for (let i = 0; i < 40 && Math.abs(a - b) > 1e-15 * a; i++) [a, b] = [(a + b) / 2, Math.sqrt(a * b)];
  return a;
}

/** Período exato do pêndulo sem amortecimento: T = 4√(L/g)·K(sen(θ₀/2)), K via AGM. */
export function exactPeriod(L: number, g: number, theta0: number) {
  const k = Math.sin(Math.abs(theta0) / 2);
  const K = Math.PI / (2 * agm(1, Math.sqrt(1 - k * k)));
  return 4 * Math.sqrt(L / g) * K;
}

export function smallAnglePeriod(L: number, g: number) {
  return 2 * Math.PI * Math.sqrt(L / g);
}

export function pendEnergy(p: PendParams, th: number, w: number) {
  const K = 0.5 * p.m * p.L * p.L * w * w;
  const U = p.m * p.g * p.L * (1 - Math.cos(th));
  return { K, U, E: K + U };
}
