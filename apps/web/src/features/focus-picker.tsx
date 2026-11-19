// Escolha do que estudar, usada no treino e no simulado.
import { useQuery } from "@tanstack/react-query";
import { AREA_NAMES, AREAS, type Area, type TrainingCatalog } from "@ritmo/contracts";
import { api } from "../lib/api.ts";

const AREA_PREFIX = "area:";

/** A disciplina pode vir como `area:CN`, quando a escolha é a área inteira. */
export function parseScope(scope: string): { area?: Area; discipline?: string } {
  if (!scope) return {};
  return scope.startsWith(AREA_PREFIX) ? { area: scope.slice(AREA_PREFIX.length) as Area } : { discipline: scope };
}

export function trainingLink(focus: { discipline?: string; topic?: string; mistakes?: boolean }): string {
  const params = new URLSearchParams();
  if (focus.discipline) params.set("disciplina", focus.discipline);
  if (focus.topic) params.set("assunto", focus.topic);
  if (focus.mistakes) params.set("erros", "1");
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
        <select className="input" value={topic} disabled={!chosen} onChange={(e) => onTopic(e.target.value)}>
          <option value="">{chosen ? "Todos os assuntos" : "Escolha uma disciplina primeiro"}</option>
          {chosen?.topics.map((t) => <option key={t.topic} value={t.topic}>{t.topic} ({t.questions})</option>)}
        </select>
      </label>
    </fieldset>
  );
}
