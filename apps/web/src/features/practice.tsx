// Treino: guiado mede cada fase; modo prova mostra tudo de uma vez, como no ENEM. Funciona sem internet.
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { CONFIDENCE_LABELS, CONFIDENCES, type Confidence, type HintResponse, type Letter, type PhaseTimes, type PracticeSessionPack } from "@ritmo/contracts";
import { api, ApiError } from "../lib/api.ts";
import { clearPack, flushQueue, loadPack, queueAttempt, savePack } from "../lib/offline.ts";
import { Bar, clock, Html, Pill, useInterval } from "../ui/kit.tsx";
import { FocusPicker } from "./focus-picker.tsx";
import { useMe } from "./session.tsx";
import { LabLinks } from "./lab-links.tsx";

type Item = PracticeSessionPack["items"][number];
// 0 texto, 1 comando, 2 alternativas, 3 conferência, 4 respondida
type Stage = 0 | 1 | 2 | 3 | 4;

const PHASE_ROWS: [keyof PhaseTimes, string, string][] = [["readMs", "Leitura", "amber"], ["pathMs", "Caminho", ""], ["calcMs", "Cálculo", "calc"], ["checkMs", "Conferência", ""]];

function Question({ item, mode, position, total, sessionId, onAnswered, onNext }: { item: Item; mode: "guided" | "exam"; position: number; total: number; sessionId: string; onAnswered: () => void; onNext: () => void }) {
  const guided = mode === "guided";
  const [stage, setStage] = useState<Stage>(guided ? 0 : 2);
  const [marks, setMarks] = useState<number[]>([performance.now()]);
  const [choice, setChoice] = useState<Letter | null>(null);
  const [finalChoice, setFinalChoice] = useState<Letter | null>(null);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [hint, setHint] = useState<HintResponse | null>(null);
  const [, redraw] = useState(0);
  const hidden = useRef({ since: null as number | null, total: 0 });
  const focusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) hidden.current.since = performance.now();
      else if (hidden.current.since !== null) {
        hidden.current.total += performance.now() - hidden.current.since;
        hidden.current.since = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  useEffect(() => focusRef.current?.focus(), [stage]);
  useInterval(() => redraw((n) => n + 1), 500, stage < 4);

  const now = marks.length > 4 ? marks[4]! : performance.now();
  const seconds = (now - marks[0]!) / 1000;
  const over = seconds > item.targetSeconds;
  const lengths = PHASE_ROWS.map((_, i) => Math.max(0, (marks[i + 1] ?? (i === marks.length - 1 ? now : marks[i]!)) - (marks[i] ?? now)));
  const lengthTotal = lengths.reduce((s, v) => s + v, 0) || 1;
  const advance = (next: Stage) => {
    setMarks((m) => [...m, performance.now()]);
    setStage(next);
  };

  async function askHint() {
    try {
      setHint(await api.post<HintResponse>("/api/practice/hint", { itemId: item.id, stage: stage <= 1 ? "command" : "path" }));
    } catch {
      setHint({ hint: item.key.hint ?? "Volte ao comando da questão e sublinhe o que ela pede.", source: item.key.hint ? "item" : "none" });
    }
  }

  async function confirm(letter: Letter, sure: Confidence) {
    const end = performance.now();
    const all = guided ? [...marks, end] : [marks[0]!, end];
    setMarks(guided ? all : [marks[0]!, marks[0]!, marks[0]!, marks[0]!, end]);
    setFinalChoice(letter);
    setConfidence(sure);
    setStage(4);
    const phases: PhaseTimes | null = guided
      ? { readMs: Math.round(all[1]! - all[0]!), pathMs: Math.round(all[2]! - all[1]!), calcMs: Math.round(all[3]! - all[2]!), checkMs: Math.round(all[4]! - all[3]!) }
      : null;
    await queueAttempt({
      id: crypto.randomUUID(), sessionId, itemId: item.id, mode, choice: letter, totalMs: Math.round(end - marks[0]!), phases,
      usedHint: hint !== null, hiddenMs: Math.round(hidden.current.total), position, answeredAt: Date.now(), confidence: sure,
    });
    onAnswered();
  }

  function pick(letter: Letter) {
    if (stage === 4) return;
    setChoice(letter);
    if (stage === 2) {
      if (guided) advance(3);
    }
  }

  const answered = stage === 4;
  const right = finalChoice === item.key.answer;
  const trap = finalChoice ? item.key.traps[finalChoice] : undefined;
  const time = clock(seconds);
  const title = !right ? `Pegadinha: alternativa ${finalChoice}` : over ? `Certo, mas ${time} passou do tempo-alvo` : `Certo e dentro do tempo-alvo: ${time}`;
  const text = !right ? (trap ?? "Compare sua resposta com a resolução abaixo.") : over ? "O acerto conta, mas a meta é chegar lá mais rápido. Veja no Raio-X qual fase pesou." : "Questão dentro do Índice Ritmo.";
  // A certeza decide o que entra na revisão espaçada: o aviso explica por que a questão vai voltar.
  const review = !right && confidence === "sure"
    ? "Você tinha certeza e errou: este é o erro mais importante de rever. A questão foi para o topo do seu caderno de erros."
    : !right ? "A questão foi para o seu caderno de erros. Depois de refazer, ela volta em 2, 7 e 21 dias para fixar."
    : confidence === "guess" ? "Você acertou no chute, então ela vai para o caderno de erros para você rever com calma." : null;

  return (
    <div className="split">
      <section className="card split-main" aria-label="Questão">
        <div className="tags">
          <Pill tone="brand">{guided ? "Treino guiado" : "Modo prova"}</Pill>
          <Pill>{[item.area, item.discipline, item.skill].filter(Boolean).join(" · ")}</Pill>
          <Pill>Questão {position + 1} de {total}</Pill>
        </div>
        <p className="note" style={{ marginTop: 10 }}>{item.reason}</p>
        {item.contextHtml ? (
          <div style={{ marginTop: 16 }}>
            <div className="label-caps">TEXTO-BASE</div>
            <Html className="q-html" html={item.contextHtml} />
          </div>
        ) : null}
        {stage === 0 ? <button ref={focusRef} className="btn" type="button" style={{ marginTop: 24 }} onClick={() => advance(1)}>Li o texto · mostrar o comando</button> : null}
        {stage >= 1 ? <div className="q-command"><div className="label-caps">COMANDO</div><Html className="q-html b" html={item.stemHtml} /></div> : null}
        {stage === 1 ? (
          <div className="btn-row" style={{ marginTop: 20 }}>
            <button ref={focusRef} className="btn" type="button" onClick={() => advance(2)}>Sei o caminho · mostrar alternativas</button>
            <button className="btn soft" type="button" onClick={() => void askHint()}>Pedir uma pista ao tutor</button>
          </div>
        ) : null}
        {hint && stage >= 1 ? <div className="hint"><strong>Tutor:</strong> {hint.hint}</div> : null}
        {stage >= 2 ? (
          <div className="alts">
            {item.alternatives.map((alt) => {
              const state = answered && alt.letter === item.key.answer ? "right" : answered && alt.letter === finalChoice ? "wrong" : !answered && alt.letter === choice ? "selected" : "";
              return (
                <button key={alt.letter} className={`alt ${state}`} type="button" aria-pressed={alt.letter === choice} onClick={() => pick(alt.letter)}>
                  <span className="mono">{alt.letter}</span>
                  <Html html={alt.html} />
                </button>
              );
            })}
          </div>
        ) : null}
        {stage >= 2 && !answered && choice ? (
          <div className="confidence" role="group" aria-labelledby="confidence-label">
            <div className="label-caps" id="confidence-label">CONFIRMAR A ALTERNATIVA {choice}: QUANTA CERTEZA VOCÊ TEM?</div>
            <div className="btn-row">
              {CONFIDENCES.map((level, i) => (
                <button key={level} ref={guided && i === 0 ? focusRef : undefined} className={`btn ${i === 0 ? "" : "soft"}`} type="button" onClick={() => void confirm(choice, level)}>{CONFIDENCE_LABELS[level]}</button>
              ))}
            </div>
          </div>
        ) : null}
        {answered ? (
          <>
            <div className={`feedback ${right ? "good" : ""}`}>
              <b>{title}</b>
              <p>{text}</p>
              {review ? <p className="note" role="status">{review}</p> : null}
              {item.key.solutionHtml ? <><p className="solution"><strong>Resolução:</strong></p><Html className="solution-html" html={item.key.solutionHtml} /></> : null}
            </div>
            <LabLinks discipline={item.discipline} topic={item.topic} text={`${item.contextHtml} ${item.stemHtml}`} solutionHtml={item.key.solutionHtml} />
            <div className="btn-row">
              <button ref={focusRef} className="btn" type="button" onClick={onNext}>{position + 1 < total ? "Próxima questão" : "Concluir treino"}</button>
            </div>
          </>
        ) : null}
      </section>
      <aside className="split-side">
        <section className="card" aria-label="Cronômetro">
          <div className="metric-label">Seu tempo</div>
          <div className={`timer mono ${over ? "over" : ""}`}>{clock(seconds)}</div>
          <div className="note" style={{ color: "var(--body)", fontWeight: 600 }}>Tempo-alvo desta questão: <span className="mono">{clock(item.targetSeconds)}</span></div>
          <div style={{ marginTop: 12 }}><Bar pct={(seconds / item.targetSeconds) * 100} tone={over ? "bad" : ""} size="h10" /></div>
        </section>
        {guided ? (
          <section className="card" aria-label="Raio-X do Tempo desta questão">
            <div className="side-title">Raio-X do Tempo</div>
            <div className="note" style={{ marginTop: 4 }}>Cada toque marca uma fase da resolução.</div>
            <div className="phases">
              {PHASE_ROWS.map(([key, name, tone], i) => (
                <div key={key}>
                  <div className="row-head"><span>{name}</span><span className="mono">{clock(lengths[i]! / 1000)}</span></div>
                  <Bar pct={(lengths[i]! / lengthTotal) * 100} tone={tone} />
                </div>
              ))}
            </div>
          </section>
        ) : null}
        <section className="card" aria-label="Como funciona">
          <div style={{ fontSize: 14, fontWeight: 800 }}>{guided ? "Por que a questão aparece em partes?" : "Por que tudo de uma vez?"}</div>
          <p className="note" style={{ margin: "6px 0 0", color: "var(--body)", lineHeight: 1.55 }}>
            {guided ? "Separar as fases mostra onde o seu tempo realmente vai. É esse dado que o motor usa para escolher o próximo treino." : "No ENEM você decide sozinho a ordem de leitura. Este modo treina isso e serve para comparar com o ritmo do guiado."}
          </p>
        </section>
      </aside>
    </div>
  );
}

