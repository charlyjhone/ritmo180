export interface Cart {
  m: number;
  v: number;
  x: number;
}

export const cartWidth = (m: number) => 0.35 * Math.cbrt(m);

/** Velocidades após colisão 1D com coeficiente de restituição e. */
export function collide(m1: number, v1: number, m2: number, v2: number, e: number) {
  const P = m1 * v1 + m2 * v2;
  const M = m1 + m2;
  return {
    v1: (P - m2 * e * (v1 - v2)) / M,
    v2: (P + m1 * e * (v1 - v2)) / M,
  };
}

/** Energia cinética dissipada: ΔE = ½·μ·(1 − e²)·(v1 − v2)², μ = m1m2/(m1+m2). */
export function energyLoss(m1: number, v1: number, m2: number, v2: number, e: number) {
  const mu = (m1 * m2) / (m1 + m2);
  return 0.5 * mu * (1 - e * e) * (v1 - v2) ** 2;
}

export interface CollisionState {
  a: Cart;
  b: Cart;
  collided: boolean;
  tCollision: number | null;
}

/** Avança h segundos, aplicando a colisão no instante exato do contato. */
export function stepCarts(s: CollisionState, h: number, e: number, t: number): CollisionState {
  const { a, b } = s;
  const gap = b.x - a.x - (cartWidth(a.m) + cartWidth(b.m)) / 2;
  const closing = a.v - b.v;
  if (!s.collided && closing > 0 && gap <= closing * h + 1e-12) {
    const tc = Math.max(0, gap / closing);
    const ax = a.x + a.v * tc;
    const bx = b.x + b.v * tc;
    const r = collide(a.m, a.v, b.m, b.v, e);
    const rem = h - tc;
    return {
      a: { ...a, x: ax + r.v1 * rem, v: r.v1 },
      b: { ...b, x: bx + r.v2 * rem, v: r.v2 },
      collided: true,
      tCollision: t + tc,
    };
  }
  return { ...s, a: { ...a, x: a.x + a.v * h }, b: { ...b, x: b.x + b.v * h } };
}
