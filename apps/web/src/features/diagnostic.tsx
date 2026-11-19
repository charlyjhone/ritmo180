// Diagnóstico adaptativo: cada resposta escolhe a próxima questão.
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AREA_NAMES, type Area, type DiagnosticStep, type Letter } from "@ritmo/contracts";
import { api } from "../lib/api.ts";
import { Async, Html, Pill } from "../ui/kit.tsx";

function Runner({ first, area }: { first: DiagnosticStep; area: Area }) {
  const client = useQueryClient();
  const [step, setStep] = useState(first);
  const [choice, setChoice] = useState<Letter | null>(null);
  const started = useRef(performance.now());
  useEffect(() => {
    started.current = performance.now();
    setChoice(null);
  }, [step.item?.id]);

  async function send() {
    if (!choice || !step.item) return;
    const next = await api.post<DiagnosticStep>(`/api/practice/diagnostic/session/${step.sessionId}/answer`, { itemId: step.item.id, choice, totalMs: Math.round(performance.now() - started.current) });
    if (next.done) await client.invalidateQueries({ queryKey: ["student"] });
    setStep(next);
  }

  if (step.unavailable) return <div className="page"><div className="notice warn">{step.unavailable}</div></div>;
  if (step.done) {
    const s = step.score;
    return (
      <div className="page">
        <h1 id="headline">Diagnóstico concluído</h1>
        <section className="card">
          <div className="metric-label">Nota estimada em {AREA_NAMES[area]}</div>
          <div className="metric-value mono">{s?.score ?? "—"}</div>
          {s?.score != null ? <div className="metric-note">Faixa provável: {s.low} a {s.high}</div> : <div className="metric-note">Ainda são necessárias mais questões para estimar a nota.</div>}
          <div className="btn-row"><Link className="btn" to="/">Voltar ao painel</Link></div>
        </section>
      </div>
    );
  }
  const item = step.item!;
  return (
    <div className="page">
      <section className="card split-main" aria-label="Questão do diagnóstico">
        <div className="tags"><Pill tone="brand">Diagnóstico · {AREA_NAMES[area]}</Pill><Pill>Questão {step.answered + 1}</Pill></div>
        {item.contextHtml ? <Html className="q-html" html={item.contextHtml} /> : null}
        <Html className="q-html b" html={item.stemHtml} />
        <div className="alts">
          {item.alternatives.map((alt) => (
            <button key={alt.letter} className={`alt ${choice === alt.letter ? "selected" : ""}`} type="button" aria-pressed={choice === alt.letter} onClick={() => setChoice(alt.letter)}>
              <span className="mono">{alt.letter}</span><Html html={alt.html} />
            </button>
          ))}
        </div>
        <div className="btn-row"><button className="btn" type="button" disabled={!choice} onClick={() => void send()}>Confirmar</button></div>
      </section>
    </div>
  );
}

export function DiagnosticPage() {
  const area = useParams().area as Area;
  const query = useQuery({ queryKey: ["diagnostic", area], queryFn: () => api.post<DiagnosticStep>(`/api/practice/diagnostic/${area}`), gcTime: 0, refetchOnWindowFocus: false, staleTime: Infinity });
  return <Async query={query}>{(step) => <Runner first={step} area={area} />}</Async>;
}
