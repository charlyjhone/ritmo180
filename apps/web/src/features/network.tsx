// Administração da rede: conteúdo real, escolas, calibração e integridade. Sem dado individual de aluno.
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ItemSuggestionView, LessonSuggestionView, Milestone, NetworkDashboard } from "@ritmo/contracts";
import { api, ApiError } from "../lib/api.ts";
import { Async, Empty, Html, Metric, Metrics, number, PageHead, Pill } from "../ui/kit.tsx";
import { useToast } from "../ui/toast.tsx";

interface ReviewItem {
  id: string;
  discipline: string;
  topic: string;
  contextHtml: string;
  stemHtml: string;
  alternatives: { letter: string; html: string; trap?: string }[];
  answer: string;
  solutionHtml: string;
}

function NewSchool() {
  const navigate = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const { id } = await api.post<{ id: string }>("/api/schools", form);
      navigate(`/implantacao/${id}`);
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "Não foi possível cadastrar.");
    }
  }
  if (!open) return <button className="btn" type="button" onClick={() => setOpen(true)}>Cadastrar nova escola</button>;
  return (
    <form className="card" style={{ width: "100%" }} onSubmit={submit}>
      <div className="form-grid" style={{ marginTop: 0 }}>
        <label className="field">Nome da escola<input className="input" name="name" required minLength={3} /></label>
        <label className="field">Cidade<input className="input" name="city" required minLength={2} /></label>
        <label className="field">Séries atendidas<input className="input" name="grades" required minLength={2} placeholder="Ensino Médio" /></label>
      </div>
      <div className="btn-row"><button className="btn" type="submit">Abrir implantação</button><button className="btn soft" type="button" onClick={() => setOpen(false)}>Cancelar</button></div>
    </form>
  );
}

