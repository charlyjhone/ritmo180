import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource/geist-sans/400.css";
import "@fontsource/geist-sans/500.css";
import "@fontsource/geist-sans/600.css";
import "@fontsource/geist-sans/700.css";
import "@fontsource/bricolage-grotesque/600.css";
import "@fontsource/bricolage-grotesque/700.css";
import "@fontsource/bricolage-grotesque/800.css";
import "@fontsource/geist-mono/500.css";
import "@fontsource/geist-mono/600.css";
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
import { CardsPage } from "./features/cards.tsx";
import { applyTextSize, loadTextSize } from "./ui/a11y.tsx";
import { LessonPage, LessonsIndexPage } from "./features/lessons.tsx";
import { PeoplePage } from "./features/people.tsx";
import { PlanPage } from "./features/plan.tsx";
import { PracticePage } from "./features/practice.tsx";
import { PrivacyPolicy } from "./features/privacy-policy.tsx";
import { ReadingPage } from "./features/reading.tsx";
import { SchoolHome } from "./features/school.tsx";
import { guestDate, logout, NAV, navLinks, SessionGate, useMe, type NavLinkItem } from "./features/session.tsx";
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
    const section = navLinks(me.role).find((link) => !link.external && (link.to === "/" ? location.pathname === "/" : location.pathname.startsWith(link.to)));
    const label = location.pathname === "/conta" ? "Minha conta" : section?.label;
    document.title = label ? `${label} · Ritmo 180` : "Ritmo 180";
    main.current?.focus();
    window.scrollTo(0, 0);
  }, [location.pathname, me.role]);
  const dark = me.role === "network_admin";
  const initials = me.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
  const link = (item: NavLinkItem) => item.external
    ? <a key={item.to} className="navlink external" href={item.to} target="_blank" rel="noopener" title="Abre em outra aba">{item.label}<span aria-hidden="true"> ↗</span><span className="sr-only"> (abre em outra aba)</span></a>
    : <NavLink key={item.to} className="navlink" to={item.to} end={item.to === "/"}>{item.label}</NavLink>;
  return (
    <>
      <a className="skip-link" href="#main">Pular para o conteúdo</a>
      <header id="topbar" className={dark ? "dark" : ""}>
        <div className="topbar-inner">
          <NavLink className="brand" to="/" aria-label="Ritmo 180, ir para o início">
            <div className="logo" aria-hidden="true">180</div>
            <div><div className="brand-name">{dark ? "Ritmo 180 · Rede" : "Ritmo 180"}</div><div className="brand-sub">{me.school?.name ?? "Administração de todas as escolas"}</div></div>
          </NavLink>
          <nav className="mainnav" aria-label="Áreas da plataforma">
            {NAV[me.role].map((g, i) => (
              <div className="navgroup" key={g.group ?? i} role={g.group ? "group" : undefined} aria-label={g.group}>
                {g.group ? <span className="navgroup-label" aria-hidden="true">{g.group}</span> : null}
                <div className="navgroup-items">{g.items.map(link)}</div>
              </div>
            ))}
          </nav>
          <div className="topbar-end">
            <SyncStatus />
            {me.guestUntil ? <Pill tone="warn">Visitante até {guestDate(me.guestUntil)}</Pill> : me.school?.isDemo ? <Pill tone="warn">Demonstração</Pill> : null}
            <NavLink className="account-link" to="/conta" title="Minha conta"><span className="avatar" aria-hidden="true">{initials}</span><span>Conta</span></NavLink>
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
            <Route path="cartoes" element={<CardsPage />} />
            <Route path="leitura" element={<ReadingPage />} />
            <Route path="simulado" element={<ExamList />} />
            <Route path="simulado/:id" element={<SittingPage />} />
            <Route path="simulado/:id/resultado" element={<ResultPage />} />
            <Route path="diagnostico/:area" element={<DiagnosticPage />} />
          </>
        ) : null}
        {role === "student" || role === "teacher" || role === "coordinator" ? (
          <>
            <Route path="aulas" element={<LessonsIndexPage />} />
            <Route path="aula" element={<LessonPage />} />
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
applyTextSize(loadTextSize());
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
