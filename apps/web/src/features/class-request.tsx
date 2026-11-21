// "Quero ver essa em sala": a dúvida que a resolução escrita não resolveu chega ao professor, sem expor o aluno.
import { useState } from "react";
import { api, ApiError } from "../lib/api.ts";
import { useMe } from "./session.tsx";

export function AskInClass({ itemId }: { itemId: string }) {
  const me = useMe();
  const [wanted, setWanted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (me.role !== "student" || me.guestUntil) return null;
  async function toggle() {
    setBusy(true);
    setError("");
    try {
      const result = await api.post<{ wanted: boolean }>("/api/study/class-request", { itemId, wanted: !wanted });
      setWanted(result.wanted);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível enviar agora. Confira a internet e tente de novo.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ask-class">
      {wanted ? (
        <p className="note" role="status">
          Pedido enviado. Seu professor vê quantos alunos pediram esta questão, sem nomes.{" "}
          <button className="linkish" type="button" disabled={busy} onClick={() => void toggle()}>Desfazer</button>
        </p>
      ) : (
        <button className="btn soft slim" type="button" disabled={busy} onClick={() => void toggle()}>Quero ver essa em sala</button>
      )}
      {error ? <p className="note" role="alert">{error}</p> : null}
    </div>
  );
}
