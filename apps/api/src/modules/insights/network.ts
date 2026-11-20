// Painel da rede: operação da plataforma. Só agregados por escola, nunca alunos individuais.
import { AREA_NAMES, AREAS, type NetworkDashboard } from "@ritmo/contracts";
import type { Tx } from "../../platform/db.ts";

/** Menos que isso não dá para treinar o assunto por uma semana sem repetir questão. */
const THIN_TOPIC = 15;
/** Fora do escopo do Ritmo 180. */
const OUT_OF_SCOPE = ["Inglês", "Espanhol"];
import { rounded } from "./teacher.ts";

const WEEK_MS = 7 * 86_400_000;
const FUNNEL = [
  ["generated", "Geradas", "Rascunhos feitos pela IA"],
  ["blind_solve", "Resolução às cegas", "Três resoluções independentes chegam ao gabarito"],
  ["consistency", "Coerência", "Alternativas distintas e bem formadas"],
  ["originality", "Originalidade", "Comparada com o banco"],
  ["teacher_review", "Revisão de professor", "Aprovada por uma pessoa"],
] as const;

export async function networkDashboard(tx: Tx, now: number): Promise<NetworkDashboard> {
  const since = new Date(now - WEEK_MS);
  const before = new Date(now - 2 * WEEK_MS);
  const schools = await tx.query(
    `SELECT s.id, s.name, s.city, s.grades, s.brand_color, s.is_demo, s.released_at,
       (SELECT count(*)::int FROM users u WHERE u.school_id = s.id AND u.role = 'student') AS students,
       (SELECT count(*)::int FROM learner_snapshots l WHERE l.school_id = s.id AND l.last_active >= $1) AS active,
       (SELECT avg(l.ritmo)::float FROM learner_snapshots l WHERE l.school_id = s.id) AS ritmo
     FROM schools s ORDER BY s.created_at`,
    [since],
  );
  const released = schools.filter((s) => s.released_at);
  const items = (await tx.query(
    `SELECT count(*) FILTER (WHERE status = 'published')::int AS published,
       count(*) FILTER (WHERE status = 'published' AND source = 'inep_official')::int AS official,
       count(*) FILTER (WHERE status = 'published' AND source = 'ai_generated')::int AS generated,
       count(*) FILTER (WHERE status = 'published' AND source IN ('authored','third_party'))::int AS authored,
       count(*) FILTER (WHERE status = 'published' AND calibration = 'calibrated')::int AS calibrated,
       count(*) FILTER (WHERE status = 'published' AND calibration = 'provisional')::int AS calibrating,
       count(*) FILTER (WHERE calibration = 'discarded')::int AS discarded
     FROM items`,
  ))[0]!;
  const attempts = (await tx.query(
    `SELECT count(*)::int AS total, count(DISTINCT student_id) FILTER (WHERE answered_at >= $1)::int AS active,
       count(DISTINCT student_id) FILTER (WHERE answered_at >= $2 AND answered_at < $1)::int AS active_before,
       count(*) FILTER (WHERE 'too_fast' = ANY(flags))::int AS too_fast,
       count(*) FILTER (WHERE 'away_then_perfect' = ANY(flags))::int AS away,
       count(*) FILTER (WHERE 'guess_streak' = ANY(flags))::int AS guess,
       count(*) FILTER (WHERE NOT valid)::int AS invalid
     FROM attempts`,
    [since, before],
  ))[0]!;
  const stages = await tx.query(`SELECT stage, count(*) FILTER (WHERE passed)::int AS passed FROM item_pipeline GROUP BY stage`);
  const stageCount = new Map(stages.map((s) => [s.stage, s.passed as number]));
  const bank = await tx.query(
    `SELECT area, count(*) FILTER (WHERE status = 'published' AND calibration = 'official')::int AS official,
       count(*) FILTER (WHERE status = 'published' AND calibration = 'calibrated')::int AS calibrated,
       count(*) FILTER (WHERE status = 'published' AND calibration = 'provisional')::int AS calibrating,
       count(*) FILTER (WHERE status = 'catalog')::int AS catalog FROM items GROUP BY area`,
  );
  const thin = await tx.query(
    `SELECT i.discipline, i.topic, count(*)::int AS items,
       EXISTS (SELECT 1 FROM lessons l WHERE l.discipline = i.discipline AND l.topic = i.topic AND l.status = 'published') AS has_lesson
     FROM items i WHERE i.status = 'published' AND i.discipline <> ALL($1::text[])
     GROUP BY i.discipline, i.topic HAVING count(*) < $2 ORDER BY count(*), i.discipline, i.topic`,
    [OUT_OF_SCOPE, THIN_TOPIC],
  );
  const reclassified = (await tx.query(`SELECT count(*)::int AS n FROM item_flags WHERE status = 'retired'`))[0]!.n;

  const headline = released.length === 0
    ? "Nenhuma escola liberada ainda"
    : `${released.length} ${released.length === 1 ? "escola" : "escolas"} no ar, ${attempts.active} alunos ativos e ${items.published} questões publicadas`;
  return {
    thinTopics: { threshold: THIN_TOPIC, total: thin.length, topics: thin.slice(0, 15).map((t) => ({ discipline: t.discipline, topic: t.topic, items: t.items, hasLesson: t.has_lesson })) },
    headline,
    metrics: {
      schools: released.length,
      onboarding: schools.length - released.length,
      activeStudents: attempts.active,
      activeDelta: attempts.active - attempts.active_before,
      items: items.published,
      official: items.official,
      generated: items.generated,
      authored: items.authored,
      responses: attempts.total,
    },
    funnel: FUNNEL.map(([stage, name, note]) => ({ name, note, count: stageCount.get(stage) ?? 0 })),
    schools: schools.map((s) => ({
      id: s.id, name: s.name, city: s.city, grades: s.grades, active: s.released_at ? s.active : null, ritmo: rounded(s.ritmo),
      ownBrand: s.brand_color !== "#2447D6", status: s.released_at ? "No ar" : "Em implantação", isDemo: s.is_demo,
    })),
    bank: AREAS.map((area) => {
      const b = bank.find((x) => x.area === area);
      return { area, name: AREA_NAMES[area], official: b?.official ?? 0, calibrated: b?.calibrated ?? 0, calibrating: b?.calibrating ?? 0, catalogOnly: b?.catalog ?? 0 };
    }),
    calibration: { model: "TRI de 3 parâmetros", calibrated: items.calibrated, calibrating: items.calibrating, reclassified, discarded: items.discarded },
    integrity: {
      share: attempts.total ? Math.round((attempts.invalid / attempts.total) * 1000) / 10 : 0,
      tooFast: attempts.too_fast, awayThenPerfect: attempts.away, guessStreak: attempts.guess, responses: attempts.total,
    },
  };
}