export function PracticePage() {
  const client = useQueryClient();
  const { id: owner } = useMe();
  const [pack, setPack] = useState<PracticeSessionPack | null>(null);
  const [index, setIndex] = useState(0);
  const [resume, setResume] = useState<{ pack: PracticeSessionPack; done: number } | null>(null);
  const [mode, setMode] = useState<"guided" | "exam">("guided");
  const [params] = useSearchParams();
  const mistakes = params.get("erros") === "1";
  const [discipline, setDiscipline] = useState(params.get("disciplina") ?? "");
  const [topic, setTopic] = useState(params.get("assunto") ?? "");
  const [replacing, setReplacing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadPack(owner).then((saved) => {
      if (saved && saved.done < saved.pack.items.length) setResume(saved);
    }).catch(() => {});
  }, [owner]);

  async function start() {
    setBusy(true);
    setMessage(null);
    try {
      const next = await api.post<PracticeSessionPack>("/api/practice/sessions", { mode, minutes: 25, discipline: discipline || undefined, topic: topic || undefined, mistakes });
      if (next.items.length === 0) {
        setMessage(next.notice);
        return;
      }
      await savePack({ owner, pack: next, done: 0 }).catch(() => {});
      setMessage(next.notice);
      setPack(next);
      setIndex(0);
      setResume(null);
      setReplacing(false);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Sem internet e sem treino baixado neste aparelho. Conecte-se uma vez para baixar o próximo treino.");
    } finally {
      setBusy(false);
    }
  }

  async function next() {
    const done = index + 1;
    if (pack && done < pack.items.length) {
      setIndex(done);
      return;
    }
    await clearPack().catch(() => {});
    await flushQueue();
    await client.invalidateQueries({ queryKey: ["student"] });
    setPack(null);
    setIndex(0);
    setResume(null);
    setMessage("Treino concluído. Seus resultados já contam no painel.");
  }

  if (pack) {
    const item = pack.items[index]!;
    return <Question key={item.id} item={item} mode={pack.mode} position={index} total={pack.items.length} sessionId={pack.sessionId} onAnswered={() => void savePack({ owner, pack, done: index + 1 }).catch(() => {})} onNext={() => void next()} />;
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="kicker">Treino do dia</div>
          <h1 id="headline">Escolha como treinar hoje</h1>
        </div>
      </div>
      {message ? <div className="notice" role="status">{message}</div> : null}
      {mistakes ? <div className="notice" role="status">Este treino usa só as questões do seu caderno de erros.</div> : null}
      {resume ? (
        <section className="card">
          <h2>Você tem um treino em andamento</h2>
          <p className="sub">{resume.done} de {resume.pack.items.length} questões feitas. Ele fica salvo no aparelho e funciona sem internet.</p>
          <div className="btn-row"><button className="btn" type="button" onClick={() => { setPack(resume.pack); setIndex(resume.done); }}>Continuar treino</button></div>
        </section>
      ) : null}
      <div className="grid-2">
        <section className="card">
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ padding: 0 }}>MODO</legend>
            <button className={`opt`} type="button" aria-pressed={mode === "guided"} onClick={() => setMode("guided")}><strong>Guiado.</strong> A questão aparece em partes e o Raio-X mede cada fase.</button>
            <button className={`opt`} type="button" aria-pressed={mode === "exam"} onClick={() => setMode("exam")}><strong>Prova.</strong> Tudo de uma vez, como no ENEM. Conta para a sua nota.</button>
          </fieldset>
          <FocusPicker title="O QUE TREINAR" anyLabel="Deixar o Ritmo 180 escolher pelas suas lacunas" scope={discipline} topic={topic} onScope={(value) => { setDiscipline(value); setTopic(""); }} onTopic={setTopic} />
          {replacing && resume ? (
            <div className="notice warn" role="alert" style={{ marginTop: 16 }}>
              <b>Trocar de treino?</b> Você fez {resume.done} de {resume.pack.items.length} questões do treino em andamento. As respostas dadas ficam salvas, mas as questões restantes saem da fila.
              <div className="btn-row">
                <button className="btn" type="button" disabled={busy} onClick={() => void start()}>{busy ? "Montando treino…" : "Trocar de treino"}</button>
                <button className="btn soft" type="button" onClick={() => { setPack(resume.pack); setIndex(resume.done); }}>Continuar o treino atual</button>
              </div>
            </div>
          ) : (
            <div className="btn-row"><button className="btn" type="button" disabled={busy} onClick={() => { if (resume) setReplacing(true); else void start(); }}>{busy ? "Montando treino…" : "Começar treino"}</button><Link className="btn soft" to="/">Voltar ao painel</Link></div>
          )}
        </section>
        <section className="card">
          <h2>Funciona sem internet</h2>
          <p className="sub">Ao começar, o treino é baixado para este aparelho. Se a conexão cair, continue normalmente: as respostas ficam guardadas e são enviadas quando a internet voltar. O simulado precisa de conexão.</p>
        </section>
      </div>
    </div>
  );
}
