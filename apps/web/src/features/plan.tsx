// Plano até o ENEM: um foco por dia, escolhido pelas lacunas do aluno.
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AREA_NAMES, type CourseGoalView, type Milestone, type StudyPlan } from "@ritmo/contracts";
import { api, ApiError } from "../lib/api.ts";
import { Async, Bar, Empty, Metric, Metrics, PageHead, Pill } from "../ui/kit.tsx";
import { trainingLink } from "./focus-picker.tsx";
import { labModule, labUrl } from "@ritmo/contracts";
import { labIdsFor } from "./lab-links.tsx";
import { lessonLink } from "./lessons.tsx";
import { remember, SAW_PLAN } from "../lib/habit.ts";

type Day = StudyPlan["days"][number];

const dayLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });

function describe(day: Day): { title: string; detail: string; to?: string; action?: string } {
  if (day.kind === "exam") return { title: `Dia de ENEM${day.areas ? `: ${day.areas.map((a) => AREA_NAMES[a]).join(" e ")}` : ""}`, detail: "Boa prova. Durma bem na véspera e chegue com folga." };
  if (day.kind === "light") return { title: "Revisão leve", detail: "Releia seus erros e descanse. Nada de assunto novo na véspera.", to: "/erros", action: "Ver erros" };
  if (day.kind === "simulado") return { title: "Simulado", detail: "Treine a prova inteira no tempo real.", to: "/simulado", action: "Montar" };
  return { title: day.topic!, detail: day.discipline!, to: trainingLink(day), action: "Treinar" };
}

const shortDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

function CourseGoal() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["course-goal"], queryFn: () => api.get<CourseGoalView>("/api/study/course-goal") });
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    try {
      await api.put("/api/study/course-goal", { course: form.get("course"), institution: form.get("institution"), cutoff: Number(String(form.get("cutoff")).replace(",", ".")) });
      setEditing(false);
      await client.invalidateQueries({ queryKey: ["course-goal"] });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível salvar. Tente de novo.");
    }
  }
  return (
    <section className="card" aria-labelledby="curso-title">
      <Async query={query}>
        {(v) => {
          const goal = v.goal;
          if (!goal || editing) {
            return (
              <>
                <h2 id="curso-title">Qual curso você quer?</h2>
                <p className="sub">Consulte a nota de corte do curso no site do SISU (sisu.mec.gov.br) e anote aqui. O Ritmo compara com a sua nota estimada e mostra quanto falta.</p>
                <form onSubmit={(e) => void submit(e)}>
                  <div className="form-grid" style={{ marginTop: 8 }}>
                    <label className="field">Curso<input className="input" name="course" required minLength={2} maxLength={120} defaultValue={goal?.course} placeholder="Enfermagem" /></label>
                    <label className="field">Instituição (opcional)<input className="input" name="institution" maxLength={160} defaultValue={goal?.institution} placeholder="Universidade federal da sua cidade" /></label>
                    <label className="field">Nota de corte<input className="input" name="cutoff" required inputMode="decimal" pattern="[0-9]{3,4}([.,][0-9])?" defaultValue={goal?.cutoff} placeholder="680,5" /></label>
                  </div>
                  {error ? <p className="sub" role="alert">{error}</p> : null}
                  <div className="btn-row"><button className="btn" type="submit">Salvar meta</button>{goal ? <button className="btn soft" type="button" onClick={() => setEditing(false)}>Cancelar</button> : null}</div>
                </form>
              </>
            );
          }
          return (
            <>
              <div className="card-head">
                <h2 id="curso-title">Meta: {goal.course}{goal.institution ? `, ${goal.institution}` : ""}</h2>
                <button className="btn soft slim" type="button" onClick={() => setEditing(true)}>Mudar</button>
              </div>
              {v.estimate === null ? (
                <p className="sub">Nota de corte: <b>{goal.cutoff.toLocaleString("pt-BR")}</b>. Faça os diagnósticos e simulados para o Ritmo estimar sua nota e mostrar quanto falta.</p>
              ) : (
                <>
                  <p className="sub">
                    Nota de corte <b>{goal.cutoff.toLocaleString("pt-BR")}</b> · sua média estimada <b>{v.estimate}</b>.{" "}
                    {v.gap! > 0 ? <>Faltam <b>{v.gap} pontos</b>.</> : <>Você já está <b>{-v.gap!} pontos acima</b> do corte. Agora é manter.</>}
                  </p>
                  <Bar pct={Math.min(100, (v.estimate / goal.cutoff) * 100)} tone={v.gap! > 0 ? "amber" : "ok"} />
                  <p className="note">A média usa as áreas já medidas ({v.measured.map((a) => AREA_NAMES[a]).join(", ")}) e não inclui a redação nem os pesos que cada curso dá às áreas. Use como orientação, não como garantia.</p>
                </>
              )}
            </>
          );
        }}
      </Async>
    </section>
  );
}

function Calendar() {
  const query = useQuery({ queryKey: ["calendar"], queryFn: () => api.get<Milestone[]>("/api/study/calendar") });
  return (
    <section className="card" aria-labelledby="cal-title">
      <h2 id="cal-title">Datas do ENEM</h2>
      <Async query={query}>
        {(list) => list.length ? (
          <div className="stack">
            {list.map((m) => (
              <div className="row-box" key={m.id}>
                <div className="tag mono">{shortDate(m.startsOn)}{m.endsOn && m.endsOn !== m.startsOn ? ` a ${shortDate(m.endsOn)}` : ""}</div>
                <div className="grow"><div className="row-title">{m.title}</div>{m.note ? <div className="row-sub">{m.note}</div> : null}</div>
              </div>
            ))}
          </div>
        ) : <Empty icon="calendar" title="O calendário sai com o edital">As datas de isenção, inscrição e provas aparecem aqui assim que o INEP publicar o edital. Fique de olho também no site do INEP.</Empty>}
      </Async>
    </section>
  );
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
      {plan.finalStretch ? <div className="notice">Reta final: o plano agora só volta aos assuntos que você já estudou, ainda erra e mais caem na prova. Nada de assunto novo.</div> : null}
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
                  {day.kind === "focus" && day.discipline && day.topic ? <Link className="row-lab" to={lessonLink({ discipline: day.discipline, topic: day.topic })}>Aula rápida: {day.topic}</Link> : null}
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
  useEffect(() => remember(SAW_PLAN), []);
  return (
    <div className="page">
      <PageHead kicker="Plano até o ENEM" title="O que estudar em cada dia" />
      <CourseGoal />
      <Calendar />
      <Async query={query}>{(plan) => <Plan plan={plan} />}</Async>
    </div>
  );
}