function ReviewQueue() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["review"], queryFn: () => api.get<ReviewItem[]>("/api/content/review") });
  async function decide(id: string, approved: boolean) {
    await api.post(`/api/content/review/${id}`, { approved });
    await client.invalidateQueries({ queryKey: ["review"] });
    await client.invalidateQueries({ queryKey: ["network"] });
  }
  return (
    <section className="card" aria-labelledby="rev-title">
      <h2 id="rev-title">Questões aguardando revisão</h2>
      <Async query={query}>
        {(items) => items.length === 0 ? <p className="sub">Nada na fila.</p> : (
          <div className="stack">
            {items.map((item) => (
              <div className="flag" key={item.id}>
                <div className="flag-head">{item.discipline}<span>{item.topic} · gabarito {item.answer}</span></div>
                <Html html={item.contextHtml + item.stemHtml} />
                <ol className="review-alts">
                  {item.alternatives.map((a) => (
                    <li key={a.letter} className={a.letter === item.answer ? "right" : undefined}>
                      <b>{a.letter})</b> <Html className="inline" html={a.html} />
                      {a.letter === item.answer ? <span className="sub"> · gabarito</span> : a.trap ? <span className="sub"> · erro previsto: {a.trap.replace(/<[^>]+>/g, "")}</span> : null}
                    </li>
                  ))}
                </ol>
                {item.solutionHtml ? <><p className="sub"><b>Resolução</b></p><Html html={item.solutionHtml} /></> : null}
                <div className="btn-row">
                  <button className="btn slim" type="button" onClick={() => void decide(item.id, true)}>Aprovar</button>
                  <button className="btn outline slim" type="button" onClick={() => void decide(item.id, false)}>Recusar</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Async>
    </section>
  );
}

function SuggestionQueue() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["suggestions"], queryFn: () => api.get<ItemSuggestionView[]>("/api/content/suggestions") });
  async function decide(id: string, approved: boolean) {
    await api.post(`/api/content/suggestions/${id}`, { approved });
    await client.invalidateQueries({ queryKey: ["suggestions"] });
  }
  return (
    <section className="card" aria-labelledby="sug-title">
      <h2 id="sug-title">Resoluções de IA aguardando revisão</h2>
      <Async query={query}>
        {(items) => items.length === 0 ? <p className="sub">Nada na fila.</p> : (
          <div className="stack">
            {items.map((item) => (
              <div className="flag" key={item.itemId}>
                <div className="flag-head">{item.discipline}<span>{item.topic} · gabarito {item.answer}</span></div>
                <Html html={item.questionHtml} />
                <p className="sub"><b>Resolução proposta</b></p>
                <Html html={item.solutionHtml} />
                <p className="sub"><b>Dica:</b> {item.hint}</p>
                {Object.entries(item.traps).map(([letter, trap]) => <p className="sub" key={letter}><b>{letter}:</b> {String(trap)}</p>)}
                <div className="btn-row">
                  <button className="btn slim" type="button" onClick={() => void decide(item.itemId, true)}>Aprovar</button>
                  <button className="btn outline slim" type="button" onClick={() => void decide(item.itemId, false)}>Recusar</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Async>
    </section>
  );
}

function LessonQueue() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["lesson-review"], queryFn: () => api.get<LessonSuggestionView[]>("/api/lessons/review") });
  async function decide(lesson: LessonSuggestionView, approved: boolean) {
    await api.post("/api/lessons/review", { discipline: lesson.discipline, topic: lesson.topic, approved });
    await client.invalidateQueries({ queryKey: ["lesson-review"] });
  }
  return (
    <section className="card" aria-labelledby="lesson-rev-title">
      <h2 id="lesson-rev-title">Aulas rápidas de IA aguardando revisão</h2>
      <p className="sub">Só depois de aprovada a aula aparece para os alunos. Para gerar novas, rode <code>npm run content:aulas -- 20</code>.</p>
      <Async query={query}>
        {(lessons) => lessons.length === 0 ? <p className="sub">Nada na fila.</p> : (
          <div className="stack">
            {lessons.map((lesson) => (
              <details className="flag" key={`${lesson.discipline}${lesson.topic}`}>
                <summary className="flag-head">{lesson.discipline}<span>{lesson.topic} · {lesson.title}</span></summary>
                <p className="sub"><b>O essencial</b></p>
                <Html className="lesson-body" html={lesson.explanationHtml} />
                <p className="sub"><b>Exemplo resolvido</b></p>
                <Html className="lesson-body" html={lesson.exampleHtml} />
                <p className="sub"><b>Pegadinhas do ENEM</b></p>
                <Html className="lesson-body" html={lesson.pitfallsHtml} />
                <div className="btn-row">
                  <button className="btn slim" type="button" onClick={() => void decide(lesson, true)}>Aprovar</button>
                  <button className="btn outline slim" type="button" onClick={() => void decide(lesson, false)}>Recusar</button>
                </div>
              </details>
            ))}
          </div>
        )}
      </Async>
    </section>
  );
}

const fullDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR");

/** Datas do edital do ENEM. Só a rede cadastra, e só depois de conferir no site do INEP. */
function EnemCalendar() {
  const client = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: ["calendar"], queryFn: () => api.get<Milestone[]>("/api/study/calendar") });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    try {
      await api.post("/api/study/calendar", { title: form.get("title"), startsOn: form.get("startsOn"), endsOn: String(form.get("endsOn") || "") || null, note: form.get("note") });
      target.reset();
      toast("Data cadastrada.");
      await client.invalidateQueries({ queryKey: ["calendar"] });
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "Não foi possível cadastrar.");
    }
  }
  async function del(m: Milestone) {
    try {
      await api.del(`/api/study/calendar/${m.id}`);
      toast("Data removida.");
      await client.invalidateQueries({ queryKey: ["calendar"] });
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "Não foi possível remover.");
    }
  }
  return (
    <section className="card" aria-labelledby="enem-cal-title">
      <h2 id="enem-cal-title">Calendário do ENEM</h2>
      <p className="sub">Cadastre as datas do edital (isenção, inscrição, provas, resultados) depois de conferir no site do INEP. Os alunos veem as próximas no Plano.</p>
      <form onSubmit={(e) => void submit(e)}>
        <div className="form-grid" style={{ marginTop: 8 }}>
          <label className="field">O quê<input className="input" name="title" required minLength={3} maxLength={120} placeholder="Inscrições do ENEM" /></label>
          <label className="field">Início<input className="input" name="startsOn" type="date" required /></label>
          <label className="field">Fim (opcional)<input className="input" name="endsOn" type="date" /></label>
          <label className="field">Observação (opcional)<input className="input" name="note" maxLength={300} placeholder="Pelo site do INEP" /></label>
        </div>
        <div className="btn-row"><button className="btn" type="submit">Cadastrar data</button></div>
      </form>
      <Async query={query}>
        {(list) => (
          <div className="stack" style={{ marginTop: 12 }}>
            {list.length === 0 ? <Empty icon="calendar" title="Nenhuma data cadastrada">Cadastre as datas oficiais quando o INEP publicar o edital.</Empty> : null}
            {list.map((m) => (
              <div className="row-box" key={m.id}>
                <div className="grow"><div className="row-title">{m.title}</div><div className="row-sub">{fullDate(m.startsOn)}{m.endsOn ? ` a ${fullDate(m.endsOn)}` : ""}{m.note ? ` · ${m.note}` : ""}</div></div>
                <button className="btn soft slim" type="button" onClick={() => void del(m)}>Remover</button>
              </div>
            ))}
          </div>
        )}
      </Async>
    </section>
  );
}

