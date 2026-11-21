// Aulas rápidas: o índice por disciplina e a aula de cada assunto, com as bases que ele usa.
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AREA_NAMES, type LessonBundle, type LessonIndex, type LessonView } from "@ritmo/contracts";
import { api, ApiError } from "../lib/api.ts";
import { loadLessons, saveLessons } from "../lib/offline.ts";
import { ReadAloud } from "../ui/a11y.tsx";
import { Async, Bar, Html, PageHead, Pill } from "../ui/kit.tsx";
import { trainingLink } from "./focus-picker.tsx";
import { LabLinks } from "./lab-links.tsx";
import { useMe } from "./session.tsx";

/** Treino curto depois da aula: cerca de 3 questões. */
const CHECK_MINUTES = 9;

/** Sem internet, a aula sai da cópia baixada no aparelho (sem pré-requisitos nem domínio do aluno). */
async function offlineLesson(discipline: string, topic: string): Promise<LessonView | null> {
  const saved = await loadLessons().catch(() => undefined);
  const lesson = saved?.lessons.find((l) => l.discipline === discipline && l.topic === topic);
  if (!lesson) return null;
  const { title, explanationHtml, exampleHtml, pitfallsHtml } = lesson;
  return { area: "CN", discipline, topic, lesson: { title, explanationHtml, exampleHtml, pitfallsHtml }, questions: 0, mastery: null, prerequisites: [], calcBottleneck: false };
}

async function fetchLesson(discipline: string, topic: string): Promise<LessonView & { offline?: boolean }> {
  try {
    return await api.get<LessonView>(`/api/lessons/topic?${new URLSearchParams({ disciplina: discipline, assunto: topic })}`);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const saved = await offlineLesson(discipline, topic);
    if (!saved) throw error;
    return { ...saved, offline: true };
  }
}

function DownloadLessons() {
  const [saved, setSaved] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    void loadLessons().then((b) => setSaved(b ? b.savedAt : null)).catch(() => {});
  }, []);
  async function download() {
    setBusy(true);
    setError(false);
    try {
      const bundle = await api.get<LessonBundle>("/api/study/lessons-bundle");
      const savedAt = Date.now();
      await saveLessons({ ...bundle, savedAt });
      setSaved(savedAt);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <div className="card-head">
        <h2>Estudar sem internet</h2>
        <button className="btn soft" type="button" disabled={busy} onClick={() => void download()}>{busy ? "Baixando…" : saved ? "Atualizar aulas no aparelho" : "Baixar todas as aulas"}</button>
      </div>
      <p className="sub">
        {saved ? `Aulas guardadas neste aparelho em ${new Date(saved).toLocaleDateString("pt-BR")}. Elas abrem mesmo sem conexão.` : "Baixe as aulas uma vez, com Wi-Fi, e leia depois mesmo sem conexão. Ocupa pouco espaço e não guarda dados seus."}
      </p>
      {error ? <p className="sub" role="alert">Não foi possível baixar agora. Tente de novo com internet.</p> : null}
    </section>
  );
}

export function lessonLink(subject: { discipline: string; topic: string }): string {
  return `/aula?${new URLSearchParams({ disciplina: subject.discipline, assunto: subject.topic })}`;
}

const STATUS: Record<LessonView["prerequisites"][number]["status"], { tone: string; label: string }> = {
  weak: { tone: "warn", label: "Revise antes" },
  untested: { tone: "gray", label: "Ainda não treinou" },
  ok: { tone: "good", label: "Em dia" },
};

