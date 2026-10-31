// Teoria de Resposta ao Item: modelo logístico de 3 parâmetros, o mesmo tipo usado pelo Inep.
import type { Area } from "./types.ts";

/** Constante de escala do modelo. Os parâmetros dos microdados do Inep são usados com D = 1. */
export const IRT_D = 1;

export interface IrtParams {
  a: number;
  b: number;
  c: number;
}

export interface ScoredResponse {
  params: IrtParams;
  correct: boolean;
}

export interface ThetaEstimate {
  theta: number;
  se: number;
  n: number;
}

export interface ScoreScale {
  mean: number;
  sd: number;
  /** true enquanto a conversão não foi validada contra dados reais da área. */
  provisional: boolean;
}

/**
 * Conversão de theta para a escala do ENEM. CN e MT vêm do Banco ENEM (ajuste com itens do Inep).
 * LC e CH ainda não têm ajuste próprio: usam a referência 500/100 e são marcadas como provisórias.
 */
export const SCALES: Record<Area, ScoreScale> = {
  CN: { mean: 501, sd: 113.1, provisional: false },
  MT: { mean: 500, sd: 129.6, provisional: false },
  LC: { mean: 500, sd: 100, provisional: true },
  CH: { mean: 500, sd: 100, provisional: true },
};

/** Abaixo disso a estimativa é instável demais para ser mostrada como nota. */
export const MIN_ITEMS_FOR_SCORE = 10;

const GRID_MIN = -4;
const GRID_MAX = 4;
const GRID_STEP = 0.05;

export function probability(theta: number, { a, b, c }: IrtParams): number {
  return c + (1 - c) / (1 + Math.exp(-IRT_D * a * (theta - b)));
}

/** Informação de Fisher do item em theta. */
export function information(theta: number, params: IrtParams): number {
  const p = probability(theta, params);
  const q = 1 - p;
  const { a, c } = params;
  if (p <= c || q <= 0) return 0;
  return (IRT_D * a) ** 2 * (q / p) * ((p - c) / (1 - c)) ** 2;
}

function logLikelihood(theta: number, responses: readonly ScoredResponse[]): number {
  let sum = 0;
  for (const r of responses) {
    const p = Math.min(1 - 1e-9, Math.max(1e-9, probability(theta, r.params)));
    sum += Math.log(r.correct ? p : 1 - p);
  }
  return sum;
}

/** Esperança a posteriori com priori normal, como na estimação oficial da nota. */
export function estimateTheta(responses: readonly ScoredResponse[], prior = { mean: 0, sd: 1 }): ThetaEstimate {
  const steps = Math.round((GRID_MAX - GRID_MIN) / GRID_STEP);
  const logs: number[] = new Array(steps + 1);
  let peak = -Infinity;
  for (let i = 0; i <= steps; i++) {
    const theta = GRID_MIN + i * GRID_STEP;
    const z = (theta - prior.mean) / prior.sd;
    const value = logLikelihood(theta, responses) - 0.5 * z * z;
    logs[i] = value;
    if (value > peak) peak = value;
  }
  let weight = 0;
  let mean = 0;
  for (let i = 0; i <= steps; i++) {
    const w = Math.exp(logs[i]! - peak);
    weight += w;
    mean += w * (GRID_MIN + i * GRID_STEP);
  }
  mean /= weight;
  let variance = 0;
  for (let i = 0; i <= steps; i++) {
    const w = Math.exp(logs[i]! - peak);
    variance += w * (GRID_MIN + i * GRID_STEP - mean) ** 2;
  }
  return { theta: mean, se: Math.sqrt(variance / weight), n: responses.length };
}

export interface ScoreBand {
  score: number;
  low: number;
  high: number;
  provisional: boolean;
}

/** Nota com faixa de 10% a 90%. */
export function toScore(area: Area, estimate: ThetaEstimate): ScoreBand {
  const { mean, sd, provisional } = SCALES[area];
  const score = mean + sd * estimate.theta;
  const spread = 1.2816 * estimate.se * sd;
  return { score: Math.round(score), low: Math.round(score - spread), high: Math.round(score + spread), provisional };
}

/** Dificuldade do item em nota, útil para comparar itens. Não prevê nota individual. */
export function difficultyScore(area: Area, b: number): number {
  const { mean, sd } = SCALES[area];
  return Math.round(mean + sd * Math.max(-3, Math.min(4, b)));
}
