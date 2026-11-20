// Painel do aluno.
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AREA_NAMES, type StudentDashboard } from "@ritmo/contracts";
import { STAGES } from "@ritmo/engine";
import { api } from "../lib/api.ts";
import { trainingLink } from "./focus-picker.tsx";
import { lessonLink } from "./lessons.tsx";
import { cardsLink } from "./cards.tsx";
import { HabitTools } from "./habit.tsx";
import { recall, remember, SAW_PLAN, WELCOME_CLOSED } from "../lib/habit.ts";
import { Async, Bar, clock, clockOrDash, Empty, LineChart, Metric, Metrics, PageHead, ScoreMetric, points, TimeStrip } from "../ui/kit.tsx";

const GOAL_CHOICES = [20, 35, 50, 70, 100, 150];

function WeeklyGoal({ goal }: { goal: StudentDashboard["goal"] }) {
  const client = useQueryClient();
  const [error, setError] = useState(false);
  async function change(questions: number) {
    setError(false);
    try {
      await api.put("/api/practice/goal", { questions });
      await client.invalidateQueries({ queryKey: ["student"] });
    } catch {
      setError(true);
    }
  }
  const left = goal.target - goal.done;
  const choices = [...new Set([...GOAL_CHOICES, goal.target])].sort((x, y) => x - y);
  return (
    <section className="card goal" aria-labelledby="meta-title">
      <div className="card-head">
        <h2 id="meta-title">{left > 0 ? `Meta da semana: ${goal.done} de ${goal.target} questões` : `Meta da semana cumprida: ${goal.done} questões`}</h2>
        <label className="field-sm">Meta semanal
          <select value={goal.target} onChange={(e) => void change(Number(e.target.value))}>
            {choices.map((n) => <option key={n} value={n}>{n} questões</option>)}
          </select>
        </label>
      </div>
      <Bar pct={Math.min(100, (goal.done / goal.target) * 100)} tone={left > 0 ? "" : "ok"} />
      {error ? <p className="sub" role="alert">Não foi possível salvar a meta. Tente de novo.</p> : null}
      {goal.trainedToday ? null : <p className="sub">Você ainda não treinou hoje. <Link to="/treino">Começar agora</Link></p>}
    </section>
  );
}

const dueLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

