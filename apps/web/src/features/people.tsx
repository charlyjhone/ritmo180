// Pessoas da escola: senha provisória para quem perdeu o acesso e pedidos de exclusão de dados.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DeletionRequestView, Person, Role } from "@ritmo/contracts";
import { api, ApiError } from "../lib/api.ts";
import { Async, PageHead } from "../ui/kit.tsx";
import { useToast } from "../ui/toast.tsx";

const ROLE_LABEL: Record<Role, string> = { student: "Aluno", teacher: "Professor", coordinator: "Coordenação", guardian: "Família", network_admin: "Rede" };

function PersonRow({ person }: { person: Person }) {
  const toast = useToast();
  const [temporary, setTemporary] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  async function reset() {
    try {
      setTemporary((await api.post<{ temporaryPassword: string }>(`/api/school/people/${person.id}/reset-password`)).temporaryPassword);
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "Sem conexão com o servidor.");
    } finally {
      setConfirming(false);
    }
  }
  return (
    <div className="row-box" style={{ flexWrap: "wrap" }}>
      <div className="grow">
        <div className="row-title">{person.name}</div>
        <div className="row-sub">{ROLE_LABEL[person.role]}{person.className ? ` · ${person.className}` : ""}{person.email ? ` · ${person.email}` : ""}</div>
      </div>
      {temporary ? null : confirming ? (
        <div className="btn-row" style={{ margin: 0 }}>
          <button className="btn slim" type="button" onClick={() => void reset()}>Confirmar</button>
          <button className="btn soft slim" type="button" onClick={() => setConfirming(false)}>Cancelar</button>
        </div>
      ) : <button className="btn soft slim" type="button" onClick={() => setConfirming(true)}>Gerar senha provisória</button>}
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
        {(requests) => requests.length === 0 ? <p className="sub">Nenhum pedido em aberto.</p> : (
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
  const [search, setSearch] = useState("");
  const query = useQuery({ queryKey: ["people", search], queryFn: () => api.get<Person[]>(`/api/school/people?q=${encodeURIComponent(search)}`) });
  return (
    <div className="page">
      <PageHead kicker="Coordenação" title="Pessoas da escola" />
      <DeletionRequests />
      <section className="card" aria-labelledby="pessoas-title">
        <h2 id="pessoas-title">Quem perdeu a senha</h2>
        <p className="sub">Não enviamos senha por e-mail. Gere uma senha provisória e entregue à pessoa com segurança.</p>
        <label className="field">Buscar por nome ou e-mail<input className="input" value={search} maxLength={120} onChange={(e) => setSearch(e.target.value)} /></label>
        <Async query={query}>
          {(people) => people.length === 0 ? <p className="sub">Ninguém encontrado.</p> : <div className="stack">{people.map((p) => <PersonRow key={p.id} person={p} />)}</div>}
        </Async>
      </section>
    </div>
  );
}
