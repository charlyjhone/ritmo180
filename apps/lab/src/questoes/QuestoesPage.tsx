import { useEffect, useMemo, useState } from 'react';
import { BackLink } from '../shell/ModuleShell';
import { AREAS, MODULES } from '../modules/registry';
import { QUESTOES } from './banco';
import { LETRAS, type Questao } from './tipos';
import { linkDaQuestao } from './links';

const KEY = 'lab-enem-questoes-v1';
type Progresso = Record<string, { escolha: number; acertou: boolean }>;

function lerProgresso(): Progresso {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Progresso;
  } catch {
    return {};
  }
}
function salvarProgresso(p: Progresso) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* armazenamento indisponível: o progresso vale só nesta visita */
  }
}

const modInfo = (id: string) => MODULES.find((m) => m.id === id);
const DIF = ['', 'Fácil', 'Média', 'Difícil'];

function Cartao({ q, prog, onResponder }: { q: Questao; prog?: { escolha: number; acertou: boolean }; onResponder: (i: number) => void }) {
  const [sel, setSel] = useState<number | null>(prog?.escolha ?? null);
  const respondida = !!prog;
  const m = modInfo(q.modulo);
  useEffect(() => setSel(prog?.escolha ?? null), [q.id, prog]);

  return (
    <article className="rounded-xl border border-edge bg-panel p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2 font-mono text-[10.5px] uppercase tracking-wider">
        <span className="rounded-full border border-cyan/40 px-2 py-0.5 text-cyan">{m?.area}</span>
        <span className="text-slate-500">{m?.title}</span>
        <span className="text-slate-600">·</span>
        <span className="text-slate-500">{q.assunto}</span>
        <span className="ml-auto text-slate-500">{DIF[q.dificuldade]}</span>
      </div>
      <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-slate-200">
        {q.texto.map((t, i) => (
          <p key={i}>{t}</p>
        ))}
      </div>
      <fieldset className="mt-5 space-y-2" disabled={respondida}>
        <legend className="sr-only">Alternativas</legend>
        {q.alternativas.map((a, i) => {
          const certa = respondida && i === q.correta;
          const errada = respondida && i === prog!.escolha && !prog!.acertou;
          return (
            <label
              key={i}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-[14px] transition ${
                certa
                  ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200'
                  : errada
                    ? 'border-rose-500/60 bg-rose-500/10 text-rose-200'
                    : sel === i
                      ? 'border-cyan/60 bg-cyan/10 text-slate-100'
                      : 'border-edge text-slate-300 hover:border-slate-500'
              } ${respondida ? 'cursor-default' : ''}`}
            >
              <input type="radio" name={q.id} className="sr-only" checked={sel === i} onChange={() => setSel(i)} />
              <span className="w-4 shrink-0 font-mono font-semibold">{LETRAS[i]}</span>
              <span>{a}</span>
            </label>
          );
        })}
      </fieldset>
      {!respondida ? (
        <button
          type="button"
          disabled={sel === null}
          onClick={() => sel !== null && onResponder(sel)}
          className="mt-5 rounded-lg bg-cyan px-4 py-2 text-[14px] font-semibold text-slate-950 transition disabled:cursor-not-allowed disabled:opacity-40"
        >
          Responder
        </button>
      ) : (
        <div className="mt-5 rounded-lg border border-edge bg-black/20 p-4" aria-live="polite">
          <div className={`text-[14px] font-semibold ${prog!.acertou ? 'text-emerald-400' : 'text-rose-400'}`}>
            {prog!.acertou ? 'Correto!' : `Resposta correta: ${LETRAS[q.correta]}`}
          </div>
          <div className="mt-2 space-y-2 text-[13.5px] leading-relaxed text-slate-300">
            {q.resolucao.map((r, i) => (
              <p key={i}>{r}</p>
            ))}
          </div>
          <div className="mt-4 border-t border-edge pt-3">
            <div className="font-mono text-[10.5px] uppercase tracking-wider text-slate-500">Confira no simulador</div>
            <p className="mt-1 text-[13.5px] text-slate-300">{q.simulador}</p>
            <a href={linkDaQuestao(q)} className="mt-3 inline-block rounded-lg border border-cyan/50 px-3 py-1.5 text-[13px] text-cyan hover:bg-cyan/10">
              Abrir {m?.title} →
            </a>
          </div>
        </div>
      )}
    </article>
  );
}

export default function QuestoesPage({ filtro }: { filtro: string }) {
  const [prog, setProg] = useState<Progresso>(lerProgresso);
  const [area, setArea] = useState<string>(() => modInfo(filtro)?.area ?? 'Todas');
  const lista = useMemo(
    () => QUESTOES.filter((q) => (filtro ? q.modulo === filtro : area === 'Todas' || modInfo(q.modulo)?.area === area)),
    [filtro, area],
  );
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [filtro, area]);
  const q = lista[Math.min(idx, lista.length - 1)];

  const feitas = lista.filter((x) => prog[x.id]);
  const acertos = feitas.filter((x) => prog[x.id].acertou).length;

  const responder = (i: number) => {
    const p = { ...prog, [q.id]: { escolha: i, acertou: i === q.correta } };
    setProg(p);
    salvarProgresso(p);
  };
  const ir = (d: number) => setIdx((k) => (k + d + lista.length) % lista.length);
  const proximaNaoFeita = () => {
    const pend = lista.map((_, i) => i).filter((i) => !prog[lista[i].id] && i !== idx);
    if (pend.length) setIdx(pend[Math.floor(Math.random() * pend.length)]);
  };
  const zerar = () => {
    const p = { ...prog };
    lista.forEach((x) => delete p[x.id]);
    setProg(p);
    salvarProgresso(p);
  };
  const mf = modInfo(filtro);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <header className="flex items-center gap-3">
          <BackLink />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-slate-50">Questões estilo ENEM</h1>
            <p className="text-[12.5px] text-slate-500">
              {mf ? `${mf.title} · ` : ''}
              {lista.length} questões originais, cada uma conferível em um simulador
            </p>
          </div>
          <a href="#simulado" className="ml-auto shrink-0 rounded-lg border border-cyan/50 px-3 py-1.5 text-[12.5px] text-cyan hover:bg-cyan/10">
            Simulado ⏱
          </a>
        </header>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {filtro ? (
            <a href="#questoes" className="rounded-full border border-edge px-3 py-1 text-[12.5px] text-slate-300 hover:border-cyan/50">
              ← Todas as questões
            </a>
          ) : (
            ['Todas', ...AREAS].map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setArea(a)}
                aria-pressed={area === a}
                className={`rounded-full border px-3 py-1 text-[12.5px] transition ${area === a ? 'border-cyan bg-cyan/15 text-cyan' : 'border-edge text-slate-400 hover:border-slate-500'}`}
              >
                {a}
              </button>
            ))
          )}
          <div className="ml-auto font-mono text-[12px] text-slate-400 tabular-nums">
            {acertos}/{feitas.length} acertos · {feitas.length}/{lista.length} feitas
          </div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-edge" aria-hidden="true">
          <div className="h-full bg-cyan transition-all" style={{ width: `${(100 * feitas.length) / Math.max(1, lista.length)}%` }} />
        </div>

        {q ? (
          <>
            <div className="mt-6 mb-2 font-mono text-[11px] text-slate-500">
              Questão {Math.min(idx, lista.length - 1) + 1} de {lista.length}
            </div>
            <Cartao key={q.id} q={q} prog={prog[q.id]} onResponder={responder} />
            <nav className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => ir(-1)} className="rounded-lg border border-edge px-3 py-1.5 text-[13px] text-slate-300 hover:border-slate-500">
                ← Anterior
              </button>
              <button type="button" onClick={() => ir(1)} className="rounded-lg border border-edge px-3 py-1.5 text-[13px] text-slate-300 hover:border-slate-500">
                Próxima →
              </button>
              <button
                type="button"
                onClick={proximaNaoFeita}
                disabled={feitas.length >= lista.length - (prog[q.id] ? 0 : 1)}
                className="rounded-lg border border-edge px-3 py-1.5 text-[13px] text-slate-300 hover:border-slate-500 disabled:opacity-40"
              >
                Sortear não respondida
              </button>
              {feitas.length > 0 && (
                <button type="button" onClick={zerar} className="ml-auto rounded-lg px-3 py-1.5 text-[13px] text-slate-500 hover:text-rose-300">
                  Zerar progresso
                </button>
              )}
            </nav>
          </>
        ) : (
          <p className="mt-10 text-slate-500">Nenhuma questão para este filtro.</p>
        )}

        <footer className="mt-12 border-t border-edge pt-5 text-[12px] leading-relaxed text-slate-600">
          Questões elaboradas para este laboratório no estilo da prova; não são itens oficiais do INEP. Os gabaritos numéricos são recalculados automaticamente pela física de cada simulador nos testes do projeto.
        </footer>
      </div>
    </div>
  );
}
