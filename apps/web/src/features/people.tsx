// Pessoas da escola: cadastro de alunos, professores, famílias e coordenação, autorização dos responsáveis,
// senha provisória para quem perdeu o acesso e pedidos de exclusão de dados.
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GRADES, type CreatedPerson, type DeletionRequestView, type Person, type Role, type SchoolClass } from "@ritmo/contracts";
import { api, ApiError } from "../lib/api.ts";
import { Async, Empty, PageHead, Pill, saveFile } from "../ui/kit.tsx";
import { useToast } from "../ui/toast.tsx";
import { useMe } from "./session.tsx";

const ROLE_LABEL: Record<Role, string> = { student: "Aluno", teacher: "Professor", coordinator: "Coordenação", guardian: "Família", network_admin: "Rede" };
type SchoolRole = Exclude<Role, "network_admin">;
const NEW_ROLES: SchoolRole[] = ["student", "teacher", "guardian", "coordinator"];
const failure = (error: unknown) => (error instanceof ApiError ? error.message : "Sem conexão com o servidor.");

function useClasses() {
  return useQuery({ queryKey: ["school-classes"], queryFn: () => api.get<SchoolClass[]>("/api/school/classes") });
}

/** Turmas do professor: marque quantas quiser. */
function ClassPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const query = useClasses();
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend style={{ padding: 0, marginBottom: 6 }}>Turmas</legend>
      <Async query={query}>
        {(classes) => classes.length === 0 ? <Empty icon="people" title="Nenhuma turma ainda">Cadastre um aluno com a turma ou importe a planilha na Implantação.</Empty> : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 18px" }}>
            {classes.map((c) => (
              <label className="chk" key={c.id} style={{ border: 0, padding: "6px 0" }}>
                <input type="checkbox" checked={value.includes(c.id)} onChange={(e) => onChange(e.target.checked ? [...value, c.id] : value.filter((id) => id !== c.id))} />
                <span>{c.name} <span className="soft">· {c.grade}</span></span>
              </label>
            ))}
          </div>
        )}
      </Async>
    </fieldset>
  );
}

