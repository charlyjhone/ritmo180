// Simulado: lista, prova com triagem e mapa, e resultado comentado.
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ExamResultView, ExamSittingView, ExamSummary, Letter } from "@ritmo/contracts";
import { paceBalance } from "@ritmo/engine";
import { api, ApiError } from "../lib/api.ts";
import { Async, Bar, clock, Html, Metric, Metrics, PageHead, Pill, ScoreMetric, signed, useInterval } from "../ui/kit.tsx";
import { useToast } from "../ui/toast.tsx";

type Triage = "answered" | "later" | "skipped";
interface Mark {
  choice: Letter | null;
  triage: Triage;
  timeMs: number;
}

const hhmmss = (s: number) => {
  const v = Math.max(0, Math.round(s));
  return `${Math.floor(v / 3600)}:${String(Math.floor(v / 60) % 60).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
};
const CELL_CLASS: Record<Triage, string> = { answered: "done", later: "later", skipped: "skip" };
const CELL_LABEL: Record<Triage, string> = { answered: "respondida", later: "adiada", skipped: "pulada" };

export function ExamList() {
  const navigate = useNavigate();
  const toast = useToast();
  const query = useQuery({ queryKey: ["exams"], queryFn: () => api.get<ExamSummary[]>("/api/exams") });
  async function start(id: string) {
    try {
      const { sittingId } = await api.post<{ sittingId: string }>(`/api/exams/${id}/start`);
      navigate(`/simulado/${sittingId}`);
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "O simulado precisa de internet.");
    }
  }
  return (
    <div className="page">
      <PageHead kicker="Simulado" title="Provas disponíveis para a sua turma" />
      <div className="notice">O simulado precisa de internet. O gabarito só aparece depois da entrega e a prova conta para a sua nota.</div>
      <Async query={query}>
        {(exams) => exams.length === 0 ? <div className="state">Nenhuma prova foi publicada para a sua turma.</div> : (
          <div className="stack">
            {exams.map((e) => (
              <div className="row-box" key={e.id}>
                <div className="grow"><div className="row-title">{e.title}</div><div className="row-sub">{e.questions} questões · {e.durationMinutes} minutos</div></div>
                {e.sitting?.finished ? <Link className="btn outline" to={`/simulado/${e.sitting.id}/resultado`}>Ver resultado</Link>
                  : <button className="btn" type="button" onClick={() => void start(e.id)}>{e.sitting ? "Continuar" : "Começar"}</button>}
              </div>
            ))}
          </div>
        )}
      </Async>
    </div>
  );
}

function Sitting({ view }: { view: ExamSittingView }) {
  const navigate = useNavigate();
  const toast = useToast();
  const client = useQueryClient();
  const offset = useRef(view.serverNow - Date.now());
  const [marks, setMarks] = useState<Record<number, Mark>>(() => Object.fromEntries(view.responses.map((r) => [r.position, { choice: r.choice, triage: r.triage, timeMs: r.timeMs }])));
  const [current, setCurrent] = useState(0);
  const [choice, setChoice] = useState<Letter | null>(null);
  const shownAt = useRef(Date.now());
  const [, redraw] = useState(0);
  useInterval(() => redraw((n) => n + 1), 1000);

  const elapsed = (Date.now() + offset.current - view.startedAt) / 1000;
  const remaining = view.durationSeconds - elapsed;
  const total = view.items.length;
  const list = Object.values(marks);
  const processed = list.length;
  const balance = paceBalance(elapsed, processed, view.secondsPerQuestion);
  const paceMinutes = Math.round(balance / 60);
  const count = (t: Triage) => list.filter((m) => m.triage === t).length;
  const item = view.items[current]!;

  async function finish() {
    await api.post(`/api/sittings/${view.id}/finish`);
    await client.invalidateQueries({ queryKey: ["exams"] });
    await client.invalidateQueries({ queryKey: ["student"] });
    navigate(`/simulado/${view.id}/resultado`, { replace: true });
  }
  useEffect(() => {
    if (remaining <= 0) void finish();
  }, [remaining <= 0]);
  useEffect(() => {
    shownAt.current = Date.now();
    setChoice(marks[current]?.choice ?? null);
  }, [current]);

  function goNext() {
    for (let i = 1; i <= total; i++) {
      const next = (current + i) % total;
      if (!marks[next] || marks[next].triage !== "answered") {
        setCurrent(next);
        return;
      }
    }
  }

  async function mark(triage: Triage) {
    const timeMs = (marks[current]?.timeMs ?? 0) + (Date.now() - shownAt.current);
    const entry: Mark = { choice: triage === "answered" ? choice : null, triage, timeMs };
    try {
      await api.put(`/api/sittings/${view.id}/responses`, { position: current, ...entry });
      setMarks({ ...marks, [current]: entry });
      goNext();
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "Sem conexão: sua resposta não foi salva. Tente de novo.");
    }
  }

  return (
    <div className="page">
      <PageHead size="t30" kicker={`${view.title} · ${total} questões`} title={`Questão ${current + 1}: decida se resolve, adia ou pula`} actions={<button className="btn outline" type="button" onClick={() => { if (window.confirm("Entregar a prova agora?")) void finish(); }}>Entregar prova</button>} />
      <Metrics label="Situação da prova">
        <Metric label="Tempo restante" value={hhmmss(remaining)} note={`${clock(view.secondsPerQuestion)} por questão`} />
        <Metric label="Ritmo" value={`${signed(paceMinutes)} min`} valueTone={paceMinutes >= 0 ? "ok" : "amber"} note={paceMinutes === 0 ? "no ritmo do plano" : paceMinutes > 0 ? "adiantado em relação ao plano" : "atrasado em relação ao plano"} />
        <Metric label="Respondidas" value={`${count("answered")} / ${total}`} note={`${count("later")} adiadas · ${count("skipped")} puladas de propósito`} />
      </Metrics>
      <section className="card exam-q" aria-labelledby="q-title">
        <h2 id="q-title" className="label-caps">QUESTÃO {current + 1}</h2>
        {item.contextHtml ? <Html className="q-html" html={item.contextHtml} /> : null}
        <Html className="q-html b" html={item.stemHtml} />
        <div className="alts">
          {item.alternatives.map((alt) => (
            <button key={alt.letter} className={`alt ${choice === alt.letter ? "selected" : ""}`} type="button" aria-pressed={choice === alt.letter} onClick={() => setChoice(alt.letter)}>
              <span className="mono">{alt.letter}</span><Html html={alt.html} />
            </button>
          ))}
        </div>
        <p className="sub">Na TRI, garantir as fáceis vale mais do que brigar com as difíceis.</p>
        <div className="btn-row" style={{ gap: 10 }}>
          <button className="btn" type="button" disabled={!choice} onClick={() => void mark("answered")}>Responder</button>
          <button className="btn later" type="button" onClick={() => void mark("later")}>Adiar para o fim</button>
          <button className="btn soft" type="button" onClick={() => void mark("skipped")}>Pular de propósito</button>
        </div>
      </section>
      <section className="card" aria-labelledby="mapa-title">
        <div className="card-head">
          <h2 id="mapa-title">Mapa da prova</h2>
          <div className="map-legend"><span><i className="done" />Respondida</span><span><i className="later" />Adiada</span><span><i className="skip" />Pulada</span><span><i className="current" />Atual</span></div>
        </div>
        <div className="cells">
          {view.items.map((_, i) => {
            const m = marks[i];
            return (
              <button key={i} className={`cell ${i === current ? "current" : m ? CELL_CLASS[m.triage] : ""}`} type="button" aria-label={`Questão ${i + 1}${i === current ? ", atual" : m ? `, ${CELL_LABEL[m.triage]}` : ", pendente"}`} onClick={() => setCurrent(i)}>{i + 1}</button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function SittingPage() {
  const { id } = useParams();
  const query = useQuery({ queryKey: ["sitting", id], queryFn: () => api.get<ExamSittingView>(`/api/sittings/${id}`), refetchOnWindowFocus: false, gcTime: 0 });
  return <Async query={query}>{(view) => <Sitting view={view} />}</Async>;
}

function Result({ r }: { r: ExamResultView }) {
  const gain = r.whatIf.reduce((s, w) => Math.max(s, w.gain), 0);
  const fall = r.fatigue[0]?.accuracy != null && r.fatigue[2]?.accuracy != null ? r.fatigue[0].accuracy - r.fatigue[2].accuracy : null;
  return (
    <div className="page">
      <PageHead size="t30" kicker={r.title} title={gain > 0 ? `Você deixou até ${gain} pontos na mesa` : "Prova entregue"} actions={<Link className="btn soft" to="/simulado">Voltar</Link>} />
      <Metrics label="Notas estimadas">
        {r.scores.map((s) => <ScoreMetric key={s.area} score={s} />)}
        <Metric label="Tempo médio por questão" value={clock(r.avgSeconds)} note={r.avgSeconds <= r.secondsPerQuestion ? "Dentro do ritmo da prova" : `Acima de ${clock(r.secondsPerQuestion)}`} tone={r.avgSeconds <= r.secondsPerQuestion ? "up" : "down"} />
        <Metric label="Respondidas" value={`${r.answered} / ${r.total}`} />
      </Metrics>
      <div className="grid-2">
        <section className="card" aria-labelledby="fadiga-title">
          <h2 id="fadiga-title">{fall !== null && fall > 0 ? `Curva de fadiga: o acerto cai ${fall} pontos no último terço` : "Curva de fadiga"}</h2>
          <div className="stack" style={{ gap: 16, marginTop: 20 }}>
            {r.fatigue.map((t) => (
              <div key={t.label}>
                <div className="row-head" style={{ marginBottom: 6 }}><span>{t.label}</span><span className="mono">{t.accuracy === null ? "—" : `${t.accuracy}%`}</span></div>
                <Bar pct={t.accuracy ?? 0} tone={(t.accuracy ?? 100) < 65 ? "amber" : ""} size="h12" />
              </div>
            ))}
          </div>
        </section>
        <section className="card" aria-labelledby="e-se-title">
          <h2 id="e-se-title">E se você tivesse feito diferente?</h2>
          <div className="stack">
            {r.whatIf.length === 0 ? <p className="sub">Nenhuma mudança de estratégia teria alterado sua nota nesta prova.</p> : null}
            {r.whatIf.map((w) => (
              <div className="row-box" key={w.title}><div className="tag big mono">{signed(w.gain)}</div><div className="grow"><div className="row-title">{w.title}</div><div className="row-sub">{w.detail}</div></div></div>
            ))}
          </div>
        </section>
      </div>
      <section className="card" aria-labelledby="incoer-title">
        <h2 id="incoer-title">Questões que a TRI lê como incoerência</h2>
        <p className="sub">Errar questões fáceis enquanto acerta difíceis reduz a nota mais do que o número de acertos sugere.</p>
        {r.incoherent.length === 0 ? <p className="sub">Nenhuma incoerência nesta prova.</p> : (
          <div className="table-wrap">
            <table className="tbl min-640">
              <thead><tr><th scope="col">Questão</th><th scope="col">Dificuldade</th><th scope="col">Você</th><th scope="col">Tempo gasto</th><th scope="col">O que aconteceu</th></tr></thead>
              <tbody>
                {r.incoherent.map((q) => (
                  <tr key={q.number}><td className="mono b">{q.number}</td><td className="mono">{q.difficulty}</td><td className={q.hit ? "good" : "bad"}>{q.hit ? "Acertou" : "Errou"}</td><td className="mono">{q.time}</td><td className="soft">{q.note}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div><Pill tone="warn">Nota estimada pelo Ritmo 180. Não é a nota oficial do ENEM.</Pill></div>
    </div>
  );
}

export function ResultPage() {
  const { id } = useParams();
  const query = useQuery({ queryKey: ["result", id], queryFn: () => api.get<ExamResultView>(`/api/sittings/${id}/result`) });
  return <Async query={query}>{(r) => <Result r={r} />}</Async>;
}
