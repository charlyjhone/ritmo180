import { useEffect, useMemo, useRef, useState } from 'react';
import { BackLink } from '../shell/ModuleShell';
import { AREAS, MODULES } from '../modules/registry';
import { QUESTOES } from './banco';
import { LETRAS, type Questao } from './tipos';
import { linkDaQuestao } from './links';

const HIST = 'lab-enem-simulados-v1';
const modInfo = (id: string) => MODULES.find((m) => m.id === id);
const areaDe = (q: Questao) => modInfo(q.modulo)?.area ?? '';

interface Registro {
  data: string;
  area: string;
  n: number;
  acertos: number;
  segundos: number;
}

function lerHist(): Registro[] {
  try {
    const v = JSON.parse(localStorage.getItem(HIST) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function salvarHist(h: Registro[]) {
  try {
    localStorage.setItem(HIST, JSON.stringify(h.slice(0, 10)));
  } catch {
    /* sem armazenamento: o histórico vale só nesta visita */
  }
}

/** Sorteio sem repetição (Fisher–Yates parcial). */
export function sortear<T>(arr: readonly T[], n: number, rand = Math.random): T[] {
  const a = arr.slice();
  const k = Math.min(n, a.length);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rand() * (a.length - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, k);
}

export const fmtTempo = (s: number) => {
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const ss = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

type Fase = { tipo: 'config' } | { tipo: 'prova'; qs: Questao[]; limite: number; inicio: number } | { tipo: 'fim'; qs: Questao[]; resp: (number | null)[]; segundos: number; esgotou: boolean };

const TAMANHOS = [5, 10, 20, 45];
const MIN_POR_Q = 3; // média da prova: 45 itens em ~2h15 por área

function Config({ onIniciar }: { onIniciar: (area: string, n: number, minPorQ: number) => void }) {
  const [area, setArea] = useState('Todas');
  const [n, setN] = useState(10);
  const [ritmo, setRitmo] = useState(MIN_POR_Q);
  const disp = QUESTOES.filter((q) => area === 'Todas' || areaDe(q) === area).length;
  const nReal = Math.min(n, disp);
  const hist = useMemo(lerHist, []);
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-[12.5px] transition ${on ? 'border-cyan bg-cyan/15 text-cyan' : 'border-edge text-slate-400 hover:border-slate-500'}`;
  return (
    <div className="mt-6 space-y-6 rounded-xl border border-edge bg-panel p-5 sm:p-6">
      <div>
        <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-slate-500">Área</div>
        <div className="flex flex-wrap gap-2">
          {['Todas', ...AREAS].map((a) => (
            <button key={a} type="button" aria-pressed={area === a} onClick={() => setArea(a)} className={chip(area === a)}>
              {a}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-slate-500">Número de questões</div>
        <div className="flex flex-wrap gap-2">
          {TAMANHOS.map((t) => (
            <button key={t} type="button" aria-pressed={n === t} onClick={() => setN(t)} disabled={t > disp && t !== TAMANHOS[0]} className={`${chip(n === t)} disabled:opacity-30`}>
              {t}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-slate-500">{disp} questões disponíveis nesta área.</p>
      </div>
      <div>
        <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-slate-500">Tempo por questão</div>
        <div className="flex flex-wrap gap-2">
          {[2, 3, 4].map((r) => (
            <button key={r} type="button" aria-pressed={ritmo === r} onClick={() => setRitmo(r)} className={chip(ritmo === r)}>
              {r} min{r === MIN_POR_Q ? ' (ritmo da prova)' : ''}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 border-t border-edge pt-5">
        <button type="button" onClick={() => onIniciar(area, nReal, ritmo)} className="rounded-lg bg-cyan px-5 py-2.5 text-[14px] font-semibold text-slate-950">
          Iniciar simulado
        </button>
        <span className="font-mono text-[12.5px] text-slate-400">
          {nReal} questões · {fmtTempo(nReal * ritmo * 60)}
        </span>
      </div>
      {hist.length > 0 && (
        <div className="border-t border-edge pt-5">
          <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-slate-500">Últimos simulados</div>
          <ul className="space-y-1 font-mono text-[12.5px] text-slate-400">
            {hist.map((h, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>
                  {h.data} · {h.area}
                </span>
                <span className="tabular-nums">
                  {h.acertos}/{h.n} ({Math.round((100 * h.acertos) / h.n)}%) · {fmtTempo(h.segundos)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Prova({ qs, limite, inicio, onEntregar }: { qs: Questao[]; limite: number; inicio: number; onEntregar: (resp: (number | null)[], esgotou: boolean) => void }) {
  const [resp, setResp] = useState<(number | null)[]>(() => qs.map(() => null));
  const [i, setI] = useState(0);
  const [agora, setAgora] = useState(() => Date.now());
  const respRef = useRef(resp);
  respRef.current = resp;
  const entregue = useRef(false);
  const resta = limite - (agora - inicio) / 1000;

  useEffect(() => {
    const id = window.setInterval(() => setAgora(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (resta <= 0 && !entregue.current) {
      entregue.current = true;
      onEntregar(respRef.current, true);
    }
  }, [resta, onEntregar]);

  const q = qs[i];
  const m = modInfo(q.modulo);
  const feitas = resp.filter((r) => r !== null).length;
  const pouco = resta < 60;

  const entregar = () => {
    const falta = qs.length - feitas;
    if (falta > 0 && !window.confirm(`Ainda há ${falta} questão(ões) em branco. Entregar mesmo assim?`)) return;
    entregue.current = true;
    onEntregar(resp, false);
  };

  return (
    <>
      <div className="sticky top-0 z-10 -mx-4 mt-4 border-b border-edge bg-bg/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-3">
          <div className={`font-mono text-xl tabular-nums ${pouco ? 'text-rose-400' : 'text-cyan'}`} role="timer" aria-label="Tempo restante">
            {fmtTempo(resta)}
          </div>
          <div className="font-mono text-[12px] text-slate-500 tabular-nums">
            {feitas}/{qs.length} respondidas
          </div>
          <button type="button" onClick={entregar} className="ml-auto rounded-lg border border-cyan/60 px-3 py-1.5 text-[13px] font-semibold text-cyan hover:bg-cyan/10">
            Entregar
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5" role="navigation" aria-label="Mapa de questões">
          {qs.map((_, k) => (
            <button
              key={k}
              type="button"
              onClick={() => setI(k)}
              aria-current={k === i}
              aria-label={`Questão ${k + 1}${resp[k] !== null ? ', respondida' : ''}`}
              className={`h-7 w-7 rounded font-mono text-[11px] tabular-nums transition ${
                k === i ? 'bg-cyan text-slate-950' : resp[k] !== null ? 'bg-cyan/20 text-cyan' : 'border border-edge text-slate-500 hover:border-slate-500'
              }`}
            >
              {k + 1}
            </button>
          ))}
        </div>
      </div>

      <article className="mt-5 rounded-xl border border-edge bg-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10.5px] uppercase tracking-wider text-slate-500">
          <span>Questão {i + 1}</span>
          <span>·</span>
          <span>{m?.area}</span>
        </div>
        <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-slate-200">
          {q.texto.map((t, k) => (
            <p key={k}>{t}</p>
          ))}
        </div>
        <fieldset className="mt-5 space-y-2">
          <legend className="sr-only">Alternativas</legend>
          {q.alternativas.map((a, k) => (
            <label
              key={k}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-[14px] transition ${
                resp[i] === k ? 'border-cyan/60 bg-cyan/10 text-slate-100' : 'border-edge text-slate-300 hover:border-slate-500'
              }`}
            >
              <input
                type="radio"
                name={`sim-${i}`}
                className="sr-only"
                checked={resp[i] === k}
                onChange={() => setResp((r) => r.map((x, j) => (j === i ? k : x)))}
              />
              <span className="w-4 shrink-0 font-mono font-semibold">{LETRAS[k]}</span>
              <span>{a}</span>
            </label>
          ))}
        </fieldset>
      </article>
      <nav className="mt-4 flex gap-2">
        <button type="button" disabled={i === 0} onClick={() => setI(i - 1)} className="rounded-lg border border-edge px-3 py-1.5 text-[13px] text-slate-300 hover:border-slate-500 disabled:opacity-30">
          ← Anterior
        </button>
        <button
          type="button"
          disabled={i === qs.length - 1}
          onClick={() => setI(i + 1)}
          className="rounded-lg border border-edge px-3 py-1.5 text-[13px] text-slate-300 hover:border-slate-500 disabled:opacity-30"
        >
          Próxima →
        </button>
        {resp[i] !== null && (
          <button type="button" onClick={() => setResp((r) => r.map((x, j) => (j === i ? null : x)))} className="ml-auto px-2 text-[12.5px] text-slate-500 hover:text-slate-300">
            Limpar resposta
          </button>
        )}
      </nav>
    </>
  );
}

