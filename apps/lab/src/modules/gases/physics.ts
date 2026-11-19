/**
 * Gás ideal em uma caixa nanométrica (partículas não interagentes, choques elásticos com as paredes).
 * Unidades internas: posição em nm, tempo em ps, velocidade em nm/ps (= 1000 m/s).
 */
export const KB = 1.380649e-23; // J/K
export const AMU = 1.66053907e-27; // kg
export const NA = 6.02214076e23;
export const R_GAS = 8.314462618;
export const ATM = 101325; // Pa
export const LY = 8; // nm
export const LZ = 8; // nm (profundidade, não desenhada)

export interface Gas {
  id: string;
  name: string;
  M: number; // massa molar (g/mol) = massa da partícula em u
  color: string;
}

export const GASES: Gas[] = [
  { id: 'He', name: 'Hélio (He)', M: 4.0026, color: '#F472B6' },
  { id: 'N2', name: 'Nitrogênio (N₂)', M: 28.014, color: '#38BDF8' },
  { id: 'O2', name: 'Oxigênio (O₂)', M: 31.998, color: '#FB7185' },
  { id: 'CO2', name: 'Gás carbônico (CO₂)', M: 44.009, color: '#A78BFA' },
];

export interface GasState {
  n: number;
  x: Float64Array;
  y: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  vz: Float64Array;
  Lx: number;
  Jx: number; // impulso acumulado nas paredes x (kg·m/s)
  Jy: number;
  tMeas: number; // ps desde o início da medição
}

/** Gerador pseudoaleatório determinístico (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Velocidade quadrática média de uma componente: <vx²> = kT/m, em (nm/ps)². */
export const componentVar = (T: number, M: number) => (KB * T) / (M * AMU) / 1e6;

/** Cria N partículas com velocidades de Maxwell, ajustadas para que cada componente tenha exatamente <v²> = kT/m e média nula. */
export function createGas(n: number, T: number, M: number, Lx: number, seed = 7): GasState {
  const r = rng(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const s: GasState = {
    n,
    x: new Float64Array(n),
    y: new Float64Array(n),
    vx: new Float64Array(n),
    vy: new Float64Array(n),
    vz: new Float64Array(n),
    Lx,
    Jx: 0,
    Jy: 0,
    tMeas: 0,
  };
  for (let i = 0; i < n; i++) {
    s.x[i] = r() * Lx;
    s.y[i] = r() * LY;
    s.vx[i] = gauss();
    s.vy[i] = gauss();
    s.vz[i] = gauss();
  }
  const target = componentVar(T, M);
  for (const v of [s.vx, s.vy, s.vz]) {
    let mean = 0;
    for (let i = 0; i < n; i++) mean += v[i];
    mean /= n;
    let sq = 0;
    for (let i = 0; i < n; i++) {
      v[i] -= mean;
      sq += v[i] * v[i];
    }
    const k = Math.sqrt(target / (sq / n));
    for (let i = 0; i < n; i++) v[i] *= k;
  }
  return s;
}

/** Temperatura cinética: (3/2)kT = <½mv²>. */
export function kineticTemperature(s: GasState, M: number) {
  let sum = 0;
  for (let i = 0; i < s.n; i++) sum += s.vx[i] ** 2 + s.vy[i] ** 2 + s.vz[i] ** 2;
  return ((M * AMU * (sum / s.n) * 1e6) / (3 * KB));
}

/** Avança h ps, refletindo nas paredes e somando o impulso transferido. */
export function stepGas(s: GasState, h: number, M: number) {
  const m = M * AMU;
  for (let i = 0; i < s.n; i++) {
    let x = s.x[i] + s.vx[i] * h;
    let y = s.y[i] + s.vy[i] * h;
    // pode haver mais de uma reflexão se h for grande; o laço cobre isso
    while (x < 0 || x > s.Lx) {
      if (x < 0) x = -x;
      else x = 2 * s.Lx - x;
      s.vx[i] = -s.vx[i];
      s.Jx += 2 * m * Math.abs(s.vx[i]) * 1000;
    }
    while (y < 0 || y > LY) {
      if (y < 0) y = -y;
      else y = 2 * LY - y;
      s.vy[i] = -s.vy[i];
      s.Jy += 2 * m * Math.abs(s.vy[i]) * 1000;
    }
    s.x[i] = x;
    s.y[i] = y;
  }
  s.tMeas += h;
  return s;
}

/** Pressão medida (Pa): impulso por área por tempo, média das paredes x e y. */
export function measuredPressure(s: GasState) {
  if (s.tMeas <= 0) return null;
  const t = s.tMeas * 1e-12;
  const Ax = LY * LZ * 1e-18; // m²
  const Ay = s.Lx * LZ * 1e-18;
  const Px = s.Jx / (2 * Ax * t);
  const Py = s.Jy / (2 * Ay * t);
  return (Px + Py) / 2;
}

export const volume = (Lx: number) => Lx * LY * LZ * 1e-27; // m³
export const idealPressure = (n: number, T: number, Lx: number) => (n * KB * T) / volume(Lx);

/** Muda a temperatura reescalando as velocidades (termostato). */
export function setTemperature(s: GasState, Tnew: number, M: number) {
  const k = Math.sqrt(Tnew / kineticTemperature(s, M));
  for (let i = 0; i < s.n; i++) {
    s.vx[i] *= k;
    s.vy[i] *= k;
    s.vz[i] *= k;
  }
  resetMeasurement(s);
}

/** Move a parede direita; partículas que ficarem fora são refletidas para dentro. */
export function setWidth(s: GasState, Lx: number) {
  s.Lx = Lx;
  for (let i = 0; i < s.n; i++) {
    if (s.x[i] > Lx) {
      s.x[i] = Math.max(0, 2 * Lx - s.x[i]);
      s.vx[i] = -Math.abs(s.vx[i]);
    }
  }
  resetMeasurement(s);
}

export function resetMeasurement(s: GasState) {
  s.Jx = 0;
  s.Jy = 0;
  s.tMeas = 0;
}

/** Densidade de Maxwell–Boltzmann da rapidez (3D), v em nm/ps. */
export function maxwellPdf(v: number, T: number, M: number) {
  const a = componentVar(T, M);
  return Math.sqrt(2 / Math.PI) * (v * v / a ** 1.5) * Math.exp(-(v * v) / (2 * a));
}
