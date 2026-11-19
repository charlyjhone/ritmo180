// Implantação: cada passo grava no servidor, então pode ser retomada em outro dia.
import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { OnboardingState, RosterCommitResult, RosterPreview } from "@ritmo/contracts";
import { api, ApiError } from "../lib/api.ts";
import { Async, clock, PageHead, Pill, saveFile } from "../ui/kit.tsx";
import { useToast } from "../ui/toast.tsx";
import { useMe } from "./session.tsx";

const STEPS = [
  ["Escola e marca", "Nome, cores e endereço"],
  ["Termos e LGPD", "Contrato e consentimentos"],
  ["Alunos e turmas", "Importar planilha"],
  ["Acessibilidade", "Tempo adicional e recursos"],
  ["Diagnóstico inicial", "Data e liberação"],
] as const;

type StepProps = { state: OnboardingState; path: string; onSaved: (s: OnboardingState) => void };

function useSave({ path, onSaved }: Pick<StepProps, "path" | "onSaved">) {
  const toast = useToast();
  return async (body: unknown, message = "Salvo.") => {
    try {
      onSaved(await api.patch<OnboardingState>(path, body));
      toast(message);
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "Não foi possível salvar.");
    }
  };
}

function SchoolStep({ state, path, onSaved }: StepProps) {
  const save = useSave({ path, onSaved });
  const toast = useToast();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = Object.fromEntries(new FormData(event.currentTarget));
    await save({ school: f });
  }
  async function logo(file: File | undefined) {
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pngBase64 = btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
    try {
      await api.put(`${path}/logo`, { pngBase64 });
      toast("Logotipo salvo.");
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "Não foi possível enviar.");
    }
  }
  const s = state.school;
  return (
    <form onSubmit={submit}>
      <h2>Escola e marca</h2>
      <div className="form-grid">
        <label className="field">Nome da escola<input className="input" name="name" defaultValue={s.name} required /></label>
        <label className="field">Endereço de acesso<input className="input" name="slug" defaultValue={s.slug} pattern="[a-z0-9\-]{2,40}" required /></label>
        <label className="field">Cor principal<input className="input" name="brandColor" type="color" defaultValue={s.brandColor} /></label>
        <label className="field">Séries atendidas<input className="input" name="grades" defaultValue={s.grades} required /></label>
        <label className="field">Logotipo em PNG, até 512 KB<input className="input" type="file" accept="image/png" onChange={(e) => void logo(e.target.files?.[0])} /></label>
      </div>
      <div className="btn-row"><button className="btn" type="submit">Salvar</button></div>
    </form>
  );
}

function TermsStep({ state, path, onSaved }: StepProps) {
  const save = useSave({ path, onSaved });
  const [signed, setSigned] = useState(state.terms.dpaSigned);
  const [contact, setContact] = useState(state.terms.dpoContact);
  return (
    <div>
      <h2>Termos e LGPD</h2>
      <label className="chk"><input type="checkbox" checked={signed} onChange={(e) => setSigned(e.target.checked)} /><span>Acordo de tratamento de dados assinado pela escola.</span></label>
      <label className="field" style={{ marginTop: 16 }}>Contato do encarregado de dados<input className="input" value={contact} onChange={(e) => setContact(e.target.value)} /></label>
      <div className="okbox">Os dados ficam isolados por escola no próprio banco de dados. Alunos sem consentimento do responsável não conseguem entrar. Consentimentos recebidos: {state.consent.accepted} de {state.consent.total}.</div>
      <div className="btn-row"><button className="btn" type="button" onClick={() => void save({ terms: { dpaSigned: signed, dpoContact: contact } })}>Salvar</button></div>
    </div>
  );
}

