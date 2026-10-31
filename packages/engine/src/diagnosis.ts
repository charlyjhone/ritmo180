// Diagnóstico do tempo: compara as fases do aluno com a divisão de referência e aponta o gargalo.
import type { PhaseTimes } from "./types.ts";
import { formatClock, sumPhases } from "./timing.ts";

export type Phase = keyof PhaseTimes;
export const PHASE_LABEL: Record<Phase, string> = { readMs: "Leitura", pathMs: "Caminho", calcMs: "Cálculo", checkMs: "Conferência" };

/** Divisão de referência de um tempo de 3:00 quando ainda não há base de alunos fortes. */
export const REFERENCE_SHARES: Record<Phase, number> = { readMs: 0.34, pathMs: 0.22, calcMs: 0.34, checkMs: 0.1 };

export interface TimeDiagnosis {
  bottleneck: Phase | null;
  shares: Record<Phase, number>;
  totalMs: number;
  overTargetMs: number;
  message: string;
}

export function diagnoseTime(average: PhaseTimes, targetMs: number): TimeDiagnosis {
  const totalMs = sumPhases(average);
  const phases = Object.keys(REFERENCE_SHARES) as Phase[];
  const shares = Object.fromEntries(phases.map((p) => [p, totalMs ? average[p] / totalMs : 0])) as Record<Phase, number>;
  const overTargetMs = totalMs - targetMs;
  let bottleneck: Phase | null = null;
  let worst = 0;
  for (const phase of phases) {
    const over = average[phase] - REFERENCE_SHARES[phase] * targetMs;
    if (over > worst) {
      worst = over;
      bottleneck = phase;
    }
  }
  if (overTargetMs <= 0 || bottleneck === null) {
    return { bottleneck: null, shares, totalMs, overTargetMs, message: "Seu tempo médio já está dentro do alvo. O foco agora é manter o acerto em blocos longos." };
  }
  const label = PHASE_LABEL[bottleneck].toLowerCase();
  const message = `Você está ${formatClock(overTargetMs / 1000)} acima do alvo por questão, e a maior parte desse excesso está em ${label} (${formatClock(worst / 1000)} a mais que a referência).`;
  return { bottleneck, shares, totalMs, overTargetMs, message };
}
