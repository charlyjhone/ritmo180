// Plano até o ENEM: contagem regressiva e um foco por dia, a partir das lacunas do aluno.
import type { Area } from "./types.ts";

const DAY_MS = 86_400_000;
const BRASILIA_MS = 3 * 3_600_000;
const DEFAULT_MASTERY = 0.5;
const TRAINING_DAYS_PER_SIMULADO = 6;

interface EnemEdition {
  year: number;
  days: readonly string[];
  /** Sem edital ainda: são os domingos prováveis, e a tela avisa isso. */
  estimated: boolean;
}

/** Cada edição nova entra aqui. Ao sair o edital de 2027, troque as datas e tire `estimated`. */
export const ENEM_EDITIONS: readonly EnemEdition[] = [
  { year: 2026, days: ["2026-11-08", "2026-11-15"], estimated: false },
  { year: 2027, days: ["2027-11-07", "2027-11-14"], estimated: true },
];

/** No primeiro dia caem Linguagens e Humanas; no segundo, Natureza e Matemática. */
const AREAS_BY_DAY: readonly (readonly Area[])[] = [["LC", "CH"], ["CN", "MT"]];

export interface EnemCountdown {
  year: number;
  nextDay: string;
  daysLeft: number;
  days: readonly string[];
  estimated: boolean;
}

export interface PlanPriority {
  discipline: string;
  topic: string;
  /** Participação do assunto nas provas (0 a 1). */
  weight: number;
  mastery: number | null;
}

export interface PlanDay {
  date: string;
  kind: "focus" | "simulado" | "light" | "exam";
  discipline?: string;
  topic?: string;
  areas?: readonly Area[];
}

const dateOf = (ms: number) => new Date(ms - BRASILIA_MS).toISOString().slice(0, 10);
const addDays = (date: string, days: number) => new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);

export function nextEnem(now: number): EnemCountdown | null {
  const today = dateOf(now);
  for (const { year, days, estimated } of ENEM_EDITIONS) {
    const nextDay = days.find((day) => day >= today);
    if (nextDay) return { year, nextDay, daysLeft: Math.round((Date.parse(nextDay) - Date.parse(today)) / DAY_MS), days, estimated };
  }
  return null;
}

/** Ordena por peso e lacuna, alternando disciplinas para o plano não virar uma matéria só. */
function focusQueue(priorities: readonly PlanPriority[]): PlanPriority[] {
  const need = (p: PlanPriority) => p.weight * (1 - (p.mastery ?? DEFAULT_MASTERY));
  const left = [...priorities].sort((x, y) => need(y) - need(x) || x.topic.localeCompare(y.topic));
  const queue: PlanPriority[] = [];
  while (left.length > 0) {
    const other = left.findIndex((p) => p.discipline !== queue.at(-1)?.discipline);
    queue.push(left.splice(Math.max(0, other), 1)[0]!);
  }
  return queue;
}

export function planUntilEnem(now: number, priorities: readonly PlanPriority[], maxDays = 21): PlanDay[] {
  const enem = nextEnem(now);
  if (!enem) return [];
  const queue = focusQueue(priorities);
  const last = enem.days.at(-1)!;
  const days: PlanDay[] = [];
  let trained = 0;
  for (let date = dateOf(now); date <= last && days.length < maxDays; date = addDays(date, 1)) {
    if (enem.days.includes(date)) days.push({ date, kind: "exam", areas: AREAS_BY_DAY[enem.days.indexOf(date)] });
    else if (enem.days.includes(addDays(date, 1))) days.push({ date, kind: "light" });
    else if (trained % TRAINING_DAYS_PER_SIMULADO === TRAINING_DAYS_PER_SIMULADO - 1) {
      days.push({ date, kind: "simulado" });
      trained++;
    } else {
      const focus = queue[trained % Math.max(1, queue.length)];
      days.push(focus ? { date, kind: "focus", discipline: focus.discipline, topic: focus.topic } : { date, kind: "simulado" });
      trained++;
    }
  }
  return days;
}