function RosterStep({ state, path, onSaved }: StepProps) {
  const client = useQueryClient();
  const toast = useToast();
  const [file, setFile] = useState<{ filename: string; csv: string } | null>(null);
  const [preview, setPreview] = useState<RosterPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(selected: File | undefined) {
    if (!selected) return;
    const payload = { filename: selected.name, csv: await selected.text() };
    setError(null);
    setFile(payload);
    try {
      setPreview(await api.post<RosterPreview>(`${path}/roster/preview`, payload));
    } catch (e) {
      setPreview(null);
      setError(e instanceof ApiError ? e.message : "Não foi possível ler o arquivo.");
    }
  }
  async function commit() {
    const result = await api.post<RosterCommitResult>(`${path}/roster`, file);
    saveFile("senhas-provisorias.csv", result.credentialsCsv);
    toast(`${result.created} alunos criados. Guarde o arquivo de senhas: ele não será mostrado de novo.`);
    setPreview(null);
    setFile(null);
    onSaved(await api.get<OnboardingState>(path));
    await client.invalidateQueries({ queryKey: ["school"] });
  }
  return (
    <div>
      <h2>Alunos e turmas</h2>
      <p className="sub">{state.roster.students} alunos cadastrados{state.roster.lastFile ? ` · último arquivo: ${state.roster.lastFile}` : ""}.</p>
      <p className="sub">Envie um CSV com as colunas <span className="mono">nome; email; turma; serie; email_responsavel; consentimento</span>. A série usa o formato “9º ano” ou “1ª série”.</p>
      <label className="drop" style={{ display: "block" }}>Selecionar arquivo CSV<input type="file" accept=".csv,text/csv" style={{ display: "block", margin: "12px auto 0" }} onChange={(e) => void choose(e.target.files?.[0])} /></label>
      {error ? <div className="notice bad" style={{ marginTop: 12 }} role="alert">{error}</div> : null}
      {preview ? (
        <>
          <div className="okbox">{preview.ready} de {preview.total} linhas prontas para importar.</div>
          {preview.problems.length > 0 ? (
            <div className="table-wrap"><table className="tbl"><thead><tr><th scope="col">Linha</th><th scope="col">Nome</th><th scope="col">Problema</th></tr></thead>
              <tbody>{preview.problems.slice(0, 20).map((p) => <tr key={p.line}><td className="mono">{p.line}</td><td>{p.name}</td><td className="bad">{p.issue}</td></tr>)}</tbody></table></div>
          ) : null}
          <div className="table-wrap"><table className="tbl"><thead><tr><th scope="col">Aluno</th><th scope="col">Turma</th><th scope="col">Responsável</th><th scope="col">Situação</th></tr></thead>
            <tbody>{preview.sample.map((r) => <tr key={r.name}><td className="b">{r.name}</td><td>{r.className}</td><td className="soft">{r.guardian}</td><td className="soft">{r.status}</td></tr>)}</tbody></table></div>
          <div className="btn-row"><button className="btn" type="button" disabled={preview.ready === 0} onClick={() => void commit()}>Importar {preview.ready} alunos</button></div>
        </>
      ) : null}
    </div>
  );
}

function AccessStep({ state, path, onSaved }: StepProps) {
  const toast = useToast();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const f = new FormData(form);
    try {
      onSaved(await api.post<OnboardingState>(`${path}/accommodations`, { studentId: f.get("studentId"), kind: f.get("kind"), extraMinutes: Number(f.get("extraMinutes")), resources: f.get("resources") }));
      form.reset();
      toast("Adaptação salva.");
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "Não foi possível salvar.");
    }
  }
  return (
    <div>
      <h2>Acessibilidade</h2>
      <p className="sub">O tempo adicional vale no treino, no simulado e no tempo-alvo de cada questão.</p>
      {state.accommodations.length > 0 ? (
        <div className="table-wrap"><table className="tbl min-600"><thead><tr><th scope="col">Aluno</th><th scope="col">Adaptação</th><th scope="col">Tempo por questão</th><th scope="col">Recursos</th></tr></thead>
          <tbody>{state.accommodations.map((a) => <tr key={a.id}><td className="b">{a.student} · {a.className}</td><td>{a.kind}</td><td className="mono">{clock(a.targetSeconds)}</td><td className="soft">{a.resources}</td></tr>)}</tbody></table></div>
      ) : null}
      {state.students.length === 0 ? <p className="sub">Importe os alunos antes de registrar adaptações.</p> : (
        <form onSubmit={submit}>
          <div className="form-grid">
            <label className="field">Aluno<select className="input" name="studentId" required>{state.students.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.className}</option>)}</select></label>
            <label className="field">Adaptação<input className="input" name="kind" required minLength={2} placeholder="Tempo adicional" /></label>
            <label className="field">Minutos a mais na prova<input className="input" name="extraMinutes" type="number" min={0} max={120} defaultValue={60} /></label>
            <label className="field">Recursos<input className="input" name="resources" placeholder="Fonte ampliada" /></label>
          </div>
          <div className="btn-row"><button className="btn" type="submit">Adicionar</button></div>
        </form>
      )}
    </div>
  );
}

