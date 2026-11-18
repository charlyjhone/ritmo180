// Minha conta: troca de senha e, para aluno e família, os direitos sobre os dados do aluno.
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { FamilyChild } from "@ritmo/contracts";
import { api, ApiError } from "../lib/api.ts";
import { PageHead, saveFile } from "../ui/kit.tsx";
import { useToast } from "../ui/toast.tsx";
import { guestDate, logout, PasswordForm, useMe } from "./session.tsx";

function StudentData({ studentId, name }: { studentId?: string; name?: string }) {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const fail = (error: unknown) => toast(error instanceof ApiError ? error.message : "Sem conexão com o servidor.");
  const query = studentId ? `?studentId=${studentId}` : "";
  async function download() {
    try {
      const data = await api.get<unknown>(`/api/privacy/my-data${query}`);
      saveFile(`dados-${name ?? "ritmo180"}.json`, JSON.stringify(data, null, 2), "application/json;charset=utf-8");
    } catch (error) {
      fail(error);
    }
  }
  async function requestDeletion() {
    try {
      await api.post("/api/privacy/deletion-requests", { studentId });
      toast("Pedido enviado à coordenação da escola.");
    } catch (error) {
      fail(error);
    } finally {
      setConfirming(false);
    }
  }
  return (
    <div className="row-box" style={{ flexWrap: "wrap" }}>
      {name ? <div className="grow"><div className="row-title">{name}</div></div> : null}
      <div className="btn-row" style={{ margin: 0 }}>
        <button className="btn soft slim" type="button" onClick={() => void download()}>Baixar cópia dos dados</button>
        {confirming ? (
          <>
            <button className="btn slim" type="button" onClick={() => void requestDeletion()}>Confirmar pedido</button>
            <button className="btn soft slim" type="button" onClick={() => setConfirming(false)}>Cancelar</button>
          </>
        ) : <button className="btn outline slim" type="button" onClick={() => setConfirming(true)}>Pedir exclusão</button>}
      </div>
      {confirming ? <p className="sub" style={{ width: "100%", margin: 0 }}>A coordenação analisa o pedido. Se aprovar, a conta é apagada e os dados pessoais deixam de existir. As respostas ficam sem nome, só para estatística das questões.</p> : null}
    </div>
  );
}

function FamilyData() {
  const query = useQuery({ queryKey: ["family"], queryFn: () => api.get<FamilyChild[]>("/api/insights/family") });
  return <>{query.data?.map((child) => <StudentData key={child.id} studentId={child.id} name={child.name} />)}</>;
}

function GuestAccount({ until }: { until: number }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <section className="card" aria-labelledby="visitante-title">
      <h2 id="visitante-title">Você está como visitante</h2>
      <p className="sub">Esta conta não tem nome, e-mail nem senha. O progresso fica guardado neste aparelho até {guestDate(until)} e depois é apagado. Para guardar de vez, peça uma conta à sua escola.</p>
      <div className="btn-row">
        {confirming ? (
          <>
            <button className="btn slim" type="button" onClick={() => void logout()}>Apagar agora</button>
            <button className="btn soft slim" type="button" onClick={() => setConfirming(false)}>Cancelar</button>
          </>
        ) : <button className="btn outline slim" type="button" onClick={() => setConfirming(true)}>Sair e apagar meu progresso</button>}
      </div>
    </section>
  );
}

export function AccountPage() {
  const me = useMe();
  const toast = useToast();
  if (me.guestUntil) {
    return (
      <div className="page" style={{ maxWidth: 640 }}>
        <PageHead kicker={me.name} title="Minha conta" />
        <GuestAccount until={me.guestUntil} />
      </div>
    );
  }
  const hasStudentData = me.role === "student" || me.role === "guardian";
  return (
    <div className="page" style={{ maxWidth: 640 }}>
      {me.role === "guardian" ? <Link to="/">Voltar ao portal</Link> : null}
      <PageHead kicker={me.name} title="Minha conta" />
      <section className="card" aria-labelledby="senha-title">
        <h2 id="senha-title">Trocar senha</h2>
        <PasswordForm onDone={() => toast("Senha alterada.")} />
      </section>
      {hasStudentData ? (
        <section className="card" aria-labelledby="dados-title">
          <h2 id="dados-title">Dados do aluno</h2>
          <p className="sub">Veja o que a escola guarda ou peça a exclusão. <Link to="/privacidade">Política de privacidade</Link></p>
          <div className="stack">{me.role === "student" ? <StudentData /> : <FamilyData />}</div>
        </section>
      ) : null}
    </div>
  );
}
