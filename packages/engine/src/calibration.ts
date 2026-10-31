// Calibração de itens novos: estima a, b e c com os alunos já posicionados por itens oficiais (âncoras).
import { probability, type IrtParams } from "./irt.ts";

export interface CalibrationObservation {
  theta: number;
  correct: boolean;
}

export interface CalibrationResult {
  params: IrtParams;
  n: number;
  /** Baixa discriminação: o item não separa quem sabe de quem não sabe. */
  lowDiscrimination: boolean;
}

export const MIN_RESPONSES_TO_CALIBRATE = 200;
export const MIN_DISCRIMINATION = 0.5;

const ITERATIONS = 400;

function objective([logA, b, logitC]: readonly [number, number, number], data: readonly CalibrationObservation[]): number {
  const params: IrtParams = { a: Math.exp(logA), b, c: 1 / (1 + Math.exp(-logitC)) };
  let ll = 0;
  for (const d of data) {
    const p = Math.min(1 - 1e-9, Math.max(1e-9, probability(d.theta, params)));
    ll += d.correct ? Math.log(p) : Math.log(1 - p);
  }
  // Prioris fracas, as usuais em 3PL: mantêm a estimativa estável com poucos dados.
  const priorA = -((logA - 0.2) ** 2) / (2 * 0.5 ** 2);
  const priorB = -(b ** 2) / (2 * 2 ** 2);
  const priorC = -((logitC + 1.7) ** 2) / (2 * 0.6 ** 2);
  return -(ll + priorA + priorB + priorC);
}

/** Nelder-Mead: sem derivadas, suficiente para três parâmetros. */
function minimize(f: (x: readonly [number, number, number]) => number, start: [number, number, number]): [number, number, number] {
  type P = [number, number, number];
  const simplex: { x: P; v: number }[] = [{ x: start, v: f(start) }];
  for (let i = 0; i < 3; i++) {
    const x = [...start] as P;
    x[i] = x[i]! + 0.5;
    simplex.push({ x, v: f(x) });
  }
  for (let iter = 0; iter < ITERATIONS; iter++) {
    simplex.sort((p, q) => p.v - q.v);
    const worst = simplex[3]!;
    const centroid = [0, 1, 2].map((d) => (simplex[0]!.x[d]! + simplex[1]!.x[d]! + simplex[2]!.x[d]!) / 3) as P;
    const along = (t: number): P => centroid.map((c, d) => c + t * (c - worst.x[d]!)) as P;
    const reflected = along(1);
    const vr = f(reflected);
    if (vr < simplex[0]!.v) {
      const expanded = along(2);
      const ve = f(expanded);
      simplex[3] = ve < vr ? { x: expanded, v: ve } : { x: reflected, v: vr };
    } else if (vr < simplex[2]!.v) {
      simplex[3] = { x: reflected, v: vr };
    } else {
      const contracted = along(-0.5);
      const vc = f(contracted);
      if (vc < worst.v) simplex[3] = { x: contracted, v: vc };
      else {
        const best = simplex[0]!.x;
        for (let i = 1; i < 4; i++) {
          const x = best.map((c, d) => c + 0.5 * (simplex[i]!.x[d]! - c)) as P;
          simplex[i] = { x, v: f(x) };
        }
      }
    }
  }
  simplex.sort((p, q) => p.v - q.v);
  return simplex[0]!.x;
}

export function calibrateItem(data: readonly CalibrationObservation[]): CalibrationResult {
  const [logA, b, logitC] = minimize((x) => objective(x, data), [0.2, 0, -1.7]);
  const a = Math.exp(logA);
  return {
    params: { a, b, c: 1 / (1 + Math.exp(-logitC)) },
    n: data.length,
    lowDiscrimination: a < MIN_DISCRIMINATION,
  };
}
