import { rk4 } from '../../core/stepper';

/** Unidades: distância em UA, tempo em anos, massa em massas solares. Assim GM☉ = 4π² UA³/ano². */
export const GM_SUN = 4 * Math.PI ** 2;
/** 1 UA/ano em km/s. */
export const AU_PER_YEAR_KMS = 4.740470463;

export interface OrbitParams {
  M: number; // massa da estrela (M☉)
  r0: number; // distância inicial (UA), no afélio ou periélio
  f: number; // fração da velocidade circular
}

export interface OrbitState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export const mu = (p: OrbitParams) => GM_SUN * p.M;
export const circularSpeed = (p: OrbitParams) => Math.sqrt(mu(p) / p.r0);

export function initialState(p: OrbitParams): OrbitState {
  return { x: p.r0, y: 0, vx: 0, vy: p.f * circularSpeed(p) };
}

/** Elementos da órbita para a condição inicial (velocidade perpendicular ao raio). */
export function elements(p: OrbitParams) {
  const GM = mu(p);
  const v0 = p.f * circularSpeed(p);
  const energy = 0.5 * v0 * v0 - GM / p.r0; // por unidade de massa
  const a = -GM / (2 * energy);
  const e = Math.abs(p.f * p.f - 1);
  const T = 2 * Math.PI * Math.sqrt(a ** 3 / GM); // em anos: T² = a³/M
  const L = p.r0 * v0; // momento angular específico
  return { a, e, T, L, energy, rPeri: a * (1 - e), rApo: a * (1 + e), b: a * Math.sqrt(1 - e * e) };
}

const deriv = (GM: number) => ([x, y, vx, vy]: number[]) => {
  const r3 = Math.hypot(x, y) ** 3;
  return [vx, vy, (-GM * x) / r3, (-GM * y) / r3];
};

/** RK4 com subpassos menores perto da estrela (o passo encolhe com r^1,5). */
export function stepOrbit(p: OrbitParams, s: OrbitState, h: number): OrbitState {
  const GM = mu(p);
  let y = [s.x, s.y, s.vx, s.vy];
  let rem = h;
  while (rem > 1e-15) {
    const r = Math.hypot(y[0], y[1]);
    const hh = Math.min(rem, 2e-3 * Math.sqrt(r ** 3 / GM));
    y = rk4(y, hh, deriv(GM));
    rem -= hh;
  }
  return { x: y[0], y: y[1], vx: y[2], vy: y[3] };
}

export function orbitEnergy(p: OrbitParams, s: OrbitState) {
  const K = 0.5 * (s.vx ** 2 + s.vy ** 2);
  const U = -mu(p) / Math.hypot(s.x, s.y);
  return { K, U, E: K + U };
}

/** Área varrida entre amostras consecutivas (soma de triângulos com vértice na estrela). */
export function sweptArea(pts: ReadonlyArray<Record<string, number>>) {
  let A = 0;
  for (let i = 1; i < pts.length; i++) A += 0.5 * Math.abs(pts[i - 1].x * pts[i].y - pts[i].x * pts[i - 1].y);
  return A;
}