function Prerequisites({ view, student }: { view: LessonView; student: boolean }) {
  if (view.prerequisites.length === 0) return null;
  const weak = view.prerequisites.filter((p) => p.status === "weak").length;
  return (
    <section className="card" aria-labelledby="base-title">
      <h2 id="base-title">{student && weak > 0 ? `Antes, revise ${weak === 1 ? "esta base" : `estas ${weak} bases`}` : "Bases que este assunto usa"}</h2>
      <p className="sub">
        {student && weak > 0
          ? "Muito erro neste assunto vem de uma base anterior. Fechar a base primeiro deixa a aula e as questões bem mais fáceis."
          : "Se alguma destas bases estiver fraca, vale revisar antes."}
        {view.calcBottleneck ? " Seu Raio-X mostra que o cálculo é onde você mais perde tempo: comece pelas bases de Matemática." : ""}
      </p>
      <div className="stack">
        {view.prerequisites.map((p) => (
          <div className="row-box" key={`${p.discipline}${p.topic}`}>
            <div className="grow">
              <div className="row-title">{p.topic}</div>
              <div className="row-sub">{p.discipline} · {p.why}{p.mastery !== null ? ` · ${p.mastery}% de domínio` : ""}</div>
            </div>
            {student ? <Pill tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Pill> : null}
            {p.hasLesson ? <Link className="btn soft slim" to={lessonLink(p)}>Ver aula</Link> : null}
            {student ? <Link className="btn soft slim" to={trainingLink({ ...p, minutes: CHECK_MINUTES })}>Praticar</Link> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

export function LessonPage() {
  const [params] = useSearchParams();
  const discipline = params.get("disciplina") ?? "";
  const topic = params.get("assunto") ?? "";
  const student = useMe().role === "student";
  const query = useQuery({
    queryKey: ["lesson", discipline, topic],
    queryFn: () => fetchLesson(discipline, topic),
    enabled: Boolean(discipline && topic),
  });
  return (
    <div className="page">
      <PageHead
        kicker={`Aula rápida · ${discipline}`}
        title={query.data?.lesson?.title ?? topic}
        actions={student ? <><Link className="btn" to={trainingLink({ discipline, topic, minutes: CHECK_MINUTES })}>Praticar 3 questões</Link><Link className="btn soft" to="/aulas">Todas as aulas</Link></> : <Link className="btn soft" to="/aulas">Todas as aulas</Link>}
      />
      <Async query={query}>
        {(view) => (
          <>
            {"offline" in view && view.offline ? <div className="notice warn" role="status">Sem internet: esta é a cópia da aula guardada no aparelho.</div> : null}
            {student && view.mastery !== null ? (
              <div className="notice">
                Seu domínio em {view.topic}: <b>{view.mastery}%</b>. Depois da aula, pratique 3 questões para fixar e ver o domínio subir.
                <div style={{ marginTop: 8 }}><Bar pct={view.mastery} tone={view.mastery < 60 ? "amber" : "ok"} size="h6" /></div>
              </div>
            ) : null}
            <Prerequisites view={view} student={student} />
            {view.lesson ? (
              <>
                <div className="btn-row no-print">
                  <ReadAloud html={`${view.lesson.title}. ${view.lesson.explanationHtml} Exemplo resolvido. ${view.lesson.exampleHtml} Pegadinhas do ENEM. ${view.lesson.pitfallsHtml}`} label="Ouvir a aula" />
                  {student ? <Link className="btn soft slim" to={`/cartoes?${new URLSearchParams({ disciplina: discipline, assunto: topic })}`}>Cartões deste assunto</Link> : null}
                </div>
                <section className="card lesson" aria-labelledby="exp-title">
                  <h2 id="exp-title">O essencial</h2>
                  <Html className="q-html lesson-body" html={view.lesson.explanationHtml} />
                </section>
                <section className="card lesson" aria-labelledby="ex-title">
                  <h2 id="ex-title">Exemplo resolvido</h2>
                  <Html className="q-html lesson-body" html={view.lesson.exampleHtml} />
                </section>
                <section className="card lesson" aria-labelledby="pit-title">
                  <h2 id="pit-title">Pegadinhas do ENEM</h2>
                  <Html className="q-html lesson-body" html={view.lesson.pitfallsHtml} />
                </section>
                <div className="no-print"><LabLinks discipline={discipline} topic={topic} text={`${view.lesson.explanationHtml} ${view.lesson.exampleHtml}`} /></div>
                {student ? (
                  <section className="card">
                    <h2>Agora, pratique</h2>
                    <p className="sub">São cerca de 3 questões de {view.topic} ({view.questions} no banco). O que você errar entra no caderno de erros e volta em 2, 7 e 21 dias.</p>
                    <div className="btn-row"><Link className="btn" to={trainingLink({ discipline, topic, minutes: CHECK_MINUTES })}>Praticar 3 questões</Link></div>
                  </section>
                ) : null}
              </>
            ) : (
              <div className="state">A aula deste assunto ainda está sendo preparada. Enquanto isso, revise as bases acima e pratique as {view.questions} questões do banco.</div>
            )}
          </>
        )}
      </Async>
    </div>
  );
}

export function LessonsIndexPage() {
  const student = useMe().role === "student";
  const query = useQuery({ queryKey: ["lessons"], queryFn: () => api.get<LessonIndex>("/api/lessons") });
  return (
    <div className="page">
      <PageHead kicker="Aulas rápidas" title="Entenda o conteúdo antes de treinar" />
      <p className="sub">Cada aula leva de 5 a 8 minutos: o essencial do assunto, um exemplo resolvido e as pegadinhas do ENEM. Os assuntos estão em ordem de peso na prova.</p>
      <DownloadLessons />
      <Async query={query}>
        {(index) => (
          <div className="stack">
            {index.disciplines.map((d) => (
              <details className="card lesson-group" key={d.discipline}>
                <summary>
                  <span className="row-title">{d.discipline}</span>
                  <span className="note">{AREA_NAMES[d.area]} · {d.topics.filter((t) => t.hasLesson).length} de {d.topics.length} aulas prontas</span>
                </summary>
                <div className="stack" style={{ marginTop: 12 }}>
                  {d.topics.map((t) => (
                    <div className="row-box" key={t.topic}>
                      <div className="grow">
                        <div className="row-title">{t.topic}</div>
                        <div className="row-sub">
                          {t.questions} questões{student && t.mastery !== null ? ` · ${t.mastery}% de domínio` : ""}
                          {student && t.weakPrerequisites > 0 ? ` · ${t.weakPrerequisites === 1 ? "1 base para revisar" : `${t.weakPrerequisites} bases para revisar`}` : ""}
                        </div>
                      </div>
                      {t.hasLesson ? <Pill tone="brand">Aula pronta</Pill> : <Pill>Em preparo</Pill>}
                      <Link className="btn soft slim" to={lessonLink({ discipline: d.discipline, topic: t.topic })} aria-label={`Abrir a aula de ${t.topic}`}>Abrir</Link>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </Async>
    </div>
  );
}
