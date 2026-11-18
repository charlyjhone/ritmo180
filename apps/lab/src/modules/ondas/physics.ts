/**
 * Corda vibrante: u_tt + 2γ·u_t = v²·u_xx, com v = √(T/μ).
 * Diferenças finitas com número de Courant 1 (v·Δt = Δx): sem amortecimento o esquema é EXATO
 * (reproduz a solução de d'Alembert nos pontos da malha).
 */

export const STRING_L = 8; // m
export const CELLS = 400;
export const DX = STRING_L / CELLS;

export type EndType = 'fixa' | 'livre' | 'sem-fim';
export type Source = 'oscilador' | 'pulso';

export interface WaveParams {
  T: number; // tração (N)
  mu: number; // densidade linear (kg/m)
  gamma: number; // amortecimento (1/s)
  A: number; // amplitude da fonte (m)
  f: number; // frequência do oscilador (Hz)
  source: Source;
  end: EndType;
}

export const waveSpeed = (p: { T: number; mu: number }) => Math.sqrt(p.T / p.mu);
export const fdDt = (p: { T: number; mu: number }) => DX / waveSpeed(p);
export const pulseSigma = (p: { T: number; mu: number }) => 0.15 / waveSpeed(p); // largura temporal (largura espacial 15 cm)
export const pulseT0 = (p: { T: number; mu: number }) => 3 * pulseSigma(p);

/** Frequências de ressonância da corda presa nas duas pontas: f_n = n·v/(2L). */
export const harmonic = (p: { T: number; mu: number }, n: number) => (n * waveSpeed(p)) / (2 * STRING_L);

export function sourceDisp(p: WaveParams, t: number) {
  if (p.source === 'oscilador') return p.A * Math.sin(2 * Math.PI * p.f * t);
  const s = pulseSigma(p);
  return p.A * Math.exp(-(((t - pulseT0(p)) / s) ** 2));
}

export interface WaveState {
  u: Float64Array;
  uOld: Float64Array;
  t: number; // tempo da malha (múltiplo de Δt)
  acc: number; // tempo de simulação ainda não integrado
  probe: number; // índice da sonda
  crossings: number[]; // instantes de cruzamento ascendente na sonda
  peak: { t: number; u: number } | null; // pico do pulso na sonda
  probeHist: [number, number, number]; // últimos 3 valores na sonda (para o pico)
}

export function createWave(probeX: number): WaveState {
  return {
    u: new Float64Array(CELLS + 1),
    uOld: new Float64Array(CELLS + 1),
    t: 0,
    acc: 0,
    probe: Math.round(probeX / DX),
    crossings: [],
    peak: null,
    probeHist: [0, 0, 0],
  };
}

/** Um passo da malha (Δt = Δx/v). Modifica o estado. */
export function fdStep(p: WaveParams, s: WaveState) {
  const dt = fdDt(p);
  const g = p.gamma * dt;
  const { u, uOld } = s;
  const next = new Float64Array(CELLS + 1);
  for (let i = 1; i < CELLS; i++) next[i] = (u[i + 1] + u[i - 1] - (1 - g) * uOld[i]) / (1 + g);
  const tn = s.t + dt;
  next[0] = sourceDisp(p, tn);
  if (p.end === 'fixa') next[CELLS] = 0;
  else if (p.end === 'livre') next[CELLS] = (2 * u[CELLS - 1] - (1 - g) * uOld[CELLS]) / (1 + g);
  else next[CELLS] = u[CELLS - 1]; // absorvente: exato para Courant 1
  // sonda: cruzamento ascendente e pico
  const a = u[s.probe];
  const b = next[s.probe];
  if (a < 0 && b >= 0) s.crossings.push(s.t + (-a / (b - a)) * dt);
  const [h0, h1] = [s.probeHist[1], s.probeHist[2]];
  s.probeHist = [h0, h1, b];
  if (p.source === 'pulso' && !s.peak && h1 > h0 && h1 >= b && h1 > 0.5 * p.A) {
    // pico entre os passos (interpolação parabólica)
    const den = h0 - 2 * h1 + b;
    const d = den === 0 ? 0 : (0.5 * (h0 - b)) / den;
    s.peak = { t: s.t + d * dt, u: h1 - 0.25 * (h0 - b) * d };
  }
  s.uOld = u;
  s.u = next;
  s.t = tn;
}

/** Avança `h` segundos acumulando o resto (a malha só anda em passos inteiros de Δt). */
export function advanceWave(p: WaveParams, s: WaveState, h: number) {
  const dt = fdDt(p);
  s.acc += h;
  while (s.acc >= dt - 1e-12) {
    fdStep(p, s);
    s.acc -= dt;
  }
  return s;
}

/** Comprimento de onda medido: média do espaçamento entre cruzamentos ascendentes no espaço. */
export function measuredWavelength(u: Float64Array, xMin: number, xMax: number) {
  const xs: number[] = [];
  for (let i = Math.max(1, Math.ceil(xMin / DX)); i <= Math.min(CELLS, Math.floor(xMax / DX)); i++) {
    const a = u[i - 1];
    const b = u[i];
    // fase espacial: onda viaja para +x, então o perfil "sobe" para trás; usamos cruzamentos descendentes em x
    if (a > 0 && b <= 0) xs.push((i - 1 + a / (a - b)) * DX);
  }
  if (xs.length < 2) return null;
  return (xs[xs.length - 1] - xs[0]) / (xs.length - 1);
}

/** Período medido na sonda a partir dos cruzamentos ascendentes. */
export function measuredProbePeriod(crossings: number[], skip = 1) {
  const c = crossings.slice(skip);
  if (c.length < 2) return null;
  return (c[c.length - 1] - c[0]) / (c.length - 1);
}
