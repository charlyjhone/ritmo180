// Sessão do usuário: login, perfil em cache para abrir sem internet e menu por papel.
import { createContext, useContext, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Me, Role } from "@ritmo/contracts";
import { api, ApiError } from "../lib/api.ts";

const CACHE_KEY = "ritmo-me";
const SessionContext = createContext<Me | null>(null);

export function useMe(): Me {
  const me = useContext(SessionContext);
  if (!me) throw new Error("Sessão ausente.");
  return me;
}

function cachedMe(): Me | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Me) : null;
  } catch {
    return null;
  }
}

async function fetchMe(): Promise<Me | null> {
  try {
    const me = await api.get<Me>("/api/me");
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(me));
    } catch {
      // Sem armazenamento o aplicativo só perde a abertura sem internet.
    }
    return me;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    if (error instanceof ApiError) throw error;
    return cachedMe();
  }
}

export async function logout() {
  await api.post("/api/auth/logout").catch(() => {});
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // Nada a limpar.
  }
  location.assign("/");
}

function Login() {
  const client = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/auth/login", { email: form.get("email"), password: form.get("password") });
      await client.invalidateQueries({ queryKey: ["me"] });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Sem conexão com o servidor.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <section className="card">
        <div className="brand">
          <div className="logo">180</div>
          <div><div className="brand-name">Ritmo 180</div><div className="brand-sub">Treino de tempo e leitura para o ENEM</div></div>
        </div>
        <h1 style={{ fontSize: 24, marginBottom: 16 }}>Entrar</h1>
        <form onSubmit={submit}>
          <label className="field">E-mail<input className="input" name="email" type="email" autoComplete="username" required /></label>
          <label className="field">Senha<input className="input" name="password" type="password" autoComplete="current-password" minLength={8} required /></label>
          {error ? <div className="notice bad" role="alert">{error}</div> : null}
          <button className="btn" type="submit" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
        </form>
      </section>
    </main>
  );
}

const BLOCK_TEXT = {
  school_not_released: "Sua escola ainda está em implantação. O acesso abre assim que a coordenação liberar.",
  consent_required: "Falta o consentimento do seu responsável. Peça para ele procurar a coordenação da escola.",
};

export function SessionGate({ children }: { children: ReactNode }) {
  const query = useQuery({ queryKey: ["me"], queryFn: fetchMe, retry: false, staleTime: 60_000 });
  if (query.isPending) return <div className="state" role="status">Carregando…</div>;
  if (query.isError) return <div className="state" role="alert">{query.error.message}</div>;
  const me = query.data;
  if (!me) return <Login />;
  if (me.blocked) {
    return (
      <main className="login">
        <section className="card">
          <h1 style={{ fontSize: 24 }}>Acesso ainda não liberado</h1>
          <p className="sub">{BLOCK_TEXT[me.blocked]}</p>
          <div className="btn-row"><button className="btn soft" type="button" onClick={() => void logout()}>Sair</button></div>
        </section>
      </main>
    );
  }
  return <SessionContext.Provider value={me}>{children}</SessionContext.Provider>;
}

export const NAV: Record<Role, { to: string; label: string }[]> = {
  student: [{ to: "/", label: "Painel" }, { to: "/plano", label: "Plano" }, { to: "/treino", label: "Treino" }, { to: "/erros", label: "Erros" }, { to: "/leitura", label: "Leitura" }, { to: "/simulado", label: "Simulado" }],
  teacher: [{ to: "/", label: "Professor" }],
  coordinator: [{ to: "/", label: "Direção" }, { to: "/professor", label: "Professor" }, { to: "/implantacao", label: "Implantação" }],
  guardian: [{ to: "/", label: "Família" }],
  network_admin: [{ to: "/", label: "Rede" }],
};
