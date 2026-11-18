export const DEG = Math.PI / 180;

export interface InclineParams {
  m: number; // kg
  thetaDeg: number; // °
  muS: number;
  muK: number;
  F: number; // N, paralela ao plano, positiva para cima da rampa
  g: number; // m/s²
}

export type Regime = 'repouso' | 'subindo' | 'descendo';

export interface ForceState {
  P: number; // peso (N)
  Pt: number; // componente do peso ao longo do plano (N, negativa = para baixo)
  N: number; // normal (N)
  fric: number; // atrito ao longo do plano (N, com sinal)
  a: number; // aceleração ao longo do plano (m/s²)
  regime: Regime;
  maxStatic: number; // μs·N
}

const EPS = 1e-9;

/** Forças e aceleração no plano inclinado. Eixo s ao longo da rampa, positivo para cima. */
export function forces(p: InclineParams, v: number): ForceState {
  const th = p.thetaDeg * DEG;
  const P = p.m * p.g;
  const Pt = -P * Math.sin(th);
  const N = P * Math.cos(th);
  const maxStatic = p.muS * N;
  if (Math.abs(v) < EPS) {
    const Fn = p.F + Pt;
    if (Math.abs(Fn) <= maxStatic + 1e-12) return { P, Pt, N, fric: -Fn, a: 0, regime: 'repouso', maxStatic };
    const fric = -Math.sign(Fn) * p.muK * N;
    return { P, Pt, N, fric, a: (Fn + fric) / p.m, regime: Fn > 0 ? 'subindo' : 'descendo', maxStatic };
  }
  const fric = -Math.sign(v) * p.muK * N;
  return { P, Pt, N, fric, a: (p.F + Pt + fric) / p.m, regime: v > 0 ? 'subindo' : 'descendo', maxStatic };
}

/** Avança (s, v) em h segundos. Aceleração é constante por trechos, então a integração é exata; trata a parada (v → 0). */
export function stepIncline(p: InclineParams, s: number, v: number, h: number): { s: number; v: number } {
  let rem = h;
  for (let guard = 0; guard < 4 && rem > 0; guard++) {
    const { a } = forces(p, v);
    const vNew = v + a * rem;
    if (Math.abs(v) > EPS && Math.sign(vNew) !== Math.sign(v) && a !== 0) {
      // para no meio do passo: atrito cinético troca de sentido / vira estático
      const tc = -v / a;
      s += v * tc + 0.5 * a * tc * tc;
      v = 0;
      rem -= tc;
      continue;
    }
    s += v * rem + 0.5 * a * rem * rem;
    v = Math.abs(vNew) < EPS ? 0 : vNew;
    rem = 0;
  }
  return { s, v };
}
