export function muvState(p: { x0: number; v0: number; a: number }, t: number) {
  return { x: p.x0 + p.v0 * t + 0.5 * p.a * t * t, v: p.v0 + p.a * t };
}

/** Torricelli: v² = v0² + 2aΔx */
export function torricelliV2(v0: number, a: number, dx: number) {
  return v0 * v0 + 2 * a * dx;
}
