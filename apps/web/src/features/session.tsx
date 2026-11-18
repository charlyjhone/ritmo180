// Sessão do usuário: login, perfil em cache para abrir sem internet e menu por papel.
import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Me, Role } from "@ritmo/contracts";
import { api, ApiError } from "../lib/api.ts";
import { clearPack, flushQueue } from "../lib/offline.ts";

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

/** Data em que o acesso de visitante acaba, no formato curto do Brasil. */
export function guestDate(until: number): string {
  return new Date(until).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export async function logout() {
  // Envia o que ainda está na fila e tira o treino salvo, para o próximo a usar o aparelho não ver nada.
  await flushQueue().catch(() => {});
  await clearPack().catch(() => {});
  await api.post("/api/auth/logout").catch(() => {});
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // Nada a limpar.
  }
  location.assign("/");
}

const GUEST_PATH = "/visitante";

/** Entra como visitante e volta para o início. Usado pelo botão e pelo link /visitante. */
async function enterAsGuest() {
  await api.post("/api/auth/visitante");
  if (location.pathname === GUEST_PATH) history.replaceState(null, "", "/");
}

function GuestButton({ onError }: { onError: (message: string) => void }) {
  const client = useQueryClient();
  const options = useQuery({ queryKey: ["auth-options"], queryFn: () => api.get<{ visitante: boolean }>("/api/auth/opcoes"), staleTime: Infinity });
  const [busy, setBusy] = useState(false);
  if (!options.data?.visitante) return null;
  async function enter() {
    setBusy(true);
    try {
      await enterAsGuest();
      await client.invalidateQueries({ queryKey: ["me"] });
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "Sem conexão com o servidor.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="guest-entry">
      <div className="guest-divider"><span>ou</span></div>
      <button className="btn soft" type="button" onClick={() => void enter()} disabled={busy}>{busy ? "Entrando…" : "Entrar sem cadastro"}</button>
      <p className="sub" style={{ marginTop: 8 }}>Sem nome e sem e-mail. Seu progresso fica neste aparelho por 7 dias e depois é apagado.</p>
    </div>
  );
}

/** Link direto para compartilhar: abre a plataforma já como visitante. */
function GuestLink() {
  const client = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    enterAsGuest()
      .then(() => client.invalidateQueries({ queryKey: ["me"] }))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Sem conexão com o servidor."));
  }, [client]);
  if (!error) return <div className="state" role="status">Preparando seu acesso…</div>;
  return (
    <main className="login">
      <section className="card">
        <h1 style={{ fontSize: 24 }}>Não deu para entrar</h1>
        <div className="notice bad" role="alert">{error}</div>
        <div className="btn-row"><a className="btn soft" href="/">Ir para o login</a></div>
      </section>
    </main>
  );
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
        <GuestButton onError={setError} />
        <p className="sub" style={{ marginTop: 16 }}>Esqueceu a senha? Peça uma senha provisória à coordenação da sua escola.</p>
        <p className="sub"><a href="/privacidade">Política de privacidade</a></p>
      </section>
    </main>
  );
}

/** Usado na troca obrigatória e na página Minha conta. */
export function PasswordForm({ onDone }: { onDone: () => Promise<void> | void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    if (form.get("next") !== form.get("repeat")) return setError("As duas senhas novas não são iguais.");
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/auth/password", { current: form.get("current"), next: form.get("next") });
      element.reset();
      await onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Sem conexão com o servidor.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <label className="field">Senha atual<input className="input" name="current" type="password" autoComplete="current-password" required /></label>
      <label className="field">Nova senha<input className="input" name="next" type="password" autoComplete="new-password" minLength={8} required /></label>
      <label className="field">Repita a nova senha<input className="input" name="repeat" type="password" autoComplete="new-password" minLength={8} required /></label>
      {error ? <div className="notice bad" role="alert">{error}</div> : null}
      <button className="btn" type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar nova senha"}</button>
    </form>
  );
}

function RequiredPasswordChange() {
  const client = useQueryClient();
  return (
    <main className="login">
      <section className="card">
        <h1 style={{ fontSize: 24 }}>Crie a sua senha</h1>
        <p className="sub">Você entrou com uma senha provisória. Escolha uma senha só sua para continuar.</p>
        <PasswordForm onDone={() => client.invalidateQueries({ queryKey: ["me"] })} />
        <div className="btn-row"><button className="btn soft" type="button" onClick={() => void logout()}>Sair</button></div>
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
  if (!me) return location.pathname === GUEST_PATH ? <GuestLink /> : <Login />;
  if (me.blocked === "password_change") return <RequiredPasswordChange />;
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
  coordinator: [{ to: "/", label: "Direção" }, { to: "/professor", label: "Professor" }, { to: "/pessoas", label: "Pessoas" }, { to: "/implantacao", label: "Implantação" }],
  guardian: [{ to: "/", label: "Família" }],
  network_admin: [{ to: "/", label: "Rede" }],
};
