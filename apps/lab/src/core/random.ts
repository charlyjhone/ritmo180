/** Gerador pseudoaleatório determinístico (mulberry32): mesma semente, mesmo experimento. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rand = () => number;

/** Quantos limites inteiros o intervalo (t, t+h] atravessa: usado por simulações em passos discretos. */
export const crossings = (t: number, h: number) => Math.floor(t + h + 1e-9) - Math.floor(t + 1e-9);

/** Coeficiente binomial C(n, k) em ponto flutuante. */
export function binom(n: number, k: number) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}
