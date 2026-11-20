// Leitura com compreensão: a velocidade só vale com pelo menos 3 de 4 acertos.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReadingNext, ReadingResultView } from "@ritmo/contracts";
import { api } from "../lib/api.ts";
import { Async, clock, Pill, useInterval } from "../ui/kit.tsx";
import { useMe } from "./session.tsx";

const pretty = (kind: string) => kind.charAt(0) + kind.slice(1).toLowerCase();

function verdictTitle(r: ReadingResultView) {
  if (r.verdict === "valid") return `Leitura válida: ${r.ppm} palavras por minuto com compreensão`;
  if (r.verdict === "implausible_speed") return "Leitura não validada: o tempo não combina com uma leitura real";
  return "Leitura não validada: a compreensão ficou abaixo de 3 de 4";
}

function Exercise({ next, onAgain }: { next: ReadingNext; onAgain: () => void }) {
  const me = useMe();
  const [phase, setPhase] = useState(0);
  const [t0, setT0] = useState(0);
  const [t1, setT1] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<ReadingResultView | null>(null);
  const [showAreas, setShowAreas] = useState(false);
  const [, redraw] = useState(0);
  useInterval(() => redraw((n) => n + 1), 500, phase === 1);
  const seconds = t0 ? ((t1 || Date.now()) - t0) / 1000 : 0;
  const { text, questions, history } = next;

  async function submit() {
    const list = questions.map((_, i) => answers[i]!);
    setResult(await api.post<ReadingResultView>("/api/reading/submit", { textId: text.id, readMs: Math.round(t1 - t0), answers: list }));
    setPhase(3);
  }

  return (
    <div className="split">
      <section className="card split-main" aria-label="Exercício de leitura">
        <div className="tags">
          <Pill tone="brand">Leitura com compreensão</Pill>
          <Pill>{me.name.split(" ")[0]}{me.grade ? ` · ${me.grade}` : ""}</Pill>
          <button className="pill gray pill-button" type="button" aria-expanded={showAreas} aria-controls="areas-note" onClick={() => setShowAreas((open) => !open)}>Prepara para LC e CH <span aria-hidden="true">{showAreas ? "▴" : "▾"}</span></button>
        </div>
        {showAreas ? <p id="areas-note" className="notice" style={{ marginTop: 12 }}>LC é Linguagens, Códigos e suas Tecnologias, e CH é Ciências Humanas e suas Tecnologias. São as áreas do ENEM que mais dependem de leitura: entender o texto de primeira poupa tempo e ajuda a evitar as pegadinhas.</p> : null}
        {phase === 0 ? (
          <>
            <h1 id="headline" style={{ marginTop: 24, fontSize: 28, letterSpacing: 0 }}>Leia no seu ritmo natural. Depois, 4 perguntas sem o texto.</h1>
            <p className="lead">A velocidade só conta se você entender. Sua leitura vale quando acerta pelo menos 3 das 4 perguntas.</p>
            <button className="btn ritmo" type="button" style={{ marginTop: 24 }} autoFocus onClick={() => { setT0(Date.now()); setPhase(1); }}>Começar a leitura</button>
          </>
        ) : null}
        {phase === 1 ? (
          <>
            <h2 style={{ marginTop: 24, fontSize: 22 }}>{text.title}</h2>
            <p className="read-text">{text.body}</p>
            <button className="btn" type="button" style={{ marginTop: 24 }} autoFocus onClick={() => { setT1(Date.now()); setPhase(2); }}>Terminei de ler</button>
          </>
        ) : null}
        {phase === 2 ? (
          <>
            <p style={{ margin: "24px 0 0", fontSize: 15, color: "var(--body)" }}>O texto ficou oculto. Responda com o que você entendeu.</p>
            {questions.map((q, qi) => (
              <fieldset key={qi}>
                <legend>{q.kind}</legend>
                <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.5 }}>{q.prompt}</div>
                {q.options.map((option, oi) => (
                  <button key={oi} className="opt" type="button" aria-pressed={answers[qi] === oi} onClick={() => setAnswers((a) => ({ ...a, [qi]: oi }))}>{option}</button>
                ))}
              </fieldset>
            ))}
            <button className="btn" type="button" style={{ marginTop: 20 }} disabled={Object.keys(answers).length < questions.length} onClick={() => void submit()}>Ver resultado</button>
          </>
        ) : null}
        {phase === 3 && result ? (
          <>
            <h2 style={{ marginTop: 24, fontSize: 26 }}>{verdictTitle(result)}</h2>
            <div className="result-grid">
              <div className="mini"><div className="metric-label">Velocidade</div><div className="mono">{result.ppm} ppm</div></div>
              <div className="mini"><div className="metric-label">Compreensão</div><div className="mono">{result.score} de 4</div></div>
              <div className="mini"><div className="metric-label">Meta da sua série</div><div className="mono">{result.goalPpm ? `${result.goalPpm} ppm` : "—"}</div></div>
            </div>
            <div className="stack" style={{ gap: 10 }}>
              {result.review.map((r) => <div key={r.kind} className={`review ${r.correct ? "good" : ""}`}><strong>{pretty(r.kind)}:</strong> {r.correct ? "certo. " : "errou. "}{r.why}</div>)}
            </div>
            <button className="btn" type="button" style={{ marginTop: 20 }} autoFocus onClick={onAgain}>Fazer outro texto</button>
          </>
        ) : null}
      </section>
      <aside className="split-side">
        <section className="card" aria-label="Cronômetro de leitura">
          <div className="metric-label">Tempo de leitura</div>
          <div className="timer reading mono">{clock(seconds)}</div>
          <div className="note" style={{ color: "var(--body)" }}>{text.words} palavras no texto</div>
        </section>
        <section className="card" aria-label="Estratégias treinadas">
          <div className="side-title">O que cada pergunta treina</div>
          <div className="defs">
            <div><strong>Localizar:</strong> achar a informação explícita sem reler tudo.</div>
            <div><strong>Inferir:</strong> entender o que o texto sugere sem dizer.</div>
            <div><strong>Tese:</strong> separar a ideia central dos exemplos.</div>
            <div><strong>Extrapolação:</strong> eliminar a alternativa que vai além do texto, a pegadinha mais comum em Linguagens e Humanas.</div>
          </div>
        </section>
        <section className="card" aria-label="Evolução">
          <div className="side-title">Sua evolução</div>
          <div className="kv" style={{ marginTop: 12 }}><span>Leitura válida</span><span className="mono b">{history.validPpm === null ? "—" : `${history.firstPpm} → ${history.validPpm} ppm`}</span></div>
          <div className="kv"><span>Compreensão média</span><span className="mono b">{history.comprehension === null ? "—" : `${history.comprehension}%`}</span></div>
          <div className="kv"><span>Ponto fraco</span><span className="b">{history.weakKind ? pretty(history.weakKind) : "—"}</span></div>
        </section>
      </aside>
    </div>
  );
}

export function ReadingPage() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["reading"], queryFn: () => api.get<ReadingNext>("/api/reading/next"), refetchOnWindowFocus: false, gcTime: 0 });
  return (
    <Async query={query}>
      {(next) => <Exercise key={next.text.id} next={next} onAgain={() => void client.invalidateQueries({ queryKey: ["reading"] })} />}
    </Async>
  );
}
