import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "@fontsource/source-serif-4/400.css";
import "@fontsource/source-serif-4/600.css";
import "./styles.css";
import { onQueueChange, pendingCount, startSync } from "./lib/offline.ts";
import { AccountPage } from "./features/account.tsx";
import { DiagnosticPage } from "./features/diagnostic.tsx";
import { ExamList, ResultPage, SittingPage } from "./features/exam.tsx";
import { FamilyHome } from "./features/family.tsx";
import { NetworkHome } from "./features/network.tsx";
import { OnboardingPage } from "./features/onboarding.tsx";
import { MistakesPage } from "./features/mistakes.tsx";
import { PeoplePage } from "./features/people.tsx";
import { PlanPage } from "./features/plan.tsx";
import { PracticePage } from "./features/practice.tsx";
import { PrivacyPolicy } from "./features/privacy-policy.tsx";
import { ReadingPage } from "./features/reading.tsx";
import { SchoolHome } from "./features/school.tsx";
import { guestDate, logout, NAV, SessionGate, useMe } from "./features/session.tsx";
import { StudentHome } from "./features/student.tsx";
import { TeacherHome } from "./features/teacher.tsx";
import { Pill } from "./ui/kit.tsx";
import { ToastProvider } from "./ui/toast.tsx";

const client = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } });

function SyncStatus() {
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const refresh = () => void pendingCount().then(setPending).catch(() => {});
    const net = () => setOnline(navigator.onLine);
    refresh();
    const off = onQueueChange(refresh);
    window.addEventListener("online", net);
    window.addEventListener("offline", net);
    return () => {
      off();
      window.removeEventListener("online", net);
      window.removeEventListener("offline", net);
    };
  }, []);
  if (online && pending === 0) return null;
  return <Pill tone="warn">{online ? "Enviando" : "Sem internet"}{pending ? ` · ${pending} ${pending === 1 ? "resposta guardada" : "respostas guardadas"}` : ""}</Pill>;
}

function Shell() {
  const me = useMe();
  const location = useLocation();
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    const section = NAV[me.role].find((link) => (link.to === "/" ? location.pathname === "/" : location.pathname.startsWith(link.to)));
    const label = location.pathname === "/conta" ? "Minha conta" : section?.label;
    document.title = label ? `${label} · Ritmo 180` : "Ritmo 180";
    main.current?.focus();
    window.scrollTo(0, 0);
  }, [location.pathname, me.role]);
  const dark = me.role === "network_admin";
  return (
    <>
      <a className="skip-link" href="#main">Pular para o conteúdo</a>
      <header id="topbar" className={dark ? "dark" : ""}>
        <div className="topbar-inner">
          <div className="brand">
            <div className="logo">180</div>
            <div><div className="brand-name">{dark ? "Ritmo 180 · Rede" : "Ritmo 180"}</div><div className="brand-sub">{me.school?.name ?? "Administração de todas as escolas"}</div></div>
          </div>
          <nav aria-label="Áreas da plataforma">
            {NAV[me.role].map((link) => <NavLink key={link.to} className="navlink" to={link.to} end={link.to === "/"}>{link.label}</NavLink>)}
          </nav>
          <div className="topbar-end">
            <SyncStatus />
            {me.guestUntil ? <Pill tone="warn">Visitante até {guestDate(me.guestUntil)}</Pill> : me.school?.isDemo ? <Pill tone="warn">Demonstração</Pill> : null}
            <NavLink className="btn soft slim" to="/conta">Conta</NavLink>
            <button className="btn soft slim" type="button" onClick={() => void logout()}>{me.guestUntil ? "Sair e apagar" : "Sair"}</button>
          </div>
        </div>
      </header>
      <main id="main" ref={main} tabIndex={-1}><Outlet /></main>
    </>
  );
}

function Home() {
  const { role } = useMe();
  if (role === "student") return <StudentHome />;
  if (role === "teacher") return <TeacherHome />;
  if (role === "coordinator") return <SchoolHome />;
  return <NetworkHome />;
}

function Router() {
  const { role } = useMe();
  if (role === "guardian") return <Routes><Route path="conta" element={<AccountPage />} /><Route path="*" element={<FamilyHome />} /></Routes>;
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Home />} />
        <Route path="conta" element={<AccountPage />} />
        {role === "student" ? (
          <>
            <Route path="treino" element={<PracticePage />} />
            <Route path="plano" element={<PlanPage />} />
            <Route path="erros" element={<MistakesPage />} />
            <Route path="leitura" element={<ReadingPage />} />
            <Route path="simulado" element={<ExamList />} />
            <Route path="simulado/:id" element={<SittingPage />} />
            <Route path="simulado/:id/resultado" element={<ResultPage />} />
            <Route path="diagnostico/:area" element={<DiagnosticPage />} />
          </>
        ) : null}
        {role === "coordinator" ? (
          <>
            <Route path="professor" element={<TeacherHome />} />
            <Route path="pessoas" element={<PeoplePage />} />
          </>
        ) : null}
        {role === "coordinator" || role === "network_admin" ? (
          <>
            <Route path="implantacao" element={<OnboardingPage />} />
            <Route path="implantacao/:id" element={<OnboardingPage />} />
          </>
        ) : null}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

startSync();
if (import.meta.env.PROD && "serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="privacidade" element={<PrivacyPolicy />} />
            <Route path="*" element={<SessionGate><Router /></SessionGate>} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