/** Alunos ligados à família: busca por nome ou e-mail e marca. */
function StudentPicker({ value, onChange }: { value: { id: string; name: string }[]; onChange: (students: { id: string; name: string }[]) => void }) {
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["people", "student-picker", search],
    queryFn: () => api.get<Person[]>(`/api/school/people?perfil=student&q=${encodeURIComponent(search)}`),
    enabled: search.trim().length >= 2,
  });
  const chosen = new Set(value.map((s) => s.id));
  return (
    <div className="field">
      <span>Alunos desta família</span>
      {value.length > 0 ? (
        <div className="btn-row" style={{ margin: 0 }}>
          {value.map((s) => <button key={s.id} className="btn soft slim" type="button" aria-label={`Tirar ${s.name}`} onClick={() => onChange(value.filter((x) => x.id !== s.id))}>{s.name} ×</button>)}
        </div>
      ) : null}
      <input className="input" placeholder="Busque o aluno pelo nome ou e-mail" aria-label="Buscar aluno" value={search} maxLength={120} onChange={(e) => setSearch(e.target.value)} />
      {search.trim().length >= 2 && query.data ? (
        query.data.length === 0 ? <Empty icon="search" title="Nenhum aluno encontrado">Confira o nome ou a turma digitados.</Empty> : (
          <div className="stack">
            {query.data.filter((p) => !chosen.has(p.id)).slice(0, 6).map((p) => (
              <button key={p.id} className="btn outline slim" type="button" style={{ justifyContent: "flex-start" }} onClick={() => { onChange([...value, { id: p.id, name: p.name }]); setSearch(""); }}>
                + {p.name}{p.className ? ` · ${p.className}` : ""}
              </button>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

/** Turma do aluno: escolha uma existente ou escreva o nome de uma nova. */
function StudentClassFields({ className, grade, onClass, onGrade }: { className: string; grade: string; onClass: (v: string) => void; onGrade: (v: string) => void }) {
  const classes = useClasses().data ?? [];
  return (
    <>
      <label className="field">Turma
        <input className="input" list="turmas-da-escola" value={className} maxLength={40} required placeholder="Ex.: 3ª A" onChange={(e) => {
          onClass(e.target.value);
          const known = classes.find((c) => c.name === e.target.value);
          if (known) onGrade(known.grade);
        }} />
        <datalist id="turmas-da-escola">{classes.map((c) => <option key={c.id} value={c.name} />)}</datalist>
      </label>
      <label className="field">Série
        <select className="input" value={grade} onChange={(e) => onGrade(e.target.value)}>{GRADES.map((g) => <option key={g}>{g}</option>)}</select>
      </label>
    </>
  );
}

function Credentials({ name, email, password }: { name: string; email: string; password: string }) {
  return (
    <div className="notice" role="status" style={{ marginTop: 16 }}>
      Conta de <b>{name}</b> criada. Entregue com segurança: e-mail <b className="mono">{email}</b>, senha provisória <b className="mono">{password}</b>.
      Ela só aparece agora e precisa ser trocada no primeiro acesso.
    </div>
  );
}

function AddPerson() {
  const client = useQueryClient();
  const toast = useToast();
  const [role, setRole] = useState<SchoolRole>("student");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [className, setClassName] = useState("");
  const [grade, setGrade] = useState<string>("3ª série");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [classIds, setClassIds] = useState<string[]>([]);
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ name: string; email: string; password: string } | null>(null);

  function reset() {
    setName(""); setEmail(""); setClassName(""); setGuardianEmail(""); setConsent(false); setClassIds([]); setStudents([]);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (role === "guardian" && students.length === 0) {
      toast("Escolha pelo menos um aluno para a família.");
      return;
    }
    const body = role === "student" ? { role, name, email, className, grade, guardianEmail, consent }
      : role === "teacher" ? { role, name, email, classIds }
      : role === "guardian" ? { role, name, email, studentIds: students.map((s) => s.id) }
      : { role, name, email };
    setBusy(true);
    try {
      const result = await api.post<CreatedPerson>("/api/school/people", body);
      setCreated({ name, email: email.trim().toLowerCase(), password: result.temporaryPassword });
      reset();
      await client.invalidateQueries({ queryKey: ["people"] });
      await client.invalidateQueries({ queryKey: ["school-classes"] });
    } catch (error) {
      toast(failure(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card" aria-labelledby="nova-pessoa-title">
      <h2 id="nova-pessoa-title">Cadastrar pessoa</h2>
      <p className="sub">Para muitos alunos de uma vez, use a planilha na página Implantação. Aqui é uma pessoa por vez.</p>
      <form onSubmit={(e) => void submit(e)}>
        <div className="form-grid">
          <label className="field">Perfil
            <select className="input" value={role} onChange={(e) => { setRole(e.target.value as SchoolRole); setCreated(null); }}>
              {NEW_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </label>
          <label className="field">Nome completo<input className="input" value={name} minLength={3} maxLength={120} required onChange={(e) => setName(e.target.value)} /></label>
          <label className="field">E-mail<input className="input" type="email" value={email} maxLength={160} required onChange={(e) => setEmail(e.target.value)} /></label>
          {role === "student" ? (
            <>
              <StudentClassFields className={className} grade={grade} onClass={setClassName} onGrade={setGrade} />
              <label className="field">E-mail do responsável<input className="input" type="email" value={guardianEmail} maxLength={160} required onChange={(e) => setGuardianEmail(e.target.value)} /></label>
            </>
          ) : null}
        </div>
        {role === "student" ? <label className="chk"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>A escola já recebeu o termo assinado pelo responsável. Sem isso o aluno não consegue entrar.</span></label> : null}
        {role === "teacher" ? <div style={{ marginTop: 16 }}><ClassPicker value={classIds} onChange={setClassIds} /></div> : null}
        {role === "guardian" ? <div style={{ marginTop: 16 }}><StudentPicker value={students} onChange={setStudents} /></div> : null}
        <div className="btn-row"><button className="btn" type="submit" disabled={busy}>{busy ? "Cadastrando…" : `Cadastrar ${ROLE_LABEL[role].toLowerCase()}`}</button></div>
      </form>
      {created ? <Credentials {...created} /> : null}
    </section>
  );
}

function ConsentControl({ person }: { person: Person }) {
  const client = useQueryClient();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const signed = person.consentAt !== null;
  async function save() {
    try {
      await api.post(`/api/school/people/${person.id}/consent`, { signed: !signed });
      toast(signed ? "Autorização retirada. O aluno não consegue mais entrar." : "Autorização registrada. O aluno já pode entrar.");
      await client.invalidateQueries({ queryKey: ["people"] });
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "Sem conexão com o servidor.");
    } finally {
      setConfirming(false);
    }
  }
  return (
    <div className="btn-row" style={{ margin: 0, alignItems: "center" }}>
      {signed
        ? <Pill tone="good">Autorização em {new Date(person.consentAt!).toLocaleDateString("pt-BR")}</Pill>
        : <Pill tone="warn">Aguarda autorização</Pill>}
      {confirming ? (
        <>
          <button className="btn slim" type="button" onClick={() => void save()}>{signed ? "Confirmar retirada" : "Confirmar: termo assinado"}</button>
          <button className="btn soft slim" type="button" onClick={() => setConfirming(false)}>Cancelar</button>
        </>
      ) : <button className={signed ? "btn soft slim" : "btn slim"} type="button" onClick={() => setConfirming(true)}>{signed ? "Retirar autorização" : "Registrar termo assinado"}</button>}
    </div>
  );
}

function EditPerson({ person, onDone }: { person: Person; onDone: () => void }) {
  const client = useQueryClient();
  const toast = useToast();
  const classes = useClasses().data ?? [];
  const current = person.classes[0];
  const [name, setName] = useState(person.name);
  const [className, setClassName] = useState(current?.name ?? "");
  const [grade, setGrade] = useState<string>(classes.find((c) => c.id === current?.id)?.grade ?? "3ª série");
  const [classIds, setClassIds] = useState(person.classes.map((c) => c.id));
  const [students, setStudents] = useState(person.students);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = person.role === "student" ? { name, className, grade }
      : person.role === "teacher" ? { name, classIds }
      : person.role === "guardian" ? { name, studentIds: students.map((s) => s.id) }
      : { name };
    try {
      await api.patch(`/api/school/people/${person.id}`, body);
      toast("Alterações salvas.");
      await client.invalidateQueries({ queryKey: ["people"] });
      await client.invalidateQueries({ queryKey: ["school-classes"] });
      onDone();
    } catch (error) {
      toast(failure(error));
    }
  }
  return (
    <form onSubmit={(e) => void save(e)} style={{ width: "100%" }}>
      <div className="form-grid" style={{ marginTop: 8 }}>
        <label className="field">Nome completo<input className="input" value={name} minLength={3} maxLength={120} required onChange={(e) => setName(e.target.value)} /></label>
        {person.role === "student" ? <StudentClassFields className={className} grade={grade} onClass={setClassName} onGrade={setGrade} /> : null}
      </div>
      {person.role === "teacher" ? <div style={{ marginTop: 16 }}><ClassPicker value={classIds} onChange={setClassIds} /></div> : null}
      {person.role === "guardian" ? <div style={{ marginTop: 16 }}><StudentPicker value={students} onChange={setStudents} /></div> : null}
      <div className="btn-row">
        <button className="btn slim" type="submit">Salvar</button>
        <button className="btn soft slim" type="button" onClick={onDone}>Cancelar</button>
      </div>
    </form>
  );
}

function ActiveControl({ person }: { person: Person }) {
  const client = useQueryClient();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  async function toggle() {
    try {
      await api.post(`/api/school/people/${person.id}/active`, { active: !person.active });
      toast(person.active ? "Conta desativada. A pessoa não consegue mais entrar; os dados ficam guardados." : "Conta reativada.");
      await client.invalidateQueries({ queryKey: ["people"] });
    } catch (error) {
      toast(failure(error));
    } finally {
      setConfirming(false);
    }
  }
  if (!person.active) return <button className="btn outline slim" type="button" onClick={() => void toggle()}>Reativar</button>;
  return confirming ? (
    <div className="btn-row" style={{ margin: 0 }}>
      <button className="btn slim" type="button" onClick={() => void toggle()}>Confirmar desativação</button>
      <button className="btn soft slim" type="button" onClick={() => setConfirming(false)}>Cancelar</button>
    </div>
  ) : <button className="btn soft slim" type="button" onClick={() => setConfirming(true)}>Desativar</button>;
}

/** Direitos do titular quando o pedido chega por fora: cópia dos dados e registro do pedido de exclusão. */
function PrivacyControl({ person }: { person: Person }) {
  const client = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  async function copy() {
    try {
      const data = await api.get<unknown>(`/api/school/people/${person.id}/data`);
      saveFile(`dados-${person.name.toLowerCase().replace(/\s+/g, "-")}.json`, JSON.stringify(data, null, 2), "application/json;charset=utf-8");
      toast("Cópia dos dados baixada. Entregue só ao aluno ou ao responsável.");
    } catch (error) {
      toast(failure(error));
    }
  }
  async function request() {
    try {
      await api.post(`/api/school/people/${person.id}/deletion-request`);
      toast("Pedido registrado. Aprove em “Pedidos de exclusão de dados”, no fim da página.");
      await client.invalidateQueries({ queryKey: ["deletion-requests"] });
    } catch (error) {
      toast(failure(error));
    } finally {
      setOpen(false);
    }
  }
  return open ? (
    <div className="btn-row" style={{ margin: 0 }}>
      <button className="btn soft slim" type="button" onClick={() => void copy()}>Baixar cópia dos dados</button>
      <button className="btn outline slim" type="button" onClick={() => void request()}>Registrar pedido de exclusão</button>
      <button className="btn later slim" type="button" onClick={() => setOpen(false)}>Fechar</button>
    </div>
  ) : <button className="btn soft slim" type="button" aria-label={`Dados pessoais de ${person.name} (LGPD)`} onClick={() => setOpen(true)}>Dados (LGPD)</button>;
}

function PersonRow({ person, isMe }: { person: Person; isMe: boolean }) {
  const toast = useToast();
  const [temporary, setTemporary] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  async function reset() {
    try {
      setTemporary((await api.post<{ temporaryPassword: string }>(`/api/school/people/${person.id}/reset-password`)).temporaryPassword);
    } catch (error) {
      toast(failure(error));
    } finally {
      setConfirming(false);
    }
  }
  const links = person.role === "guardian" ? person.students.map((s) => s.name) : person.classes.map((c) => c.name);
  return (
    <div className="row-box" style={{ flexWrap: "wrap", opacity: person.active ? 1 : 0.7 }}>
      <div className="grow">
        <div className="row-title">{person.name}{person.active ? null : <> <Pill>Desativada</Pill></>}</div>
        <div className="row-sub">{ROLE_LABEL[person.role]}{links.length > 0 ? ` · ${links.join(", ")}` : person.role === "teacher" ? " · sem turma" : ""}{person.email ? ` · ${person.email}` : ""}</div>
      </div>
      {person.role === "student" && person.active ? <ConsentControl person={person} /> : null}
      {person.role === "student" && !isMe ? <PrivacyControl person={person} /> : null}
      {person.active && !editing && !isMe ? <button className="btn soft slim" type="button" onClick={() => setEditing(true)}>Editar</button> : null}
      {!person.active || isMe || temporary ? null : confirming ? (
        <div className="btn-row" style={{ margin: 0 }}>
          <button className="btn slim" type="button" onClick={() => void reset()}>Confirmar</button>
          <button className="btn soft slim" type="button" onClick={() => setConfirming(false)}>Cancelar</button>
        </div>
      ) : <button className="btn soft slim" type="button" onClick={() => setConfirming(true)}>Gerar senha provisória</button>}
      {isMe ? <Pill>Você</Pill> : <ActiveControl person={person} />}
      {editing ? <EditPerson person={person} onDone={() => setEditing(false)} /> : null}
      {temporary ? <div className="notice" role="status" style={{ width: "100%", margin: 0 }}>Senha provisória: <b className="mono">{temporary}</b>. Ela só aparece agora e deve ser trocada no primeiro acesso.</div> : null}
    </div>
  );
}

function DeletionRequests() {
  const client = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: ["deletion-requests"], queryFn: () => api.get<DeletionRequestView[]>("/api/school/deletion-requests") });
  const [confirming, setConfirming] = useState<string | null>(null);
  async function decide(id: string, approved: boolean) {
    try {
      await api.post(`/api/school/deletion-requests/${id}`, { approved });
      toast(approved ? "Dados do aluno excluídos." : "Pedido recusado.");
      await client.invalidateQueries({ queryKey: ["deletion-requests"] });
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "Sem conexão com o servidor.");
    } finally {
      setConfirming(null);
    }
  }
  return (
    <section className="card" aria-labelledby="exclusao-title">
      <h2 id="exclusao-title">Pedidos de exclusão de dados</h2>
      <Async query={query}>
        {(requests) => requests.length === 0 ? <Empty icon="done" title="Nenhum pedido em aberto" /> : (
          <div className="stack">
            {requests.map((r) => (
              <div className="row-box" style={{ flexWrap: "wrap" }} key={r.id}>
                <div className="grow"><div className="row-title">{r.student}</div><div className="row-sub">Pedido por {r.requester} em {new Date(r.createdAt).toLocaleDateString("pt-BR")}</div></div>
                <div className="btn-row" style={{ margin: 0 }}>
                  {confirming === r.id ? <button className="btn slim" type="button" onClick={() => void decide(r.id, true)}>Excluir de forma definitiva</button> : <button className="btn outline slim" type="button" onClick={() => setConfirming(r.id)}>Aprovar</button>}
                  <button className="btn soft slim" type="button" onClick={() => void decide(r.id, false)}>Recusar</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Async>
    </section>
  );
}

export function PeoplePage() {
  const me = useMe();
  const [search, setSearch] = useState("");
  const [inactive, setInactive] = useState(false);
  const query = useQuery({
    queryKey: ["people", search, inactive],
    queryFn: () => api.get<Person[]>(`/api/school/people?q=${encodeURIComponent(search)}${inactive ? "&inativos=sim" : ""}`),
  });
  return (
    <div className="page">
      <PageHead kicker="Coordenação" title="Pessoas da escola" />
      <AddPerson />
      <DeletionRequests />
      <section className="card" aria-labelledby="pessoas-title">
        <h2 id="pessoas-title">Contas, autorizações e senhas</h2>
        <p className="sub">O aluno só entra depois que a escola registra o termo assinado pelo responsável. Não enviamos senha por e-mail: gere uma senha provisória e entregue à pessoa com segurança.</p>
        <label className="field">Buscar por nome ou e-mail<input className="input" value={search} maxLength={120} onChange={(e) => setSearch(e.target.value)} /></label>
        <label className="chk"><input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} /><span>Mostrar também as contas desativadas</span></label>
        <Async query={query}>
          {(people) => people.length === 0 ? <p className="sub">Ninguém encontrado.</p> : <div className="stack">{people.map((p) => <PersonRow key={p.id} person={p} isMe={p.id === me.id} />)}</div>}
        </Async>
      </section>
    </div>
  );
}
