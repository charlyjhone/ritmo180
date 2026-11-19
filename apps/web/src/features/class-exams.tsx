// Simulados da turma: o professor monta a prova com foco e acompanha quem entregou e onde a turma errou.
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ClassExamReport } from "@ritmo/contracts";
import { api, ApiError } from "../lib/api.ts";
import { Async, Pill, saveFile } from "../ui/kit.tsx";
import { useToast } from "../ui/toast.tsx";
import { FocusPicker, parseScope } from "./focus-picker.tsx";

const SIZES = [10, 20, 30, 45, 90];
const STATUS = {
  finished: { label: "Entregue", tone: "good tight" },
  started: { label: "Em andamento", tone: "warn tight" },
  pending: { label: "Não começou", tone: "gray tight" },
} as const;

function NewExam({ classId, className }: { classId: string; className: string }) {
  const client = useQueryClient();
  const toast = useToast();
  const [scope, setScope] = useState("");
  const [topic, setTopic] = useState("");
  const [questions, setQuestions] = useState(20);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  async function publish(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const subject = topic || parseScope(scope).discipline;
      const made = await api.post<{ questions: number; shortages: unknown[] }>("/api/exams", {
        title: title.trim() || `Simulado de ${subject ?? className}`, classId, questions, ...parseScope(scope), topic: topic || undefined,
      });
      toast(`Simulado publicado com ${made.questions} ${made.questions === 1 ? "questão" : "questões"}.`);
      setTitle("");
      await client.invalidateQueries({ queryKey: ["class-exams", classId] });
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "Não foi possível publicar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={publish} className="no-print">
      <FocusPicker title="Conteúdo da prova" anyLabel="Todas as disciplinas" allowArea scope={scope} topic={topic} onScope={(value) => { setScope(value); setTopic(""); }} onTopic={setTopic} />
      <label className="field" style={{ marginTop: 12 }}>Quantidade de questões
        <select className="input" value={questions} onChange={(e) => setQuestions(Number(e.target.value))}>
          {SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <label className="field">Nome do simulado (opcional)<input className="input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></label>
      <button className="btn" type="submit" disabled={busy}>{busy ? "Publicando…" : "Publicar para a turma"}</button>
    </form>
  );
}

function Report({ exam }: { exam: ClassExamReport }) {
  const finished = exam.students.filter((s) => s.status === "finished");
  function exportCsv() {
    const header = ["Aluno", "Situação", "Respondidas", "Acertos", "Total de questões"];
    const rows = exam.students.map((s) => [s.name, STATUS[s.status].label, s.answered, s.status === "finished" ? s.correct : "", exam.questions]);
    saveFile(`${exam.title}.csv`, [header, ...rows].map((r) => r.join(";")).join("\n"));
  }
  return (
    <details className="q-review">
      <summary>
        <span className="grow"><span className="row-title">{exam.title}</span><span className="row-sub" style={{ display: "block" }}>{exam.questions} questões · {new Date(exam.createdAt).toLocaleDateString("pt-BR")}</span></span>
        <Pill tone="gray tight">{finished.length} de {exam.students.length} entregaram</Pill>
      </summary>
      <div className="q-review-body">
        {exam.weakestTopics.length > 0 ? <p className="sub">Assuntos com menos acertos: {exam.weakestTopics.map((t) => `${t.topic} (${t.correctPct}%)`).join(", ")}.</p> : null}
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th scope="col">Aluno</th><th scope="col">Situação</th><th scope="col">Acertos</th></tr></thead>
            <tbody>
              {exam.students.map((s) => (
                <tr key={s.id}><td className="b">{s.name}</td><td><Pill tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Pill></td><td className="mono">{s.status === "finished" ? `${s.correct} / ${exam.questions}` : "—"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="btn-row no-print"><button className="btn outline slim" type="button" onClick={exportCsv}>Exportar planilha</button></div>
      </div>
    </details>
  );
}

export function ClassExams({ classId, className }: { classId: string; className: string }) {
  const query = useQuery({ queryKey: ["class-exams", classId], queryFn: () => api.get<ClassExamReport[]>(`/api/teacher/classes/${classId}/exams`) });
  return (
    <section className="card" id="simulados" aria-labelledby="sim-title">
      <h2 id="sim-title">Simulados da turma</h2>
      <NewExam classId={classId} className={className} />
      <div className="stack" style={{ marginTop: 20 }}>
        <Async query={query}>
          {(exams) => exams.length === 0 ? <p className="sub">Nenhum simulado publicado para esta turma.</p> : exams.map((exam) => <Report key={exam.id} exam={exam} />)}
        </Async>
      </div>
    </section>
  );
}
