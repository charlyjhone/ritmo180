import { useEffect, type ReactNode } from 'react';
import { Kbd, Stat } from '../ui/controls';
import { questoesDoModulo } from '../questoes/banco';
import { routeId } from '../core/params';

export interface ShellProps {
  title: string;
  tema: string;
  status: { text: string; tone?: 'idle' | 'run' | 'pause' | 'done' };
  stats: { label: string; value: string; unit: string; accent?: boolean }[];
  scene: ReactNode;
  charts?: ReactNode;
  panel: ReactNode;
  keys?: { toggle?: () => void; step?: () => void; reset?: () => void };
}

const TONE = { idle: 'text-slate-400', run: 'text-cyan', pause: 'text-amber', done: 'text-emerald-400' };

export function BackLink() {
  return (
    <a
      href="#"
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-edge text-slate-400 transition hover:border-cyan/50 hover:text-cyan"
      aria-label="Voltar ao início do laboratório"
      title="Voltar ao início"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </a>
  );
}

function QuestoesLink() {
  const id = routeId(window.location.hash.slice(1));
  const n = questoesDoModulo(id).length;
  if (!n) return null;
  return (
    <a href={`#questoes/${id}`} className="shrink-0 rounded-lg border border-edge px-2.5 py-1 text-[12px] text-slate-300 transition hover:border-cyan/50 hover:text-cyan" title="Questões estilo ENEM deste experimento">
      Questões ({n})
    </a>
  );
}

export default function ModuleShell({ title, tema, status, stats, scene, charts, panel, keys }: ShellProps) {
  useEffect(() => {
    if (!keys) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if ((el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'range') || el.tagName === 'SELECT' || e.metaKey || e.ctrlKey) return;
      if (e.code === 'Space') {
        e.preventDefault();
        keys.toggle?.();
      } else if (e.key === 'ArrowRight' && el.tagName !== 'INPUT') {
        e.preventDefault();
        keys.step?.();
      } else if (e.key === 'r' || e.key === 'R') keys.reset?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keys]);

  return (
    <div className="flex min-h-full flex-col lg:h-full lg:flex-row">
      <main className="flex min-w-0 flex-1 flex-col lg:min-h-0 lg:overflow-y-auto">
        <header className="flex items-center justify-between gap-4 border-b border-edge px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <BackLink />
            <div className="min-w-0">
              <h1 className="truncate text-[15px] font-semibold text-slate-100">{title}</h1>
              <p className="truncate text-xs text-slate-500">
                {tema} · <span className={TONE[status.tone ?? 'idle']} aria-live="polite">{status.text}</span>
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-4">
          {keys && (
            <div className="hidden items-center gap-3 text-[11px] text-slate-500 xl:flex">
              <span className="flex items-center gap-1.5"><Kbd>Espaço</Kbd> iniciar/pausar</span>
              <span className="flex items-center gap-1.5"><Kbd>→</Kbd> passo</span>
              <span className="flex items-center gap-1.5"><Kbd>R</Kbd> reiniciar</span>
            </div>
          )}
          <QuestoesLink />
          </div>
        </header>
        {/* no celular os indicadores ficam acima da cena, sem cobri-la */}
        <div className="grid grid-cols-2 gap-2 border-b border-edge p-3 sm:hidden">
          {stats.map((s) => (
            <Stat key={s.label} {...s} />
          ))}
        </div>
        <div className="relative h-[400px] shrink-0 overflow-hidden sm:h-auto sm:min-h-[320px] sm:flex-1 sm:shrink">
          {scene}
          <div className="pointer-events-none absolute inset-x-4 top-4 hidden grid-cols-4 gap-2 sm:grid 2xl:right-auto 2xl:w-[680px]">
            {stats.map((s) => (
              <Stat key={s.label} {...s} />
            ))}
          </div>
        </div>
        {charts && <div className="grid h-auto shrink-0 grid-cols-1 gap-2 border-t border-edge p-2 sm:grid-cols-2 sm:p-3 xl:h-[190px] xl:grid-cols-3 [&>*]:h-[170px] xl:[&>*]:h-auto">{charts}</div>}
      </main>
      <aside className="w-full shrink-0 overflow-y-auto border-t border-edge bg-panel lg:w-[360px] lg:border-t-0 lg:border-l">{panel}</aside>
    </div>
  );
}
