// Calendário do ENEM: datas cadastradas pela rede quando o INEP divulga o edital.
import type { Milestone } from "@ritmo/contracts";
import type { Tx } from "../../platform/db.ts";

const BRT_OFFSET_MS = 3 * 3_600_000;
const dateOf = (ms: number) => new Date(ms - BRT_OFFSET_MS).toISOString().slice(0, 10);
const day = (value: unknown) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10));

const toMilestone = (r: Record<string, any>): Milestone => ({ id: r.id, title: r.title, startsOn: day(r.starts_on), endsOn: r.ends_on ? day(r.ends_on) : null, note: r.note });

/** Datas que ainda não terminaram, em ordem. */
export async function upcomingMilestones(tx: Tx, now: number): Promise<Milestone[]> {
  const rows = await tx.query(`SELECT * FROM enem_milestones WHERE coalesce(ends_on, starts_on) >= $1::date ORDER BY starts_on, title`, [dateOf(now)]);
  return rows.map(toMilestone);
}

export async function allMilestones(tx: Tx): Promise<Milestone[]> {
  return (await tx.query(`SELECT * FROM enem_milestones ORDER BY starts_on DESC, title`)).map(toMilestone);
}
