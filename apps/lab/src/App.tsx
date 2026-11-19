import { Suspense, lazy, useEffect, useState } from 'react';
import Home from './shell/Home';
import { MODULES } from './modules/registry';
import { routeId } from './core/params';

const QuestoesPage = lazy(() => import('./questoes/QuestoesPage'));
const Simulado = lazy(() => import('./questoes/Simulado'));

function useHash() {
  const [hash, setHash] = useState(() => window.location.hash.slice(1));
  useEffect(() => {
    const on = () => setHash(window.location.hash.slice(1));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export default function App() {
  const hash = useHash();
  const id = routeId(hash);
  const mod = MODULES.find((m) => m.id === id && m.component);
  const questoes = hash === 'questoes' || hash.startsWith('questoes/');
  const simulado = hash === 'simulado';
  useEffect(() => {
    document.title = simulado ? 'Simulado · Laboratório Virtual' : questoes ? 'Questões ENEM · Laboratório Virtual' : mod ? `${mod.title} · Laboratório Virtual` : 'Laboratório Virtual ENEM';
  }, [mod, questoes, simulado]);
  if (simulado)
    return (
      <Suspense fallback={<div className="grid h-full place-items-center text-sm text-slate-500">Carregando simulado…</div>}>
        <Simulado />
      </Suspense>
    );
  if (questoes)
    return (
      <Suspense fallback={<div className="grid h-full place-items-center text-sm text-slate-500">Carregando questões…</div>}>
        <QuestoesPage filtro={hash.slice('questoes/'.length)} />
      </Suspense>
    );
  if (!mod || !mod.component) return <Home />;
  const C = mod.component;
  return (
    <Suspense fallback={<div className="grid h-full place-items-center text-sm text-slate-500">Carregando experimento…</div>}>
      <C key={hash} />
    </Suspense>
  );
}
