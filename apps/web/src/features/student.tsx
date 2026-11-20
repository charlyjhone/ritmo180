// Painel do aluno.
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AREA_NAMES, type StudentDashboard } from "@ritmo/contracts";
import { STAGES } from "@ritmo/engine";
import { api } from "../lib/api.ts";
import { trainingLink } from "./focus-picker.tsx";
import { Async, Bar, clock, clockOrDash, LineChart, Metric, Metrics, PageHead, ScoreMetric, points, TimeStrip } from "../ui/kit.tsx";

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
        actions={<><Link className="btn" to="/treino">Começar treino do dia{planMinutes ? ` · ${planMinutes} min` : ""}</Link><Link className="btn soft" to="/treino">Escolher disciplina e assunto</Link></>}
      />
      {d.enem ? <div className="notice">{d.enem.daysLeft === 0 ? `Hoje é dia de ENEM ${d.enem.year}.` : `${d.enem.daysLeft === 1 ? "Falta 1 dia" : `Faltam ${d.enem.daysLeft} dias`} para a próxima prova do ENEM ${d.enem.year}${d.enem.estimated ? ", em data estimada" : ""}.`}{" "}<Link to="/plano">Ver seu plano</Link></div> : null}
      {d.diagnosticPending.length > 0 ? (
        <div className="notice">
          Faça o diagnóstico de {d.diagnosticPending.map((a) => AREA_NAMES[a]).join(", ")} para posicionar sua nota.{" "}
          <Link to={`/diagnostico/${d.diagnosticPending[0]}`}>Começar diagnóstico</Link>
        </div>
      ) : null}
      {d.reviews.due > 0 ? (
        <div className="notice">
          {d.reviews.due === 1 ? "1 questão para rever hoje" : `${d.reviews.due} questões para rever hoje`}, cerca de {Math.max(2, Math.round(d.reviews.due * 2))} minutos. Rever no dia certo é o que faz o conteúdo ficar até o ENEM.{" "}
          <Link to={trainingLink({ mistakes: true })}>Rever agora</Link>
        </div>
      ) : null}
      <WeeklyGoal goal={d.goal} />
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
            {d.plan.length === 0 ? <p className="sub">Você já praticou todas as questões disponíveis nas últimas semanas.</p> : null}
            {d.plan.map((t) => (
              <div className="row-box" key={t.kind}>
                <div className="tag mono">{t.kind === "REVISAO" ? "REVISÃO" : t.kind}</div>
                <div className="grow"><div className="row-title">{t.title} · {t.itemIds.length} questões</div><div className="row-sub">{t.reason}</div></div>
                <div className="mono note b">{t.minutes} min</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid-2">
        <section className="card" aria-labelledby="hab-title">
          <h2 id="hab-title">Seus assuntos no Método Ritmo</h2>
          <div className="stages">{STAGES.map((s, i) => <span key={s}>{i + 1} {s}</span>)}</div>
          <div style={{ marginTop: 12 }}>
            {d.skills.length === 0 ? <p className="sub">Os assuntos aparecem depois dos primeiros treinos.</p> : null}
            {d.skills.map((s) => (
              <div className="skill" key={s.topic}>
                <div className="skill-name">{s.topic}<small>{s.discipline} · {s.mastery}% de domínio · {s.attempts} {s.attempts === 1 ? "questão" : "questões"}</small></div>
                <div className="dots" role="img" aria-label={`Etapa ${s.stage} de 5`}>{[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= s.stage ? "on" : ""} />)}</div>
                <div className="skill-stage">{s.stage} · {s.stageName}</div>
                {s.discipline ? <Link className="btn soft slim skill-train" to={trainingLink(s)} aria-label={`Treinar ${s.topic}`}>Treinar</Link> : null}
              </div>
            ))}
          </div>
        </section>
        <section className="card" aria-labelledby="pre-title">
          <h2 id="pre-title">Pré-requisitos do Fundamental que ainda pesam</h2>
          <p className="sub">O motor rastreou seus erros até a habilidade de origem. Fechar estas lacunas acelera várias questões ao mesmo tempo.</p>
          <div className="stack">
            {d.gaps.length === 0 ? <p className="sub">Nenhuma lacuna identificada ainda.</p> : null}
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
