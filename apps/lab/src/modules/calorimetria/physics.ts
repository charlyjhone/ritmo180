import { rk4 } from '../../core/stepper';

export const C_WATER = 4186; // J/(kg·K)
export const C_ICE = 2100;
export const L_FUSION = 334_000; // J/kg

export interface Material {
  id: string;
  name: string;
  c: number; // calor específico (J/kg·K); para água/gelo é o da fase líquida
  water?: boolean; // segue a curva água/gelo (com fusão a 0 °C)
  color: string;
}

export const MATERIALS: Material[] = [
  { id: 'agua', name: 'Água', c: C_WATER, water: true, color: '#38BDF8' },
  { id: 'gelo', name: 'Gelo', c: C_ICE, water: true, color: '#E0F2FE' },
  { id: 'aluminio', name: 'Alumínio', c: 900, color: '#CBD5E1' },
  { id: 'ferro', name: 'Ferro', c: 450, color: '#94A3B8' },
  { id: 'cobre', name: 'Cobre', c: 385, color: '#F59E0B' },
  { id: 'chumbo', name: 'Chumbo', c: 128, color: '#64748B' },
];

export interface Body {
  mat: Material;
  m: number; // kg
}

/** Entalpia (J) com referência no sólido a 0 °C. Para água: gelo abaixo de 0, platô de fusão, líquido acima. */
export function enthalpy(b: Body, T: number, liquidAtZero = true) {
  if (!b.mat.water) return b.m * b.mat.c * T;
  if (T < 0) return b.m * C_ICE * T;
  if (T === 0 && !liquidAtZero) return 0;
  return b.m * L_FUSION + b.m * C_WATER * T;
}

export function temperature(b: Body, H: number) {
  if (!b.mat.water) return H / (b.m * b.mat.c);
  if (H < 0) return H / (b.m * C_ICE);
  if (H <= b.m * L_FUSION) return 0;
  return (H - b.m * L_FUSION) / (b.m * C_WATER);
}

/** Fração líquida (só para água/gelo). */
export function liquidFraction(b: Body, H: number) {
  if (!b.mat.water) return 1;
  return Math.min(1, Math.max(0, H / (b.m * L_FUSION)));
}

/** Entalpia inicial: o gelo começa sólido (mesmo a 0 °C); a água começa líquida. */
export const initialEnthalpy = (b: Body, T0: number) => enthalpy(b, T0, b.mat.id !== 'gelo');

/** Troca de calor por condução: dH_A/dt = G·(T_B − T_A), dH_B/dt = −dH_A/dt. */
export function stepHeat(a: Body, b: Body, G: number, HA: number, HB: number, h: number) {
  const [na, nb] = rk4([HA, HB], h, ([x, y]) => {
    const P = G * (temperature(b, y) - temperature(a, x));
    return [P, -P];
  });
  return { HA: na, HB: nb };
}

/**
 * Equação calorimétrica (Σ Q = 0) resolvida pela conservação da entalpia total:
 * procura T com H_A(T) + H_B(T) = H_total, tratando o platô de fusão a 0 °C.
 */
export function equilibrium(a: Body, b: Body, Htot: number) {
  const below = enthalpy(a, 0, false) + enthalpy(b, 0, false); // tudo sólido a 0 °C
  const above = enthalpy(a, 0, true) + enthalpy(b, 0, true); // tudo líquido a 0 °C
  if (Htot >= below && Htot <= above && above > below) {
    // fica a 0 °C com fusão parcial: a água/gelo absorve o excedente como calor latente
    return { T: 0, partial: true };
  }
  const f = (T: number) => enthalpy(a, T) + enthalpy(b, T) - Htot;
  let lo = -100;
  let hi = 200;
  if (Htot > above) lo = 0;
  else hi = 0;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) hi = mid;
    else lo = mid;
  }
  return { T: (lo + hi) / 2, partial: false };
}

/** Constante de tempo aproximada da troca (sem calor latente). */
export function timeConstant(a: Body, b: Body, G: number) {
  const ca = a.m * (a.mat.water ? C_WATER : a.mat.c);
  const cb = b.m * (b.mat.water ? C_WATER : b.mat.c);
  return 1 / (G * (1 / ca + 1 / cb));
}