function Assignments({ list }: { list: StudentDashboard["assignments"] }) {
  if (!list.length) return null;
  return (
    <section className="card" aria-labelledby="tarefas-title">
      <h2 id="tarefas-title">Tarefas do professor</h2>
      <div className="stack">
        {list.map((a) => {
          const finished = a.done >= a.questions;
          return (
            <div className="row-box" key={a.id}>
              <div className="grow">
                <div className="row-title">{a.title}</div>
                <div className="row-sub">{a.teacher} · {a.done} de {a.questions} questões de {a.topic}{a.dueOn ? ` · até ${dueLabel(a.dueOn)}` : ""}</div>
                <div style={{ marginTop: 6 }}><Bar pct={(a.done / a.questions) * 100} tone={finished ? "ok" : ""} size="h6" /></div>
              </div>
              {finished ? <span className="pill good">Feita</span> : a.discipline ? <Link className="btn soft slim" to={trainingLink({ discipline: a.discipline, topic: a.topic })} aria-label={`Fazer a tarefa ${a.title}`}>Fazer</Link> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Challenge({ c }: { c: NonNullable<StudentDashboard["challenge"]> }) {
  const pct = Math.min(100, (c.done / c.target) * 100);
  return (
    <section className="card" aria-labelledby="desafio-title">
      <h2 id="desafio-title">Desafio da turma {c.className}: {c.done} de {c.target} questões nesta semana</h2>
      <Bar pct={pct} tone={pct >= 100 ? "ok" : ""} />
      <p className="sub">{c.done >= c.target ? "Desafio cumprido! A turma inteira fez a parte dela." : `Cada questão sua conta para a turma. ${c.steady} de ${c.students} colegas já treinaram em ${c.steadyDays} dias ou mais nesta semana.`}</p>
    </section>
  );
}

function FinalStretch({ f }: { f: NonNullable<StudentDashboard["finalStretch"]> }) {
  return (
    <section className="card" aria-labelledby="reta-title">
      <h2 id="reta-title">Reta final: {f.daysLeft === 1 ? "falta 1 dia" : `faltam ${f.daysLeft} dias`}</h2>
      <p className="sub">Agora não é hora de assunto novo. Revise o que você já estudou, ainda erra e mais cai na prova. Na véspera, releia as pegadinhas destas aulas.</p>
      {f.topics.length ? (
        <div className="stack">
          {f.topics.map((t) => (
            <div className="row-box" key={`${t.discipline}${t.topic}`}>
              <div className="grow"><div className="row-title">{t.topic}</div><div className="row-sub">{t.discipline} · {t.mastery}% de domínio</div></div>
              <Link className="btn soft slim" to={lessonLink(t)} aria-label={`Aula de ${t.topic}`}>Aula</Link>
              <Link className="btn soft slim" to={cardsLink(t)} aria-label={`Cartões de ${t.topic}`}>Cartões</Link>
              <Link className="btn soft slim" to={trainingLink(t)} aria-label={`Treinar ${t.topic}`}>Treinar</Link>
            </div>
          ))}
        </div>
      ) : <p className="sub">Seus assuntos já vistos estão acima de 70% de domínio. Mantenha o caderno de erros e os cartões em dia.</p>}
    </section>
  );
}

interface TodayItem { key: string; title: string; detail: string; action: { label: string; to: string }; tone?: "warn" | "ok" }

/** O que fazer hoje, na ordem que mais rende: diagnóstico, revisões vencidas, tarefas, cartões e o treino. */
function todayItems(d: StudentDashboard): TodayItem[] {
  const items: TodayItem[] = [];
  if (d.diagnosticPending.length > 0) {
    items.push({ key: "diag", title: `Diagnóstico de ${d.diagnosticPending.map((a) => AREA_NAMES[a]).join(", ")}`, detail: "Posiciona a sua nota e ajusta o plano.", action: { label: "Começar diagnóstico", to: `/diagnostico/${d.diagnosticPending[0]}` }, tone: "warn" });
  }
  if (d.reviews.due > 0) {
    items.push({ key: "rev", title: d.reviews.due === 1 ? "1 questão para rever" : `${d.reviews.due} questões para rever`, detail: `Cerca de ${Math.max(2, Math.round(d.reviews.due * 2))} minutos. Rever no dia certo faz o conteúdo ficar até o ENEM.`, action: { label: "Rever agora", to: trainingLink({ mistakes: true }) } });
  }
  const open = d.assignments.filter((a) => a.done < a.questions && a.discipline);
  if (open[0]) {
    const a = open[0];
    items.push({ key: "task", title: open.length === 1 ? `Tarefa: ${a.title}` : `${open.length} tarefas do professor`, detail: `${a.done} de ${a.questions} questões de ${a.topic}${a.dueOn ? ` · até ${dueLabel(a.dueOn)}` : ""}`, action: { label: "Fazer", to: trainingLink({ discipline: a.discipline!, topic: a.topic }) } });
  }
  if (d.cards.due > 0) {
    items.push({ key: "cards", title: d.cards.due === 1 ? "1 cartão de memorização" : `${d.cards.due} cartões de memorização`, detail: "Poucos minutos para fixar fórmulas e conceitos.", action: { label: "Rever cartões", to: cardsLink() } });
  }
  if (!d.goal.trainedToday) {
    items.push({ key: "train", title: "Treino de hoje", detail: "Você ainda não treinou hoje. O motor já escolheu as questões.", action: { label: "Começar agora", to: "/treino" } });
  }
  return items;
}

function Today({ d }: { d: StudentDashboard }) {
  const items = todayItems(d);
  return (
    <section className={`today ${d.enem ? "" : "solo"}`} aria-label="Hoje">
      {d.enem ? (
        <div className="card hero">
          <div className="kicker">Contagem para o ENEM {d.enem.year}</div>
          {d.enem.daysLeft === 0 ? <div className="hero-big">Hoje é dia de ENEM</div> : <div className="hero-big mono">{d.enem.daysLeft}<small>{d.enem.daysLeft === 1 ? "dia" : "dias"}</small></div>}
          <p>{d.enem.daysLeft === 0 ? "Boa prova. Confie no que você treinou." : `${d.enem.daysLeft === 1 ? "Falta 1 dia" : `Faltam ${d.enem.daysLeft} dias`} para a próxima prova${d.enem.estimated ? ", em data estimada" : ""}.`}</p>
          <div className="btn-row"><Link className="btn on-dark" to="/plano">Ver seu plano</Link></div>
        </div>
      ) : null}
      <div className="card queue">
        <div className="card-head"><h2>{items.length ? `Para hoje · ${items.length} ${items.length === 1 ? "passo" : "passos"}` : "Tudo em dia hoje"}</h2></div>
        {items.length ? (
          <ol className="queue-list">
            {items.map((item, i) => (
              <li key={item.key} className={`queue-item ${item.tone ?? ""}`}>
                <span className="queue-n mono" aria-hidden="true">{i + 1}</span>
                <div className="grow"><div className="row-title">{item.title}</div><div className="row-sub">{item.detail}</div></div>
                <Link className={`btn slim ${i === 0 ? "ritmo" : "outline"}`} to={item.action.to}>{item.action.label}</Link>
              </li>
            ))}
          </ol>
        ) : <p className="sub">Você já treinou, revisou e não tem pendências. Se quiser ir além, faça um simulado ou adiante um assunto.</p>}
        {d.missAdvice ? (
          <div className="advice-line">
            <b>Por que você erra:</b> {d.missAdvice.advice} ({d.missAdvice.share}% dos {d.missAdvice.total} erros que você explicou.){" "}
            <Link to={d.missAdvice.action.to}>{d.missAdvice.action.label}</Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}


/** Primeiro acesso: três passos que fazem o motor conhecer o aluno, e o lembrete para voltar amanhã. */
function Welcome({ d }: { d: StudentDashboard }) {
  const [closed, setClosed] = useState(() => recall(WELCOME_CLOSED) === "1");
  const steps = [
    { done: d.diagnosticPending.length === 0, title: "Faça o diagnóstico", detail: "Algumas questões por área mostram onde você está. O plano e o treino se ajustam a isso.", to: d.diagnosticPending[0] ? `/diagnostico/${d.diagnosticPending[0]}` : "/", action: "Começar diagnóstico" },
    { done: recall(SAW_PLAN) === "1", title: "Conheça seu plano", detail: "Um foco por dia até o ENEM, escolhido pelas suas lacunas.", to: "/plano", action: "Ver o plano" },
    { done: d.goal.done > 0 || d.skills.length > 0, title: "Faça o primeiro treino", detail: "Cerca de 15 minutos. O motor mede o seu tempo em cada etapa da questão.", to: "/treino", action: "Treinar" },
  ];
  const left = steps.filter((s) => !s.done).length;
  if (closed || d.streak.best > 2 || left === 0) return null;
  const next = steps.findIndex((s) => !s.done);
  return (
    <section className="card welcome" aria-labelledby="welcome-title">
      <div className="card-head">
        <div>
          <div className="kicker">Primeiro acesso</div>
          <h2 id="welcome-title" className="lg">Comece por aqui: {left === 1 ? "falta 1 passo" : `faltam ${left} passos`}</h2>
        </div>
        <button className="btn later slim" type="button" onClick={() => { remember(WELCOME_CLOSED); setClosed(true); }}>Já conheço</button>
      </div>
      <ol className="welcome-steps">
        {steps.map((s, i) => (
          <li key={s.title} className={s.done ? "done" : i === next ? "next" : ""}>
            <span className="queue-n mono" aria-hidden="true">{s.done ? "✓" : i + 1}</span>
            <div className="grow">
              <div className="row-title">{s.title}{s.done ? <span className="sr-only"> (feito)</span> : null}</div>
              <div className="row-sub">{s.detail}</div>
            </div>
            {s.done ? null : <Link className={`btn slim ${i === next ? "ritmo" : "outline"}`} to={s.to}>{s.action}</Link>}
          </li>
        ))}
      </ol>
      <div className="welcome-habit">
        <div className="row-title">Para não perder o ritmo</div>
        <HabitTools compact />
      </div>
    </section>
  );
}

function Dashboard({ d }: { d: StudentDashboard }) {
  const first = d.student.name.split(" ")[0];
  const { time, ritmo } = d;
  const kicker = d.student.className ?? d.student.grade ?? "";
  const planMinutes = d.plan.reduce((s, b) => s + b.minutes, 0);
  const main = d.scores.find((s) => s.score !== null) ?? d.scores.find((s) => s.area === "CN")!;
  const weekly = ritmo.weekly.flatMap((v) => (v === null ? [] : [v]));
  const b = time.breakdown;
  const readShare = b ? Math.round((b.readMs / (b.readMs + b.pathMs + b.calcMs + b.checkMs)) * 100) : null;
  return (
    <div className="page">
      <PageHead
        size="t34"
        kicker={kicker}
        title={`Olá, ${first}. ${time.bottleneck ? `Hoje o foco é ${time.bottleneck.toLowerCase()}.` : "Vamos ao treino de hoje."}`}
        actions={<div className="page-actions"><Link className="btn outline" to="/treino">Escolher disciplina e assunto</Link><Link className="btn ritmo" to="/treino">Começar treino do dia{planMinutes ? ` · ${planMinutes} min` : ""}</Link></div>}
      />
      <Welcome d={d} />
      <Today d={d} />
      {d.finalStretch ? <FinalStretch f={d.finalStretch} /> : null}
      <div className="grid-2">
        <WeeklyGoal goal={d.goal} />
        {d.challenge ? <Challenge c={d.challenge} /> : null}
      </div>
      <Assignments list={d.assignments} />
      <Metrics label="Indicadores principais">
        <Metric xl label="Índice Ritmo" value={ritmo.index === null ? "—" : `${ritmo.index}%`} note={ritmo.weekDelta === null ? `${ritmo.samples} questões válidas` : `${points(ritmo.weekDelta)} nesta semana`} tone={ritmo.weekDelta === null ? "" : ritmo.weekDelta >= 0 ? "up" : "down"} hint="Questões certas dentro do tempo-alvo" />
        <Metric xl label="Tempo médio por questão" value={clockOrDash(time.avgSeconds)} valueTone={time.avgSeconds !== null && time.avgSeconds > time.goalSeconds ? "amber" : "ok"} note={`Meta: ${clock(time.goalSeconds)}`} extra={time.avgSeconds !== null ? <div style={{ marginTop: 12 }}><Bar pct={(time.goalSeconds / time.avgSeconds) * 100} tone={time.avgSeconds > time.goalSeconds ? "amber" : ""} /></div> : null} />
        <ScoreMetric score={main} />
        <Metric xl label="Sequência de treino" value={`${d.streak.current} ${d.streak.current === 1 ? "dia" : "dias"}`} note={`Recorde pessoal: ${d.streak.best} dias`} />
      </Metrics>

      <section className="card" aria-labelledby="raio-x-title">
        <div className="card-head">
          <h2 className="lg" id="raio-x-title">{b ? `Raio-X do Tempo: ${readShare}% do seu tempo vai na leitura` : "Raio-X do Tempo"}</h2>
          {b ? <span className="note">Média de {Math.min(b.samples, 60)} questões no treino guiado</span> : null}
        </div>
        {b ? (
          <>
            <TimeStrip read={b.readMs} path={b.pathMs} calc={b.calcMs} check={b.checkMs} />
            <div className="legend">
              <span>Leitura: até entender o que a questão pede</span>
              <span>Caminho: até escolher a lei ou fórmula</span>
              <span>Cálculo: até marcar a resposta</span>
              <span>Conferência: até confirmar</span>
            </div>
            <div className="engine">
              <div><b>Diagnóstico do motor</b><p>{time.diagnosis}</p></div>
              <Link className="btn amber" to={d.skills[0] ? trainingLink(d.skills[0]) : "/treino"}>Treinar agora</Link>
            </div>
          </>
        ) : <p className="sub">Faça treinos no modo guiado para o motor separar leitura, caminho, cálculo e conferência.</p>}
      </section>

      <div className="grid-2">
        <section className="card" aria-labelledby="evol-title">
          <h2 id="evol-title">{weekly.length >= 2 ? `Índice Ritmo foi de ${weekly[0]}% para ${weekly.at(-1)}% em ${ritmo.weekly.length} semanas` : "Evolução do Índice Ritmo"}</h2>
          <LineChart values={ritmo.weekly} labels={ritmo.weekly.map((_, i) => `S${i + 1}`)} label="Evolução semanal do Índice Ritmo" />
        </section>
        <section className="card" aria-labelledby="prox-title">
          <h2 id="prox-title">Próximos treinos escolhidos pelo motor</h2>
          <div className="stack">
            {d.plan.length === 0 ? <Empty icon="done" title="Você praticou todas as questões disponíveis" action={<Link className="btn soft slim" to="/simulado">Fazer um simulado</Link>}>Nas últimas semanas não sobrou questão nova para o motor escolher. Um simulado mede como você está na prova inteira.</Empty> : null}
            {d.plan.map((t) => (
              <div className="row-box" key={t.kind}>
                <div className="tag mono">{t.kind === "REVISAO" ? "REVISÃO" : t.kind}</div>
                <div className="grow"><div className="row-title">{t.title} · {t.itemIds.length} questões</div><div className="row-sub">{t.reason}</div></div>
                <div className="row-meta mono">{t.minutes} min</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid-2">
        <section className="card" aria-labelledby="hab-title">
          <h2 id="hab-title">Seus assuntos no Método Ritmo</h2>
          <ol className="stages" aria-label="Etapas do Método Ritmo">{STAGES.map((s, i) => <li key={s}><b>{i + 1}</b>{s}</li>)}</ol>
          <div className="skills">
            {d.skills.length === 0 ? <Empty icon="list" title="Seus assuntos aparecem aqui" action={<Link className="btn soft slim" to="/treino">Fazer o primeiro treino</Link>}>Depois dos primeiros treinos, cada assunto mostra em que etapa do método você está.</Empty> : null}
            {d.skills.map((s) => (
              <div className="skill" key={s.topic}>
                <div className="skill-name">{s.topic}<small>{s.discipline} · {s.mastery}% de domínio · {s.attempts} {s.attempts === 1 ? "questão" : "questões"}</small></div>
                <div className="dots" role="img" aria-label={`Etapa ${s.stage} de 5`}>{[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= s.stage ? "on" : ""} />)}</div>
                <div className="skill-stage">{s.stage} · {s.stageName}</div>
                {s.discipline ? <Link className="btn soft slim skill-train" to={s.mastery < 60 ? lessonLink(s) : trainingLink(s)} aria-label={`${s.mastery < 60 ? "Aula de" : "Treinar"} ${s.topic}`}>{s.mastery < 60 ? "Aula" : "Treinar"}</Link> : null}
              </div>
            ))}
          </div>
        </section>
        <section className="card" aria-labelledby="pre-title">
          <h2 id="pre-title">Pré-requisitos do Fundamental que ainda pesam</h2>
          <p className="sub">O motor rastreou seus erros até a habilidade de origem. Fechar estas lacunas acelera várias questões ao mesmo tempo.</p>
          <div className="stack">
            {d.gaps.length === 0 ? <Empty icon="done" title="Nenhuma lacuna por enquanto">Quando um erro seu vier de uma habilidade do Fundamental, ela aparece aqui com o quanto pesa.</Empty> : null}
            {d.gaps.map((g) => (
              <div className="gap-box" key={g.name}>
                <div className="row-head"><span className="row-title">{g.name}</span><span className="pill warn tight">{g.grade}</span></div>
                <div className="note">Aparece em {g.errorShare}% dos seus erros recentes</div>
                <Bar pct={g.errorShare} tone="amber" size="h6" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export function StudentHome() {
  const query = useQuery({ queryKey: ["student"], queryFn: () => api.get<StudentDashboard>("/api/insights/student") });
  return <Async query={query}>{(d) => <Dashboard d={d} />}</Async>;
}
