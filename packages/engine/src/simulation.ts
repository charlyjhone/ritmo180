// Simulação de alunos para dados de demonstração e testes. Reprodutível pela semente.
import { probability, type IrtParams } from "./irt.ts";
import type { PhaseTimes } from "./types.ts";

export class SeededRng {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  /** mulberry32 */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  normal(mean = 0, sd = 1): number {
    const u = 1 - this.next();
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}

export function simulateCorrect(rng: SeededRng, theta: number, params: IrtParams): boolean {
  return rng.next() < probability(theta, params);
}

export interface SimulatedPace {
  /** Multiplicadores do aluno em relação à divisão de referência. */
  read: number;
  path: number;
  calc: number;
  check: number;
}

export function simulatePhases(rng: SeededRng, targetMs: number, pace: SimulatedPace): PhaseTimes {
  const noise = () => Math.exp(rng.normal(0, 0.25));
  return {
    readMs: Math.round(targetMs * 0.34 * pace.read * noise()),
    pathMs: Math.round(targetMs * 0.22 * pace.path * noise()),
    calcMs: Math.round(targetMs * 0.34 * pace.calc * noise()),
    checkMs: Math.round(targetMs * 0.1 * pace.check * noise()),
  };
}
