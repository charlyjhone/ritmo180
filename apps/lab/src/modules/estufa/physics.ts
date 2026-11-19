export const SIGMA = 5.670374419e-8; // W/(m²·K⁴)
export const YEAR = 3.15576e7; // s
export const CS = 4.2e8; // J/(m²·K) — camada de mistura do oceano (~100 m)
export const CA = 1.0e7; // J/(m²·K) — coluna atmosférica
export const C_PRE = 280; // ppm
export const EPS_PRE = 0.778; // emissividade que dá Ts ≈ 288 K com α = 0,30

/** Emissividade da camada: forçamento 5,35·ln(C/280) W/m² convertido em Δε no topo (dOLR/dε = −σTs⁴/2, Ts = 288 K). */
export function emissivity(ppm: number) {
  const dF = 5.35 * Math.log(ppm / C_PRE);
  return Math.min(0.999, Math.max(0, EPS_PRE + dF / ((SIGMA * 288 ** 4) / 2)));
}

export const absorbed = (S: number, albedo: number) => (S * (1 - albedo)) / 4;
export const effectiveT = (S: number, albedo: number) => (absorbed(S, albedo) / SIGMA) ** 0.25;

/** Equilíbrio do modelo de uma camada. */
export function equilibrium(S: number, albedo: number, eps: number) {
  const Ts = effectiveT(S, albedo) * (2 / (2 - eps)) ** 0.25;
  return { Ts, Ta: Ts / 2 ** 0.25 };
}

export interface Climate {
  S: number;
  albedo: number;
  eps: number;
}

export function fluxes(c: Climate, Ts: number, Ta: number) {
  const up = SIGMA * Ts ** 4; // emissão da superfície
  const atm = c.eps * SIGMA * Ta ** 4; // emissão da atmosfera (para cima e para baixo)
  return {
    solarIn: c.S / 4,
    reflected: (c.albedo * c.S) / 4,
    absorbed: absorbed(c.S, c.albedo),
    surface: up,
    transmitted: (1 - c.eps) * up,
    atm,
    olr: (1 - c.eps) * up + atm,
  };
}

/** Derivadas em K/ano. */
export function derivs(c: Climate, Ts: number, Ta: number): [number, number] {
  const f = fluxes(c, Ts, Ta);
  const dTs = (f.absorbed + f.atm - f.surface) / CS;
  const dTa = (c.eps * f.surface - 2 * f.atm) / CA;
  return [dTs * YEAR, dTa * YEAR];
}
