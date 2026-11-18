import { rk4 } from '../../core/stepper';

export type TrackId = 'U' | 'W' | 'rampa';

export interface Track {
  id: TrackId;
  name: string;
  x0: number;
  x1: number;
  f: (x: number) => number;
  df: (x: number) => number;
  d2f: (x: number) => number;
}

export const TRACKS: Record<TrackId, Track> = {
  U: { id: 'U', name: 'Meio-tubo (U)', x0: -6, x1: 6, f: (x) => 0.25 * x * x, df: (x) => 0.5 * x, d2f: () => 0.5 },
  W: {
    id: 'W',
    name: 'Dois vales (W)',
    x0: -5,
    x1: 5,
    f: (x) => (x * x - 9) ** 2 / 30,
    df: (x) => (4 * x * (x * x - 9)) / 30,
    d2f: (x) => (12 * x * x - 36) / 30,
  },
  rampa: {
    id: 'rampa',
    name: 'Rampa com vale',
    x0: -6,
    x1: 6,
    f: (x) => 6 / (1 + Math.exp(1.5 * x)) + 0.12 * x * x,
    df: (x) => {
      const e = Math.exp(1.5 * x);
      return (-9 * e) / (1 + e) ** 2 + 0.24 * x;
    },
    d2f: (x) => {
      const e = Math.exp(1.5 * x);
      return (-13.5 * e * (1 - e)) / (1 + e) ** 3 + 0.24;
    },
  },
};

export interface EnergyParams {
  track: Track;
  g: number;
  m: number;
  /** Coeficiente de atrito viscoso tangencial (1/s) */
  c: number;
}

/** Equação do movimento ao longo de y = f(x): ẍ = −(g f' + f' f'' ẋ²)/(1 + f'²) − c ẋ */
export function deriv(p: EnergyParams) {
  return ([x, vx]: number[]) => {
    const d = p.track.df(x);
    const d2 = p.track.d2f(x);
    return [vx, -(p.g * d + d * d2 * vx * vx) / (1 + d * d) - p.c * vx];
  };
}

export function stepTrack(p: EnergyParams, x: number, vx: number, h: number) {
  const [nx, nvx] = rk4([x, vx], h, deriv(p));
  return { x: nx, vx: nvx };
}

export function energies(p: EnergyParams, x: number, vx: number) {
  const d = p.track.df(x);
  const speed = Math.abs(vx) * Math.sqrt(1 + d * d);
  const K = 0.5 * p.m * speed * speed;
  const U = p.m * p.g * p.track.f(x);
  return { K, U, E: K + U, speed, h: p.track.f(x) };
}