function DiagnosticStep({ state, path, onSaved }: StepProps) {
  const save = useSave({ path, onSaved });
  const toast = useToast();
  const [date, setDate] = useState(state.diagnostic.date ?? "");
  const [scope, setScope] = useState(state.diagnostic.scope);
  async function release() {
    try {
      onSaved(await api.post<OnboardingState>(`${path}/release`));
      toast("Escola liberada.");
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "Não foi possível liberar.");
    }
  }
  return (
    <div>
      <h2>Diagnóstico inicial</h2>
      <div className="form-grid">
        <label className="field">Data do diagnóstico<input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field">Áreas<input className="input" value={scope} onChange={(e) => setScope(e.target.value)} /></label>
      </div>
      <div className="btn-row"><button className="btn outline" type="button" onClick={() => void save({ diagnostic: { date: date || null, scope } })}>Salvar data</button></div>
      {state.released ? <div className="okbox">Escola liberada. Os alunos com consentimento já podem entrar.</div> : (
        <>
          {state.blockers.length > 0 ? <div className="notice warn" style={{ marginTop: 20 }}>Falta: {state.blockers.join("; ")}.</div> : <div className="okbox">Tudo pronto para liberar.</div>}
          <div className="btn-row"><button className="btn" type="button" disabled={state.blockers.length > 0} onClick={() => void release()}>Liberar a escola</button></div>
        </>
      )}
    </div>
  );
}

const VIEWS = [SchoolStep, TermsStep, RosterStep, AccessStep, DiagnosticStep];

function Wizard({ initial }: { initial: OnboardingState }) {
  const [state, setState] = useState(initial);
  const [step, setStep] = useState(0);
  const path = `/api/onboarding/${state.schoolId}`;
  const View = VIEWS[step]!;
  const done = [!!state.school.name, state.terms.dpaSigned && !!state.terms.dpoContact, state.roster.students > 0, state.accommodations.length > 0, state.released];
  return (
    <div className="page">
      <PageHead kicker="Implantação de escola" title={state.school.name} actions={<Pill tone={state.released ? "good" : "warn"}>{state.released ? "No ar" : "Em implantação"}</Pill>} />
      <div className="setup">
        <nav className="card setup-steps" aria-label="Passos da implantação">
          {STEPS.map(([name, sub], i) => (
            <button key={name} className={`step ${done[i] ? "done" : ""}`} type="button" aria-current={i === step ? "step" : undefined} onClick={() => setStep(i)}>
              <span className="mono">{done[i] ? "✓" : i + 1}</span>
              <span className="step-text">{name}<small>{sub}</small></span>
            </button>
          ))}
        </nav>
        <section className="card setup-body">
          <View key={step} state={state} path={path} onSaved={setState} />
          <div className="setup-foot">
            <button className="btn soft" type="button" disabled={step === 0} onClick={() => setStep(step - 1)}>Voltar</button>
            <button className="btn soft" type="button" disabled={step === STEPS.length - 1} onClick={() => setStep(step + 1)}>Próximo passo</button>
          </div>
        </section>
      </div>
    </div>
  );
}

export function OnboardingPage() {
  const me = useMe();
  const id = useParams().id ?? me.school?.id;
  const query = useQuery({ queryKey: ["onboarding", id], queryFn: () => api.get<OnboardingState>(`/api/onboarding/${id}`), enabled: !!id, refetchOnWindowFocus: false });
  if (!id) return <div className="state">Escolha uma escola no <Link to="/">painel da rede</Link>.</div>;
  return <Async query={query}>{(state) => <Wizard key={state.schoolId} initial={state} />}</Async>;
}
