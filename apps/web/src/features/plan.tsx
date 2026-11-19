// Plano até o ENEM: um foco por dia, escolhido pelas lacunas do aluno.
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AREA_NAMES, type StudyPlan } from "@ritmo/contracts";
import { api } from "../lib/api.ts";
import { Async, Metric, Metrics, PageHead, Pill } from "../ui/kit.tsx";
import { trainingLink } from "./focus-picker.tsx";
import { labModule, labUrl } from "@ritmo/contracts";
import { labIdsFor } from "./lab-links.tsx";

type Day = StudyPlan["days"][number];

const dayLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });

function describe(day: Day): { title: string; detail: string; to?: string; action?: string } {
  if (day.kind === "exam") return { title: `Dia de ENEM${day.areas ? `: ${day.areas.map((a) => AREA_NAMES[a]).join(" e ")}` : ""}`, detail: "Boa prova. Durma bem na véspera e chegue com folga." };
  if (day.kind === "light") return { title: "Revisão leve", detail: "Releia seus erros e descanse. Nada de assunto novo na véspera.", to: "/erros", action: "Ver erros" };
  if (day.kind === "simulado") return { title: "Simulado", detail: "Treine a prova inteira no tempo real.", to: "/simulado", action: "Montar" };
  return { title: day.topic!, detail: day.discipline!, to: trainingLink(day), action: "Treinar" };
}

function Plan({ plan }: { plan: StudyPlan }) {
  const { enem, days } = plan;
  if (!enem) return <div className="state">A data da próxima edição do ENEM ainda não foi cadastrada.</div>;
  const today = days[0]?.date;
  return (
    <>
      <Metrics label="Contagem para o ENEM">
        <Metric label={`Próxima prova do ENEM ${enem.year}`} value={enem.daysLeft === 0 ? "Hoje" : `${enem.daysLeft} ${enem.daysLeft === 1 ? "dia" : "dias"}`} note={`Provas: ${enem.days.map((d) => new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })).join(" e ")}`} />
      </Metrics>
      {enem.estimated ? <div className="notice warn">Datas estimadas: o edital do ENEM {enem.year} ainda não saiu. A contagem será ajustada quando o INEP confirmar.</div> : null}
      <section className="card" aria-labelledby="dias-title">
        <h2 id="dias-title">Seu foco de cada dia</h2>
        <p className="sub">O plano é refeito com os seus resultados. Por isso, os próximos dias podem mudar conforme você treina.</p>
        <div className="stack">
          {days.map((day) => {
            const { title, detail, to, action } = describe(day);
            return (
              <div className="row-box" key={day.date}>
                <div className="tag mono">{dayLabel(day.date)}</div>
                <div className="grow">
                  <div className="row-title">{title}</div>
                  <div className="row-sub">{detail}</div>
                  {day.kind === "focus"
                    ? labIdsFor(day.discipline, day.topic).slice(0, 1).map((id) => (
                        <a key={id} className="row-lab" href={labUrl(id)} target="_blank" rel="noopener">
                          Simulador: {labModule(id)?.title ?? id}
                        </a>
                      ))
                    : null}
                </div>
                {day.done ? <Pill tone="good">Feito</Pill> : day.date === today ? <Pill tone="brand">Hoje</Pill> : null}
                {to ? <Link className="btn soft slim" to={to}>{action}</Link> : null}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

export function PlanPage() {
  const query = useQuery({ queryKey: ["plan"], queryFn: () => api.get<StudyPlan>("/api/practice/plan") });
  return (
    <div className="page">
      <PageHead kicker="Plano até o ENEM" title="O que estudar em cada dia" />
      <Async query={query}>{(plan) => <Plan plan={plan} />}</Async>
    </div>
  );
}
