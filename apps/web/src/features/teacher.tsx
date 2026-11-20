// Painel do professor: turma, mapa de domínio, pegadinhas, alertas e ações que gravam de verdade.
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AREA_NAMES, type ClassRef, type TeacherDashboard } from "@ritmo/contracts";
import { api, ApiError } from "../lib/api.ts";
import { ClassExams } from "./class-exams.tsx";
import { Async, Bar, clock, clockOrDash, Metric, Metrics, PageHead, Pill, saveFile, points, TimeStrip } from "../ui/kit.tsx";
import { useToast } from "../ui/toast.tsx";

const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
const ACTION_LABEL = { ver_trilha: "Enviar trilha", enviar_sprints: "Enviar sprints", avisar_familia: "Avisar família" };

const dueLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

function NewAssignment({ d, onCreated }: { d: TeacherDashboard; onCreated: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const topic = String(form.get("topic"));
    const studentId = String(form.get("studentId") || "") || undefined;
    try {
      await api.post("/api/teacher/assignments", {
        classId: d.class.id, topic, studentId, title: String(form.get("title") || `Tarefa de ${topic}`).trim() || `Tarefa de ${topic}`,
        questions: Number(form.get("questions")), dueOn: String(form.get("dueOn") || "") || undefined,
      });
      toast("Tarefa enviada.");
      setOpen(false);
      onCreated();
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "Não foi possível enviar a tarefa.");
    }
  }
  if (!open) return <button className="btn" type="button" onClick={() => setOpen(true)}>Nova tarefa</button>;
  return (
    <form onSubmit={(e) => void submit(e)}>
      <div className="form-grid" style={{ marginTop: 8 }}>
        <label className="field">Assunto
          <select className="input" name="topic" required defaultValue={d.heat.topics[0] ?? ""}>
            {d.assignableTopics.map((t) => <option key={`${t.discipline}${t.topic}`} value={t.topic}>{t.discipline} · {t.topic} ({t.items})</option>)}
          </select>
        </label>
        <label className="field">Para quem
          <select className="input" name="studentId" defaultValue="">
            <option value="">A turma inteira</option>
            {d.heat.rows.map((r) => <option key={r.studentId} value={r.studentId}>{r.name}</option>)}
          </select>
        </label>
        <label className="field">Título (opcional)<input className="input" name="title" maxLength={120} placeholder="Revisão para a prova" /></label>
        <label className="field">Questões<input className="input" name="questions" type="number" min={1} max={100} defaultValue={10} required /></label>
        <label className="field">Prazo<input className="input" name="dueOn" type="date" defaultValue={inDays(7)} /></label>
      </div>
      <div className="btn-row"><button className="btn" type="submit">Enviar tarefa</button><button className="btn soft" type="button" onClick={() => setOpen(false)}>Cancelar</button></div>
    </form>
  );
}

