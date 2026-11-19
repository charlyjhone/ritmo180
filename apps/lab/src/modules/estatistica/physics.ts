import { binom, type Rand } from '../../core/random';

export const pmf = (n: number, p: number, k: number) => binom(n, k) * p ** k * (1 - p) ** (n - k);

export function binomialMoments(n: number, p: number) {
  let m = 0;
  let m2 = 0;
  for (let k = 0; k <= n; k++) {
    const w = pmf(n, p, k);
    m += k * w;
    m2 += k * k * w;
  }
  return { mean: m, variance: m2 - m * m };
}

/** Medidas de um histograma de contagens por valor k = 0..n. */
export function summary(counts: number[]) {
  const N = counts.reduce((a, b) => a + b, 0);
  if (N === 0) return null;
  let s = 0;
  let s2 = 0;
  let mode = 0;
  counts.forEach((c, k) => {
    s += c * k;
    s2 += c * k * k;
    if (c > counts[mode]) mode = k;
  });
  const mean = s / N;
  const variance = N > 1 ? (s2 - N * mean * mean) / (N - 1) : 0;
  // mediana: média dos elementos centrais da lista ordenada
  const at = (idx: number) => {
    let acc = 0;
    for (let k = 0; k < counts.length; k++) {
      acc += counts[k];
      if (acc > idx) return k;
    }
    return counts.length - 1;
  };
  const median = N % 2 ? at((N - 1) / 2) : (at(N / 2 - 1) + at(N / 2)) / 2;
  return { N, mean, variance, sd: Math.sqrt(variance), mode, median };
}

/** Erro padrão da variância amostral (usa o 4º momento central da binomial). */
export function varianceSE(n: number, p: number, N: number) {
  const q = 1 - p;
  const s2 = n * p * q;
  const mu4 = n * p * q * (1 + 3 * (n - 2) * p * q);
  return Math.sqrt(Math.max(0, (mu4 - (s2 * s2 * (N - 3)) / (N - 1)) / N));
}

export interface Ball {
  path: Uint8Array; // 1 = desviou para a direita
  born: number;
  k: number;
}

export function newBall(n: number, p: number, born: number, rand: Rand): Ball {
  const path = new Uint8Array(n);
  let k = 0;
  for (let i = 0; i < n; i++) {
    path[i] = rand() < p ? 1 : 0;
    k += path[i];
  }
  return { path, born, k };
}

export const normalPdf = (x: number, mu: number, s2: number) => Math.exp(-((x - mu) ** 2) / (2 * s2)) / Math.sqrt(2 * Math.PI * s2);