function Board({ d }: { d: NetworkDashboard }) {
  const m = d.metrics;
  const maxFunnel = Math.max(1, ...d.funnel.map((f) => f.count));
  const bankMax = Math.max(1, ...d.bank.map((b) => b.official + b.calibrated + b.calibrating));
  const share = (v: number) => `${(v / bankMax) * 100}%`;
  const c = d.calibration;
  const specs: [string, string | number, string][] = [["Modelo em uso", c.model, ""], ["Itens calibrados", c.calibrated, "mono"], ["Itens em calibração nos treinos", c.calibrating, "mono"], ["Retirados após revisão", c.reclassified, "mono"], ["Descartados por baixa discriminação", c.discarded, "mono"]];
  const i = d.integrity;
  const rate = (n: number) => `${i.responses ? ((n / i.responses) * 100).toFixed(1).replace(".", ",") : "0"}%`;
  return (
    <div className="page">
      <PageHead kicker="Visão da rede" title={d.headline} actions={<NewSchool />} />
      <Metrics label="Indicadores da rede">
        <Metric label="Escolas no ar" value={m.schools} note={`${m.onboarding} em implantação`} />
        <Metric label="Alunos ativos na semana" value={number(m.activeStudents)} note={`${m.activeDelta >= 0 ? "+" : ""}${m.activeDelta} em relação à semana anterior`} tone={m.activeDelta >= 0 ? "up" : "down"} />
        <Metric label="Questões publicadas" value={number(m.items)} note={`${m.official} oficiais · ${m.authored} autorais · ${m.generated} geradas`} />
        <Metric label="Respostas registradas" value={number(m.responses)} note="Alimentam a calibração TRI" />
      </Metrics>
      <section className="card" aria-labelledby="funil-title">
        <h2 className="lg" id="funil-title">Validação das questões geradas por IA</h2>
        <p className="sub">Toda questão gerada passa por estas etapas e só é publicada depois da revisão de uma pessoa.</p>
        {d.funnel[0]?.count === 0 ? <Empty icon="list" title="Nenhuma questão gerada até agora" /> : (
          <div className="funnel">
            {d.funnel.map((s) => (
              <div className="funnel-row" key={s.name}>
                <div className="funnel-name">{s.name}</div>
                <div className="funnel-track"><div className="funnel-bar mono" style={{ width: `${Math.max(6, (s.count / maxFunnel) * 100)}%` }}>{number(s.count)}</div></div>
                <div className="funnel-note">{s.note}</div>
              </div>
            ))}
          </div>
        )}
      </section>
      <ReviewQueue />
      <SuggestionQueue />
      <LessonQueue />
      <EnemCalendar />
      <section className="card" aria-labelledby="esc-title">
        <h2 id="esc-title">Escolas</h2>
        <div className="table-wrap">
          <table className="tbl min-820">
            <thead><tr><th scope="col">Escola</th><th scope="col">Cidade</th><th scope="col">Séries</th><th scope="col">Alunos ativos</th><th scope="col">Índice Ritmo</th><th scope="col">Marca própria</th><th scope="col">Situação</th></tr></thead>
            <tbody>
              {d.schools.map((s) => (
                <tr key={s.id}>
                  <td className="b"><Link to={`/implantacao/${s.id}`}>{s.name}</Link></td><td className="soft">{s.city}</td><td className="soft">{s.grades}</td>
                  <td className="mono">{s.active ?? "—"}</td><td className="mono b">{s.ritmo === null ? "—" : `${s.ritmo}%`}</td><td className="soft">{s.ownBrand ? "Sim" : "Não"}</td>
                  <td><Pill tone={`${s.status === "No ar" ? "good" : "warn"} tight`}>{s.status}{s.isDemo ? " · demonstração" : ""}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="grid-2">
        <section className="card" aria-labelledby="banco-title">
          <h2 id="banco-title">Banco de questões por área</h2>
          <div className="series-legend"><span><i className="s1" />Com parâmetro oficial</span><span><i className="s2" />Calibradas</span><span><i className="s3" />Em calibração</span></div>
          <div className="stack" style={{ gap: 14 }}>
            {d.bank.map((b) => (
              <div key={b.area}>
                <div className="row-head"><span>{b.name}</span><span className="mono">{number(b.official + b.calibrated + b.calibrating)}</span></div>
                <div className="stack-bar"><div className="s1" style={{ width: share(b.official) }} /><div className="s2" style={{ width: share(b.calibrated) }} /><div className="s3" style={{ width: share(b.calibrating) }} /></div>
                {b.catalogOnly ? <div className="note" style={{ marginTop: 4 }}>{number(b.catalogOnly)} catalogadas aguardando o texto</div> : null}
              </div>
            ))}
          </div>
        </section>
        <section className="card" aria-labelledby="cal-title">
          <h2 id="cal-title">Calibração TRI</h2>
          <div style={{ marginTop: 14 }}>
            {specs.map(([label, value, font]) => <div className="spec" key={label}><span>{label}</span><b className={font}>{value}</b></div>)}
          </div>
          <p className="note" style={{ margin: "10px 0 0", color: "var(--body)", lineHeight: 1.5 }}>Um item só é calibrado com 200 respostas ou mais, comparadas a questões-âncora.</p>
        </section>
      </div>
      <section className="card" aria-labelledby="thin-title">
        <h2 id="thin-title">{d.thinTopics.total ? `${d.thinTopics.total} ${d.thinTopics.total === 1 ? "assunto tem" : "assuntos têm"} menos de ${d.thinTopics.threshold} questões` : "Assuntos com poucas questões"}</h2>
        <p className="sub">Com poucas questões, o aluno repete exercício em poucos dias. É onde o próximo lote de conteúdo rende mais.</p>
        {d.thinTopics.topics.length === 0 ? <Empty icon="done" title={`Todos os assuntos têm ${d.thinTopics.threshold} questões ou mais`} /> : (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="tbl">
              <thead><tr><th scope="col">Assunto</th><th scope="col">Disciplina</th><th scope="col">Questões</th><th scope="col">Aula</th></tr></thead>
              <tbody>
                {d.thinTopics.topics.map((t) => (
                  <tr key={`${t.discipline}${t.topic}`}>
                    <td className="b">{t.topic}</td><td>{t.discipline}</td><td className="mono b">{t.items}</td>
                    <td>{t.hasLesson ? <Pill tone="good tight">Tem aula</Pill> : <Pill tone="warn tight">Sem aula</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {d.thinTopics.total > d.thinTopics.topics.length ? <p className="note" style={{ marginTop: 10 }}>Mostrando os {d.thinTopics.topics.length} com menos questões.</p> : null}
      </section>
      <section className="card" aria-labelledby="int-title">
        <h2 id="int-title">Integridade dos dados: {i.share.toString().replace(".", ",")}% das respostas ficaram fora da calibração</h2>
        <p className="sub">Respostas com padrão incompatível com resolução real não entram no Índice Ritmo nem na calibração. Não há punição automática.</p>
        <div className="grid-metrics" style={{ gap: 12, marginTop: 16 }}>
          {([["Rápidas demais para ler", i.tooFast, "Tempo incompatível com o tamanho do texto"], ["Pausa longa e acerto perfeito", i.awayThenPerfect, "Saiu da tela e voltou com a resposta"], ["Chute em sequência", i.guessStreak, "Várias respostas em poucos segundos"]] as const).map(([label, value, detail]) => (
            <div className="mini" style={{ padding: "14px 16px" }} key={label}>
              <div className="metric-label">{label}</div>
              <div className="mono" style={{ fontSize: 26 }}>{rate(value)}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{detail}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function NetworkHome() {
  const query = useQuery({ queryKey: ["network"], queryFn: () => api.get<NetworkDashboard>("/api/insights/network") });
  return <Async query={query}>{(d) => <Board d={d} />}</Async>;
}