function Barra({ rotulo, a, n }: { rotulo: string; a: number; n: number }) {
  const pct = n ? a / n : 0;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
      <span className="truncate text-[13px] text-slate-300">{rotulo}</span>
      <span className="font-mono text-[12px] text-slate-400 tabular-nums">
        {a}/{n}
      </span>
      <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-edge">
        <div className={`h-full ${pct >= 0.7 ? 'bg-emerald-500' : pct >= 0.4 ? 'bg-amber' : 'bg-rose-500'}`} style={{ width: `${100 * pct}%` }} />
      </div>
    </div>
  );
}

function Relatorio({ qs, resp, segundos, esgotou, onNovo }: { qs: Questao[]; resp: (number | null)[]; segundos: number; esgotou: boolean; onNovo: () => void }) {
  const [aberta, setAberta] = useState<number | null>(null);
  const certo = (k: number) => resp[k] === qs[k].correta;
  const acertos = qs.filter((_, k) => certo(k)).length;
  const brancos = resp.filter((r) => r === null).length;

  const grupos = (chave: (q: Questao) => string) => {
    const g = new Map<string, { a: number; n: number }>();
    qs.forEach((q, k) => {
      const c = chave(q);
      const v = g.get(c) ?? { a: 0, n: 0 };
      v.n++;
      if (certo(k)) v.a++;
      g.set(c, v);
    });
    return [...g.entries()].sort((x, y) => x[1].a / x[1].n - y[1].a / y[1].n);
  };
  const porArea = grupos(areaDe);
  const porModulo = grupos((q) => modInfo(q.modulo)?.title ?? q.modulo);
  const revisar = porModulo.filter(([, v]) => v.a < v.n).slice(0, 3);

  return (
    <div className="mt-6 space-y-5">
      <section className="rounded-xl border border-edge bg-panel p-5 sm:p-6">
        {esgotou && <p className="mb-3 text-[13px] text-amber">O tempo acabou e a prova foi entregue automaticamente.</p>}
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <div className="font-mono text-4xl text-cyan tabular-nums">{Math.round((100 * acertos) / qs.length)}%</div>
            <div className="text-[12px] uppercase tracking-wider text-slate-500">aproveitamento</div>
          </div>
          <div className="font-mono text-[13px] leading-relaxed text-slate-400 tabular-nums">
            {acertos} acertos · {qs.length - acertos - brancos} erros · {brancos} em branco
            <br />
            tempo {fmtTempo(segundos)} · {fmtTempo(segundos / qs.length)} por questão
          </div>
        </div>
        {revisar.length > 0 && (
          <p className="mt-4 text-[13.5px] text-slate-300">
            Para revisar primeiro:{' '}
            {revisar.map(([nome], k) => {
              const id = MODULES.find((m) => m.title === nome)?.id;
              return (
                <span key={nome}>
                  {k > 0 && ', '}
                  <a href={`#${id}`} className="text-cyan underline-offset-2 hover:underline">
                    {nome}
                  </a>
                </span>
              );
            })}
            .
          </p>
        )}
      </section>

      <section className="grid gap-5 rounded-xl border border-edge bg-panel p-5 sm:grid-cols-2 sm:p-6">
        <div className="space-y-3">
          <h2 className="font-mono text-[11px] uppercase tracking-wider text-slate-500">Por área</h2>
          {porArea.map(([nome, v]) => (
            <Barra key={nome} rotulo={nome} a={v.a} n={v.n} />
          ))}
        </div>
        <div className="space-y-3">
          <h2 className="font-mono text-[11px] uppercase tracking-wider text-slate-500">Por experimento</h2>
          {porModulo.map(([nome, v]) => (
            <Barra key={nome} rotulo={nome} a={v.a} n={v.n} />
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-edge bg-panel p-2 sm:p-3">
        <h2 className="px-3 pt-2 pb-1 font-mono text-[11px] uppercase tracking-wider text-slate-500">Gabarito comentado</h2>
        <ul>
          {qs.map((q, k) => (
            <li key={q.id} className="border-t border-edge first:border-t-0">
              <button type="button" onClick={() => setAberta(aberta === k ? null : k)} aria-expanded={aberta === k} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded font-mono text-[11px] ${certo(k) ? 'bg-emerald-500/20 text-emerald-300' : resp[k] === null ? 'bg-edge text-slate-400' : 'bg-rose-500/20 text-rose-300'}`}>
                  {k + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-slate-300">
                  {modInfo(q.modulo)?.title} · {q.assunto}
                </span>
                <span className="shrink-0 font-mono text-[12px] text-slate-500">
                  {resp[k] === null ? '—' : LETRAS[resp[k]!]} / {LETRAS[q.correta]}
                </span>
              </button>
              {aberta === k && (
                <div className="space-y-2 px-3 pb-4 pl-12 text-[13.5px] leading-relaxed text-slate-300">
                  {q.texto.map((t, j) => (
                    <p key={j} className="text-slate-400">
                      {t}
                    </p>
                  ))}
                  <p className="font-semibold text-emerald-300">
                    {LETRAS[q.correta]}) {q.alternativas[q.correta]}
                  </p>
                  {q.resolucao.map((r, j) => (
                    <p key={j}>{r}</p>
                  ))}
                  <p className="text-slate-400">
                    No simulador: {q.simulador}{' '}
                    <a href={linkDaQuestao(q)} className="text-cyan hover:underline">
                      Abrir →
                    </a>
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
      <button type="button" onClick={onNovo} className="rounded-lg bg-cyan px-5 py-2.5 text-[14px] font-semibold text-slate-950">
        Novo simulado
      </button>
    </div>
  );
}

export default function Simulado() {
  const [fase, setFase] = useState<Fase>({ tipo: 'config' });
  const areaRef = useRef('Todas');

  const iniciar = (area: string, n: number, minPorQ: number) => {
    areaRef.current = area;
    const pool = QUESTOES.filter((q) => area === 'Todas' || areaDe(q) === area);
    setFase({ tipo: 'prova', qs: sortear(pool, n), limite: n * minPorQ * 60, inicio: Date.now() });
    document.querySelector('[data-scroll]')?.scrollTo(0, 0);
  };

  const prova = fase.tipo === 'prova' ? fase : null;
  const entregar = useMemo(
    () => (resp: (number | null)[], esgotou: boolean) => {
      if (!prova) return;
      const segundos = Math.min(prova.limite, (Date.now() - prova.inicio) / 1000);
      const acertos = prova.qs.filter((q, k) => resp[k] === q.correta).length;
      salvarHist([{ data: new Date().toLocaleDateString('pt-BR'), area: areaRef.current, n: prova.qs.length, acertos, segundos }, ...lerHist()]);
      setFase({ tipo: 'fim', qs: prova.qs, resp, segundos, esgotou });
      document.querySelector('[data-scroll]')?.scrollTo(0, 0);
    },
    [prova],
  );

  useEffect(() => {
    if (fase.tipo !== 'prova') return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [fase.tipo]);

  return (
    <div className="h-full overflow-y-auto" data-scroll>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <header className="flex items-center gap-3">
          <BackLink />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-slate-50">Simulado cronometrado</h1>
            <p className="text-[12.5px] text-slate-500">Questões sorteadas, sem correção até a entrega, com relatório por área e por experimento</p>
          </div>
          {fase.tipo !== 'prova' && (
            <a href="#questoes" className="hidden shrink-0 rounded-lg border border-edge px-2.5 py-1 text-[12px] text-slate-300 hover:border-cyan/50 sm:block">
              Modo prática
            </a>
          )}
        </header>
        {fase.tipo === 'config' && <Config onIniciar={iniciar} />}
        {fase.tipo === 'prova' && <Prova key={fase.inicio} qs={fase.qs} limite={fase.limite} inicio={fase.inicio} onEntregar={entregar} />}
        {fase.tipo === 'fim' && <Relatorio qs={fase.qs} resp={fase.resp} segundos={fase.segundos} esgotou={fase.esgotou} onNovo={() => setFase({ tipo: 'config' })} />}
      </div>
    </div>
  );
}