function Board({ d, refresh }: { d: TeacherDashboard; refresh: () => void }) {
  const toast = useToast();
  const weakest = d.heat.topics[0];
  const m = d.metrics;

  async function run(action: () => Promise<unknown>, done: string) {
    try {
      await action();
      toast(done);
      refresh();
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "Não foi possível concluir.");
    }
  }
  const sendTrail = (topic: string, studentId?: string, who = "a turma") =>
    run(() => api.post("/api/teacher/assignments", { classId: d.class.id, topic, title: `Trilha de ${topic}`, studentId, questions: 10, dueOn: inDays(7) }), `Trilha de ${topic} enviada para ${who}.`);

  function exportCsv() {
    const header = ["Aluno", ...d.heat.topics, "Índice Ritmo"];
    const rows = d.heat.rows.map((r) => [r.name, ...r.cells.map((c) => (c === null ? "" : `${c}%`)), r.ritmo === null ? "" : `${r.ritmo}%`]);
    saveFile(`${d.class.name}.csv`, [header, ...rows].map((r) => r.join(";")).join("\n"));
  }

  function alertAction(a: TeacherDashboard["alerts"][number]) {
    if (a.action === "avisar_familia") return run(() => api.post("/api/teacher/notify-family", { studentId: a.studentId, message: `${a.why}. Pedimos ajuda para retomar a rotina de 15 minutos por dia.` }), `Recado enviado à família de ${a.name}.`);
    return weakest ? sendTrail(weakest, a.studentId, a.name) : undefined;
  }

  return (
    <>
      <PageHead
        kicker={`${d.class.subject ?? "Coordenação"} · ${d.class.name} · ${d.class.students} alunos`}
        title={d.headline}
        actions={
          <div className="page-actions">
            <button className="btn outline" type="button" onClick={exportCsv}>Exportar planilha</button>
            <button className="btn outline" type="button" onClick={() => window.print()}>Imprimir ou salvar PDF</button>
            <a className="btn outline" href="#simulados">Simulados</a>
            {weakest ? <button className="btn" type="button" onClick={() => void sendTrail(weakest)}>Enviar trilha de {weakest} à turma</button> : null}
          </div>
        }
      />
      <Metrics label="Indicadores da turma">
        <Metric label="Índice Ritmo da turma" value={m.ritmo === null ? "—" : `${m.ritmo}%`} note={m.ritmoDelta === null ? undefined : `${points(m.ritmoDelta)} na semana`} tone={(m.ritmoDelta ?? 0) >= 0 ? "up" : "down"} />
        <Metric label="Tempo médio por questão" value={clockOrDash(m.avgSeconds)} valueTone="amber" note={`Meta: ${clock(m.goalSeconds)}`} />
        <Metric label={`Nota TRI estimada · ${m.score?.area ?? "—"}`} value={m.score?.score ?? "—"} note={m.score?.score != null ? `Média da turma` : "Faltam respostas de prova"} />
        <Metric label="Alunos ativos na semana" value={`${m.activeWeek} / ${m.total}`} note={m.total > m.activeWeek ? `${m.total - m.activeWeek} sem treinar nesta semana` : "Todos treinaram"} tone={m.total > m.activeWeek ? "down" : "up"} />
      </Metrics>
      <section className="card" aria-labelledby="heat-title">
        <div className="card-head">
          <h2 className="lg" id="heat-title">Domínio por assunto{weakest ? `: ${weakest} é o mais fraco` : ""}</h2>
          <div className="heat-legend"><span>0%</span><i className="h0" /><i className="h1" /><i className="h2" /><i className="h3" /><i className="h4" /><span>100%</span></div>
        </div>
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table className="heat">
            <thead><tr><th scope="col">Aluno</th>{d.heat.topics.map((t) => <th scope="col" key={t}>{t}</th>)}<th scope="col">Índice Ritmo</th></tr></thead>
            <tbody>
              {d.heat.rows.map((r) => (
                <tr key={r.studentId}>
                  <th scope="row">{r.name}</th>
                  {r.cells.map((v, i) => <td key={i} className={v === null ? "mono empty" : `mono h${Math.min(4, Math.floor(v / 20))}`}>{v === null ? "—" : `${v}%`}</td>)}
                  <td className="mono idx">{r.ritmo === null ? "—" : `${r.ritmo}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="grid-2">
        <section className="card" aria-labelledby="gar-title">
          <h2 id="gar-title">{d.time ? `Raio-X da turma: ${clock(d.time.readMs / 1000)} por questão só na leitura` : "Raio-X da turma"}</h2>
          {d.time ? <TimeStrip small read={d.time.readMs} path={d.time.pathMs} calc={d.time.calcMs} check={d.time.checkMs} /> : <p className="sub">Sem treinos guiados no período.</p>}
          {d.suggestion ? <p className="sub" style={{ marginTop: 14, lineHeight: 1.55 }}>{d.suggestion}</p> : null}
        </section>
        <section className="card" aria-labelledby="peg-title">
          <h2 id="peg-title">Pegadinhas que mais pegam a turma</h2>
          <div className="stack" style={{ gap: 14 }}>
            {d.traps.length === 0 ? <p className="sub">Sem dados suficientes.</p> : null}
            {d.traps.map((t) => (
              <div key={t.name}>
                <div className="row-head"><span>{t.name}</span><span className="mono">{t.share}%</span></div>
                <div style={{ fontSize: 12, color: "var(--muted)", margin: "2px 0 6px" }}>{t.where}</div>
                <Bar pct={t.share * 2} tone="amber" />
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="grid-2">
        <section className="card" aria-labelledby="alert-title">
          <h2 id="alert-title">Alunos que precisam de atenção agora</h2>
          <div className="stack" style={{ gap: 10 }}>
            {d.alerts.length === 0 ? <p className="sub">Nenhum alerta nesta turma.</p> : null}
            {d.alerts.map((a) => (
              <div className="row-box" style={{ padding: "12px 14px" }} key={a.studentId}>
                <div className="avatar" aria-hidden="true" style={{ fontSize: 13, margin: 0 }}>{initials(a.name)}</div>
                <div className="grow">
                  <div className="row-title">{a.name} {a.severity === "high" ? <Pill tone="warn">Prioridade</Pill> : null}</div>
                  <div className="row-sub" style={{ marginTop: 0 }}>{a.why}</div>
                  <div className="row-sub">Sugestão de conversa: {a.talk}</div>
                </div>
                <button className="btn soft slim" type="button" onClick={() => void alertAction(a)}>{ACTION_LABEL[a.action]}</button>
              </div>
            ))}
          </div>
        </section>
        <section className="card" aria-labelledby="rev-title">
          <h2 id="rev-title">Questões sinalizadas para sua revisão: {d.flags.length}</h2>
          <p className="sub">Só chegam aqui as questões que a estatística de uso sinalizou.</p>
          <div className="stack" style={{ gap: 10 }}>
            {d.flags.map((f) => (
              <div className="flag" key={f.id}>
                <div className="flag-head mono">{f.label}<span>{f.area}</span></div>
                <p>{f.why}</p>
                <div className="btn-row">
                  <button className="btn slim" type="button" onClick={() => void run(() => api.post(`/api/teacher/flags/${f.id}`, { resolution: "kept" }), "Questão mantida.")}>Manter</button>
                  <button className="btn outline slim" type="button" onClick={() => void run(() => api.post(`/api/teacher/flags/${f.id}`, { resolution: "retired" }), "Questão retirada do banco.")}>Descartar item</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="grid-2">
        <section className="card" aria-labelledby="hab-title">
          <h2 id="hab-title">Habilidades do ENEM em que a turma mais erra</h2>
          <p className="sub">Pela Matriz de Referência do INEP, no último mês. Só entram habilidades com pelo menos 10 respostas.</p>
          <div className="stack" style={{ gap: 12 }}>
            {d.skills.length === 0 ? <p className="sub">Ainda não há respostas suficientes em questões com habilidade identificada.</p> : null}
            {d.skills.map((k) => (
              <div key={`${k.area}${k.skill}`}>
                <div className="row-head"><span><b>{k.skill}</b> de {AREA_NAMES[k.area]}</span><span className="mono">{k.accuracy}% de acerto</span></div>
                <div className="note" style={{ margin: "2px 0 6px" }}>{k.answers} respostas · aparece em {k.topics.join(", ")}</div>
                <Bar pct={k.accuracy} tone={k.accuracy < 50 ? "amber" : ""} />
              </div>
            ))}
          </div>
        </section>
        <section className="card" aria-labelledby="desafio-title">
          <h2 id="desafio-title">Desafio da semana: {d.challenge.done} de {d.challenge.target} questões</h2>
          <Bar pct={d.challenge.target ? Math.min(100, (d.challenge.done / d.challenge.target) * 100) : 0} tone={d.challenge.done >= d.challenge.target && d.challenge.target ? "ok" : ""} />
          <p className="sub">Meta coletiva de {d.challenge.target / Math.max(1, d.challenge.students)} questões por aluno. {d.challenge.steady} de {d.challenge.students} alunos treinaram em {d.challenge.steadyDays} dias ou mais. Os alunos veem só o total da turma, sem ranking.</p>
        </section>
      </div>
      <section className="card" aria-labelledby="tar-title">
        <div className="card-head">
          <h2 id="tar-title">Tarefas da turma</h2>
          <NewAssignment d={d} onCreated={refresh} />
        </div>
        <div className="stack" style={{ marginTop: 12 }}>
          {d.assignments.length === 0 ? <p className="sub">Nenhuma tarefa nos últimos 30 dias. A tarefa aparece no painel do aluno e o assunto sobe no treino dele.</p> : null}
          {d.assignments.map((a) => (
            <div className="row-box" key={a.id}>
              <div className="grow">
                <div className="row-title">{a.title}</div>
                <div className="row-sub">{a.studentName ?? "Turma inteira"} · {a.questions} questões de {a.topic}{a.dueOn ? ` · até ${dueLabel(a.dueOn)}` : ""}</div>
                <div style={{ marginTop: 6 }}><Bar pct={a.total ? (a.completed / a.total) * 100 : 0} tone={a.completed >= a.total ? "ok" : ""} size="h6" /></div>
              </div>
              <span className="mono note b">{a.completed}/{a.total} fizeram</span>
            </div>
          ))}
        </div>
      </section>
      <ClassExams classId={d.class.id} className={d.class.name} />
    </>
  );
}

function ClassBoard({ classes }: { classes: ClassRef[] }) {
  const client = useQueryClient();
  const [classId, setClassId] = useState(classes.at(-1)?.id ?? "");
  const query = useQuery({ queryKey: ["class", classId], queryFn: () => api.get<TeacherDashboard>(`/api/teacher/classes/${classId}`), enabled: !!classId });
  return (
    <div className="page">
      <label className="field-sm" style={{ maxWidth: 240 }}>Turma
        <select value={classId} onChange={(e) => setClassId(e.target.value)}>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <Async query={query}>{(d) => <Board d={d} refresh={() => void client.invalidateQueries({ queryKey: ["class", classId] })} />}</Async>
    </div>
  );
}

export function TeacherHome() {
  const query = useQuery({ queryKey: ["classes"], queryFn: () => api.get<ClassRef[]>("/api/teacher/classes") });
  return <Async query={query}>{(classes) => classes.length ? <ClassBoard classes={classes} /> : <div className="state"><Pill tone="warn">Nenhuma turma atribuída a você.</Pill></div>}</Async>;
}
