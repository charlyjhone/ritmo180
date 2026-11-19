export type Kind = 'afim' | 'quadratica' | 'exponencial';

export interface Coefs {
  a: number;
  b: number;
  c: number;
}

export function evaluate(k: Kind, p: Coefs, x: number) {
  if (k === 'afim') return p.a * x + p.b;
  if (k === 'quadratica') return p.a * x * x + p.b * x + p.c;
  return p.c * p.a ** x; // exponencial: f(x) = c·aˣ
}

export function derivative(k: Kind, p: Coefs, x: number) {
  if (k === 'afim') return p.a;
  if (k === 'quadratica') return 2 * p.a * x + p.b;
  return p.c * p.a ** x * Math.log(p.a);
}

/** Bhaskara: Δ = b² − 4ac, x = (−b ± √Δ)/2a. */
export function bhaskara(p: Coefs) {
  const delta = p.b * p.b - 4 * p.a * p.c;
  if (delta < 0) return { delta, roots: [] as number[] };
  const r = Math.sqrt(delta);
  const x1 = (-p.b - r) / (2 * p.a);
  const x2 = (-p.b + r) / (2 * p.a);
  return { delta, roots: delta === 0 ? [x1] : [Math.min(x1, x2), Math.max(x1, x2)] };
}

export const vertex = (p: Coefs) => {
  const xv = -p.b / (2 * p.a);
  return { xv, yv: -(p.b * p.b - 4 * p.a * p.c) / (4 * p.a) };
};

export function bisect(f: (x: number) => number, lo: number, hi: number) {
  let flo = f(lo);
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (fm === 0) return mid;
    if (Math.sign(fm) === Math.sign(flo)) {
      lo = mid;
      flo = fm;
    } else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Raízes numéricas: varredura de troca de sinal + bissecção (independente da fórmula). */
export function numericRoots(f: (x: number) => number, x0: number, x1: number, n = 4000) {
  const out: number[] = [];
  let xa = x0;
  let fa = f(xa);
  for (let i = 1; i <= n; i++) {
    const xb = x0 + ((x1 - x0) * i) / n;
    const fb = f(xb);
    if (fa === 0) out.push(xa);
    else if (fa * fb < 0) out.push(bisect(f, xa, xb));
    xa = xb;
    fa = fb;
  }
  return out;
}

/** Seção áurea para o extremo de uma função unimodal em [lo, hi]. */
export function golden(f: (x: number) => number, lo: number, hi: number, maximize = false) {
  const g = (Math.sqrt(5) - 1) / 2;
  const h = (x: number) => (maximize ? -f(x) : f(x));
  let a = lo;
  let b = hi;
  let c = b - g * (b - a);
  let d = a + g * (b - a);
  for (let i = 0; i < 200; i++) {
    if (h(c) < h(d)) b = d;
    else a = c;
    c = b - g * (b - a);
    d = a + g * (b - a);
  }
  return (a + b) / 2;
}
