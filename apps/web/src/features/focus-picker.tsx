// Escolha do que estudar, usada no treino e no simulado.
import { useQuery } from "@tanstack/react-query";
import { AREA_NAMES, AREAS, type Area, type TrainingCatalog } from "@ritmo/contracts";
import { api } from "../lib/api.ts";

const AREA_PREFIX = "area:";
const TOPIC_SEPARATOR = "\u0001";

/** A disciplina pode vir como `area:CN`, quando a escolha é a área inteira. */
export function parseScope(scope: string): { area?: Area; discipline?: string } {
  if (!scope) return {};
  return scope.startsWith(AREA_PREFIX) ? { area: scope.slice(AREA_PREFIX.length) as Area } : { discipline: scope };
}

/** `minutes` encurta o treino; sem ele vale o padrão de 25 minutos. */
export function trainingLink(focus: { discipline?: string; topic?: string; mistakes?: boolean; minutes?: number }): string {
  const params = new URLSearchParams();
  if (focus.discipline) params.set("disciplina", focus.discipline);
  if (focus.topic) params.set("assunto", focus.topic);
  if (focus.mistakes) params.set("erros", "1");
  if (focus.minutes) params.set("minutos", String(focus.minutes));
  const query = params.toString();
  return query ? `/treino?${query}` : "/treino";
}

export function FocusPicker({ scope, topic, onScope, onTopic, title, anyLabel, allowArea = false }: {
  scope: string;
  topic: string;
  onScope: (value: string) => void;
  onTopic: (value: string) => void;
  title: string;
  anyLabel: string;
  allowArea?: boolean;
}) {
  const query = useQuery({ queryKey: ["practice-catalog"], queryFn: () => api.get<TrainingCatalog>("/api/practice/catalog") });
  const disciplines = query.data?.disciplines ?? [];
  const chosen = disciplines.find((d) => d.discipline === scope);
  const { area } = parseScope(scope);
  // Assuntos oferecidos antes de escolher a disciplina: todos, ou só os da área escolhida.
  const open = area ? disciplines.filter((d) => d.area === area) : disciplines;
  return (
    <fieldset style={{ border: 0, padding: 0, margin: "20px 0 0", display: "grid", gap: 12 }}>
      <legend style={{ padding: 0 }}>{title}</legend>
      <label className="field">Disciplina
        <select className="input" value={scope} onChange={(e) => onScope(e.target.value)}>
          <option value="">{anyLabel}</option>
          {AREAS.filter((area) => disciplines.some((d) => d.area === area)).map((area) => (
            <optgroup key={area} label={AREA_NAMES[area]}>
              {allowArea ? <option value={`${AREA_PREFIX}${area}`}>Toda a área ({disciplines.filter((d) => d.area === area).reduce((sum, d) => sum + d.questions, 0)})</option> : null}
              {disciplines.filter((d) => d.area === area).map((d) => <option key={d.discipline} value={d.discipline}>{d.discipline} ({d.questions})</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="field">Assunto
        {chosen ? (
          <select className="input" value={topic} onChange={(e) => onTopic(e.target.value)}>
            <option value="">Todos os assuntos</option>
            {chosen.topics.map((t) => <option key={t.topic} value={t.topic}>{t.topic} ({t.questions})</option>)}
          </select>
        ) : (
          // Sem disciplina escolhida, o assunto também serve de ponto de partida: escolher um preenche a disciplina.
          <select className="input" value="" disabled={!open.length} onChange={(e) => {
            const [discipline, picked] = e.target.value.split(TOPIC_SEPARATOR);
            if (!discipline || !picked) return;
            onScope(discipline);
            onTopic(picked);
          }}>
            <option value="">{area ? `Todos os assuntos de ${AREA_NAMES[area]}` : "Todos os assuntos"}</option>
            {open.map((d) => (
              <optgroup key={d.discipline} label={d.discipline}>
                {d.topics.map((t) => <option key={t.topic} value={`${d.discipline}${TOPIC_SEPARATOR}${t.topic}`}>{t.topic} ({t.questions})</option>)}
              </optgroup>
            ))}
          </select>
        )}
      </label>
    </fieldset>
  );
}
