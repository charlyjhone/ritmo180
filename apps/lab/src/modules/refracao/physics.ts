export const C_LIGHT = 299_792_458; // m/s

/** Lei de Snell: devolve θ2 (rad) ou null quando há reflexão total. */
export function snell(n1: number, n2: number, theta1: number): number | null {
  const s = (n1 / n2) * Math.sin(theta1);
  return Math.abs(s) > 1 ? null : Math.asin(s);
}

export const criticalAngle = (n1: number, n2: number) => (n1 > n2 ? Math.asin(n2 / n1) : null);

/** Coeficientes de Fresnel (amplitude) para polarizações s e p. */
export function fresnel(n1: number, n2: number, theta1: number) {
  const t2 = snell(n1, n2, theta1);
  if (t2 === null) return { R: 1, T: 0, Rs: 1, Rp: 1, Ts: 0, Tp: 0 };
  const c1 = Math.cos(theta1);
  const c2 = Math.cos(t2);
  const rs = (n1 * c1 - n2 * c2) / (n1 * c1 + n2 * c2);
  const rp = (n2 * c1 - n1 * c2) / (n2 * c1 + n1 * c2);
  const ts = (2 * n1 * c1) / (n1 * c1 + n2 * c2);
  const tp = (2 * n1 * c1) / (n2 * c1 + n1 * c2);
  const geo = (n2 * c2) / (n1 * c1); // razão de fluxo de energia através da interface
  const Rs = rs * rs;
  const Rp = rp * rp;
  const Ts = geo * ts * ts;
  const Tp = geo * tp * tp;
  return { Rs, Rp, Ts, Tp, R: (Rs + Rp) / 2, T: (Ts + Tp) / 2 };
}

/** Ângulo de Brewster (luz refletida totalmente polarizada). */
export const brewster = (n1: number, n2: number) => Math.atan(n2 / n1);

/**
 * Princípio de Fermat: a luz vai de A (meio 1, y > 0) até B (meio 2, y < 0) pelo caminho de menor tempo.
 * Minimiza n1·|AX| + n2·|XB| sobre o ponto X = (x, 0) da interface por busca da razão áurea.
 */
export function fermatCrossing(n1: number, n2: number, A: [number, number], B: [number, number]) {
  const t = (x: number) => n1 * Math.hypot(x - A[0], A[1]) + n2 * Math.hypot(B[0] - x, B[1]);
  let lo = Math.min(A[0], B[0]) - 1;
  let hi = Math.max(A[0], B[0]) + 1;
  const g = (Math.sqrt(5) - 1) / 2;
  let x1 = hi - g * (hi - lo);
  let x2 = lo + g * (hi - lo);
  let f1 = t(x1);
  let f2 = t(x2);
  for (let i = 0; i < 200 && hi - lo > 1e-14; i++) {
    if (f1 < f2) {
      hi = x2;
      x2 = x1;
      f2 = f1;
      x1 = hi - g * (hi - lo);
      f1 = t(x1);
    } else {
      lo = x1;
      x1 = x2;
      f1 = f2;
      x2 = lo + g * (hi - lo);
      f2 = t(x2);
    }
  }
  const x = (lo + hi) / 2;
  const theta1 = Math.atan2(Math.abs(x - A[0]), Math.abs(A[1]));
  const theta2 = Math.atan2(Math.abs(B[0] - x), Math.abs(B[1]));
  return { x, theta1, theta2, time: t(x) };
}

/** Cor aproximada (sRGB) de um comprimento de onda visível. */
export function wavelengthColor(nm: number, alpha = 1) {
  let r = 0;
  let g = 0;
  let b = 0;
  if (nm < 440) [r, g, b] = [-(nm - 440) / 60, 0, 1];
  else if (nm < 490) [r, g, b] = [0, (nm - 440) / 50, 1];
  else if (nm < 510) [r, g, b] = [0, 1, -(nm - 510) / 20];
  else if (nm < 580) [r, g, b] = [(nm - 510) / 70, 1, 0];
  else if (nm < 645) [r, g, b] = [1, -(nm - 645) / 65, 0];
  else [r, g, b] = [1, 0, 0];
  const f = nm < 420 ? 0.3 + (0.7 * (nm - 380)) / 40 : nm > 700 ? 0.3 + (0.7 * (780 - nm)) / 80 : 1;
  const c = (x: number) => Math.round(255 * Math.max(0, Math.min(1, x * f)) ** 0.8);
  return `rgba(${c(r)},${c(g)},${c(b)},${alpha})`;
}
