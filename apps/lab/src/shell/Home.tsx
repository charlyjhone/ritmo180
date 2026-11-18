import { useMemo, useState } from 'react';
import { AREAS, MODULES, type ModuleInfo } from '../modules/registry';
import { QUESTOES } from '../questoes/banco';

function Icon({ d, className = '' }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function Card({ m }: { m: ModuleInfo }) {
  const ready = !!m.component;
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg border ${ready ? 'border-cyan/40 bg-cyan/10 text-cyan' : 'border-edge text-slate-600'}`}>
          <Icon d={m.icon} className="h-5 w-5" />
        </div>
        <span
          className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${
            ready ? 'border-emerald-500/40 text-emerald-400' : 'border-edge text-slate-500'
          }`}
        >
          {ready ? 'Disponível' : `Fase ${m.fase}`}
        </span>
      </div>
      <div className="mt-4 min-w-0">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">{m.bloco}</div>
        <h3 className={`mt-1 text-[15px] font-semibold ${ready ? 'text-slate-100' : 'text-slate-400'}`}>{m.title}</h3>
        <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500">{m.tema}</p>
        {ready && <p className="mt-3 text-[12.5px] leading-relaxed text-slate-400">{m.resumo}</p>}
      </div>
    </>
  );
  return ready ? (
    <a href={`#${m.id}`} className="group flex flex-col rounded-xl border border-edge bg-panel p-4 transition hover:-translate-y-0.5 hover:border-cyan/50 focus-visible:border-cyan focus-visible:outline-none">
      {body}
    </a>
  ) : (
    <div className="flex flex-col rounded-xl border border-dashed border-edge p-4" aria-disabled="true">
      {body}
    </div>
  );
}

export default function Home() {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return MODULES.filter((m) => !s || `${m.title} ${m.tema} ${m.bloco} ${m.area}`.toLowerCase().includes(s));
  }, [q]);
  const ready = MODULES.filter((m) => m.component).length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
        <header className="flex flex-col gap-6 border-b border-edge pb-10 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-cyan">Laboratório Virtual · ENEM</div>
            <h1 className="mt-3 text-3xl font-semibold leading-tight text-slate-50 sm:text-4xl" style={{ textWrap: 'balance' }}>
              Experimentos de Ciências da Natureza e Matemática, com a física conferida pelas fórmulas da prova
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-slate-400">
              Cada simulação usa unidades do SI, mostra gráficos ao vivo, compara o resultado numérico com a equação teórica e exporta os dados em JSON.
            </p>
          </div>
          <div className="flex gap-6 font-mono">
            <div>
              <div className="text-3xl font-medium text-cyan tabular-nums">{ready}</div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500">disponíveis</div>
            </div>
            <div>
              <div className="text-3xl font-medium text-slate-300 tabular-nums">{MODULES.length - ready}</div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500">em produção</div>
            </div>
          </div>
        </header>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <a href="#questoes" className="flex items-center justify-between gap-4 rounded-xl border border-cyan/40 bg-cyan/5 px-4 py-3 transition hover:border-cyan hover:bg-cyan/10">
            <span>
              <span className="block text-[15px] font-semibold text-slate-100">Banco de questões estilo ENEM</span>
              <span className="block text-[12.5px] text-slate-400">{QUESTOES.length} questões com resolução comentada e conferência no simulador</span>
            </span>
            <span className="font-mono text-cyan" aria-hidden="true">→</span>
          </a>
          <a href="#simulado" className="flex items-center justify-between gap-4 rounded-xl border border-edge bg-panel px-4 py-3 transition hover:border-cyan/50">
            <span>
              <span className="block text-[15px] font-semibold text-slate-100">Simulado cronometrado</span>
              <span className="block text-[12.5px] text-slate-400">Questões sorteadas no ritmo da prova, com relatório por área e experimento</span>
            </span>
            <span className="font-mono text-cyan" aria-hidden="true">⏱</span>
          </a>
        </div>

        <div className="mt-6">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por assunto: pêndulo, empuxo, Kepler, atrito…"
            aria-label="Buscar experimento"
            className="w-full rounded-lg border border-edge bg-panel px-4 py-3 text-[14px] text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan/60 sm:max-w-md"
          />
        </div>

        {AREAS.map((area) => {
          const items = list.filter((m) => m.area === area).sort((a, b) => Number(!a.component) - Number(!b.component) || a.fase - b.fase);
          if (!items.length) return null;
          return (
            <section key={area} className="mt-10">
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="text-lg font-semibold text-slate-100">{area}</h2>
                <span className="font-mono text-[11px] text-slate-500">
                  {items.filter((m) => m.component).length}/{items.length} disponíveis
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((m) => (
                  <Card key={m.id} m={m} />
                ))}
              </div>
            </section>
          );
        })}
        {list.length === 0 && <p className="mt-10 text-slate-500">Nenhum experimento encontrado para “{q}”.</p>}

        <footer className="mt-16 border-t border-edge pt-6 text-[12px] text-slate-600">
          Atalhos dentro de um experimento: Espaço inicia ou pausa, → avança um quadro, R reinicia.
        </footer>
      </div>
    </div>
  );
}
