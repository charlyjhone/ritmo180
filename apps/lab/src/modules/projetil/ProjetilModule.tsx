import { useCallback, useEffect, useMemo, useState } from 'react';
import SimCanvas, { type ViewOptions } from './SimCanvas';
import { Chip, Kbd, Section, Slider, Toggle } from '../../ui/controls';
import { inFlight, useSimulation } from './useSimulation';
import { AIR_DENSITY_SEA_LEVEL, analyticVacuum, maxHeightUntil, sampleAt, simulate, type LaunchParams } from './simulate';
import { downloadJson } from './exportJson';
import { fmt } from '../../core/format';
import { BackLink } from '../../shell/ModuleShell';
import { params as fromRoute } from '../../core/params';

const PLANETS = [
  { name: 'Lua', g: 1.62 },
  { name: 'Marte', g: 3.71 },
  { name: 'Terra', g: 9.81 },
  { name: 'Júpiter', g: 24.79 },
];

const OBJECTS = [
  { id: 'canhao', name: 'Bola de canhão', mass: 17.6, diameter: 0.18, cd: 0.47 },
  { id: 'futebol', name: 'Bola de futebol', mass: 0.43, diameter: 0.22, cd: 0.25 },
  { id: 'beisebol', name: 'Bola de beisebol', mass: 0.145, diameter: 0.074, cd: 0.35 },
  { id: 'golfe', name: 'Bola de golfe', mass: 0.046, diameter: 0.043, cd: 0.3 },
  { id: 'pingue', name: 'Bola de pingue-pongue', mass: 0.0027, diameter: 0.04, cd: 0.5 },
];

const SPEEDS = [0.25, 0.5, 1, 2];

const DEFAULT: LaunchParams = {
  v0: 20,
  angleDeg: 45,
  g: 9.81,
  cd: 0,
  mass: 0.43,
  diameter: 0.22,
  airDensity: AIR_DENSITY_SEA_LEVEL,
};

function Stat({ label, value, unit, accent }: { label: string; value: string; unit: string; accent?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border border-edge bg-panel/90 px-3.5 py-2.5 backdrop-blur">
      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className={`truncate font-mono text-xl font-medium tabular-nums ${accent ? 'text-cyan' : 'text-slate-100'}`}>{value}</span>
        <span className="font-mono text-[11px] text-slate-500">{unit}</span>
      </div>
    </div>
  );
}

export default function App() {
  const [params, setParams] = useState<LaunchParams>(() => fromRoute(DEFAULT));
  const [objectId, setObjectId] = useState('futebol');
  const [view, setView] = useState<ViewOptions>({ velocity: true, components: true, timeMarks: true, preview: true });
  const sim = useSimulation();

  const set = <K extends keyof LaunchParams>(k: K, v: LaunchParams[K]) => setParams((p) => ({ ...p, [k]: v }));
  const preview = useMemo(() => simulate(params), [params]);

  const fire = useCallback(() => sim.fire(params), [sim, params]);
  const step = useCallback(() => sim.step(params), [sim, params]);

  // Atalhos de teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' && (e.target as HTMLInputElement).type !== 'range') return;
      if (tag === 'SELECT' || e.metaKey || e.ctrlKey) return;
      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        fire();
      } else if (e.key === 'p' || e.key === 'P') sim.setPlaying(!sim.playing);
      else if (e.key === '.' || (e.key === 'ArrowRight' && tag !== 'INPUT')) {
        e.preventDefault();
        step();
      } else if (e.key === 'c' || e.key === 'C') sim.clear();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fire, step, sim]);

  const sel = sim.selected;
  const cur = sel ? sampleAt(sel.result.points, sel.t) : null;
  const landed = sel ? !inFlight(sel) : false;

  let status: { text: string; tone: string };
  if (!sel) status = { text: 'Pronto para disparar', tone: 'text-slate-400' };
  else if (landed) status = { text: `Pousou: R = ${fmt(sel.result.summary.range)} m em ${fmt(sel.result.summary.flightTime)} s`, tone: 'text-emerald-400' };
  else if (!sim.playing) status = { text: 'Pausado: use Passo para avançar 1 quadro', tone: 'text-amber' };
  else status = { text: 'Em voo…', tone: 'text-cyan' };

  // Verificação no vácuo: usa o disparo selecionado se ele foi no vácuo; senão, a previsão atual.
  const checkSrc = sel && sel.result.params.cd === 0 ? sel.result : preview.params.cd === 0 ? preview : null;
  const ref = checkSrc ? analyticVacuum(checkSrc.params) : null;

  const pausedOrIdle = !sim.playing || !sim.anyInFlight;

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* ======= Área do canvas ======= */}
      <main className="relative flex min-h-[58vh] flex-1 flex-col lg:min-h-0">
        <header className="flex items-center justify-between gap-4 border-b border-edge px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <BackLink />
            <div className="min-w-0">
              <h1 className="truncate text-[15px] font-semibold text-slate-100">Lançamento Oblíquo</h1>
              <p className={`truncate text-xs ${status.tone}`} aria-live="polite">
                {status.text}
              </p>
            </div>
          </div>
          <div className="hidden items-center gap-3 text-[11px] text-slate-500 md:flex">
            <span className="flex items-center gap-1.5"><Kbd>Espaço</Kbd> disparar</span>
            <span className="flex items-center gap-1.5"><Kbd>P</Kbd> pausar</span>
            <span className="flex items-center gap-1.5"><Kbd>→</Kbd> passo</span>
            <span className="flex items-center gap-1.5"><Kbd>C</Kbd> limpar</span>
          </div>
        </header>

        <div className="relative flex-1 overflow-hidden">
          <SimCanvas shots={sim.shots} selectedId={sim.selectedId} preview={preview} params={params} view={view} />

          {/* Telemetria */}
          <div className="pointer-events-none absolute inset-x-3 top-3 grid grid-cols-2 gap-2 sm:inset-x-4 sm:top-4 sm:grid-cols-4 xl:right-auto xl:w-[640px]">
            <Stat label="Tempo de voo" value={fmt(sel ? sel.t : 0)} unit="s" />
            <Stat label="Alcance" value={fmt(cur ? cur.x : 0)} unit="m" accent={landed} />
            <Stat label="Altura máxima" value={fmt(sel ? maxHeightUntil(sel.result, sel.t) : 0)} unit="m" accent={!!sel && sel.t >= sel.result.summary.apexTime} />
            <Stat label="Velocidade" value={fmt(cur ? Math.hypot(cur.vx, cur.vy) : 0)} unit="m/s" />
          </div>
          {cur && (
            <div className="pointer-events-none absolute top-[92px] left-4 hidden rounded-lg border border-edge bg-panel/90 px-3 py-2 font-mono text-[11px] text-slate-400 sm:block">
              <span className="text-slate-500">x</span> {fmt(cur.x)} m · <span className="text-slate-500">y</span> {fmt(cur.y)} m ·{' '}
              <span className="text-amber">vx</span> {fmt(cur.vx)} m/s · <span className="text-amber">vy</span> {fmt(cur.vy)} m/s
            </div>
          )}
        </div>
      </main>

      {/* ======= Painel de controle ======= */}
      <aside className="w-full shrink-0 overflow-y-auto border-t border-edge bg-panel lg:w-[360px] lg:border-t-0 lg:border-l">
        <Section title="Reprodução">
          <button
            type="button"
            onClick={fire}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-cyan py-2.5 text-sm font-semibold text-bg transition hover:bg-sky-300 active:scale-[0.99]"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M5 3l15 9-15 9z" /></svg>
            Disparar
          </button>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              disabled={!sim.anyInFlight}
              onClick={() => sim.setPlaying(!sim.playing)}
              className="rounded-lg border border-edge py-2 text-[13px] text-slate-200 transition hover:border-slate-600 disabled:opacity-40"
            >
              {sim.playing ? 'Pausar' : 'Continuar'}
            </button>
            <button
              type="button"
              onClick={step}
              title="Avança 1 quadro (1/60 s). Sem projétil em voo, dispara pausado."
              className={`rounded-lg border py-2 text-[13px] transition ${pausedOrIdle ? 'border-amber/50 text-amber hover:bg-amber/10' : 'border-edge text-slate-200 hover:border-slate-600'}`}
            >
              Passo
            </button>
            <button
              type="button"
              disabled={sim.shots.length === 0}
              onClick={sim.clear}
              className="rounded-lg border border-edge py-2 text-[13px] text-slate-200 transition hover:border-rose-500/60 hover:text-rose-300 disabled:opacity-40"
            >
              Limpar
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-slate-400">Velocidade da animação</span>
            <div className="flex gap-1">
              {SPEEDS.map((s) => (
                <Chip key={s} active={sim.speed === s} onClick={() => sim.setSpeed(s)}>
                  {fmt(s, s < 1 ? 2 : 0)}×
                </Chip>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Lançamento">
          <Slider label="Velocidade inicial" symbol="v₀" value={params.v0} min={1} max={100} step={0.5} unit="m/s" onChange={(v) => set('v0', v)} />
          <Slider label="Ângulo de lançamento" symbol="θ" value={params.angleDeg} min={0} max={90} step={1} unit="°" digits={0} accent="#F59E0B" onChange={(v) => set('angleDeg', v)} />
        </Section>

        <Section title="Ambiente">
          <Slider label="Gravidade" symbol="g" value={params.g} min={0.5} max={30} step={0.01} unit="m/s²" digits={2} onChange={(v) => set('g', v)} />
          <div className="flex flex-wrap gap-1.5">
            {PLANETS.map((p) => (
              <Chip key={p.name} active={Math.abs(params.g - p.g) < 1e-6} onClick={() => set('g', p.g)} title={`${fmt(p.g, 2)} m/s²`}>
                {p.name}
              </Chip>
            ))}
          </div>
          <Slider
            label="Resistência do ar"
            symbol="Cd"
            value={params.cd}
            min={0}
            max={1.5}
            step={0.01}
            unit=""
            digits={2}
            accent="#F59E0B"
            hint={params.cd === 0 ? 'Cd = 0: vácuo. O movimento segue as fórmulas ideais.' : `F = ½·ρ·Cd·A·v², com ρ = ${fmt(params.airDensity, 3)} kg/m³ (nível do mar)`}
            onChange={(v) => set('cd', v)}
          />
          <div className={params.cd === 0 ? 'pointer-events-none opacity-40' : ''} aria-disabled={params.cd === 0}>
            <label className="mb-1.5 block text-[13px] text-slate-300" htmlFor="obj">
              Projétil
            </label>
            <select
              id="obj"
              value={objectId}
              onChange={(e) => {
                const o = OBJECTS.find((x) => x.id === e.target.value);
                setObjectId(e.target.value);
                if (o) setParams((p) => ({ ...p, mass: o.mass, diameter: o.diameter, cd: o.cd }));
              }}
              className="mb-4 w-full rounded-md border border-edge bg-bg px-2.5 py-2 text-[13px] text-slate-200 outline-none focus:border-cyan/60"
            >
              {OBJECTS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
              <option value="custom">Personalizado</option>
            </select>
            <div className="space-y-4">
              <Slider label="Massa" symbol="m" value={params.mass} min={0.002} max={30} step={0.001} unit="kg" digits={3} onChange={(v) => { setObjectId('custom'); set('mass', v); }} />
              <Slider label="Diâmetro" symbol="d" value={params.diameter} min={0.01} max={1} step={0.001} unit="m" digits={3} onChange={(v) => { setObjectId('custom'); set('diameter', v); }} />
            </div>
          </div>
        </Section>

        <Section title="Visualização">
          <Toggle label="Vetor velocidade" checked={view.velocity} onChange={(v) => setView((o) => ({ ...o, velocity: v }))} />
          <Toggle label="Componentes vx e vy" color="#F59E0B" checked={view.components} onChange={(v) => setView((o) => ({ ...o, components: v }))} />
          <Toggle label="Marcas a cada 0,5 s" color="#94A3B8" checked={view.timeMarks} onChange={(v) => setView((o) => ({ ...o, timeMarks: v }))} />
          <Toggle label="Prévia da trajetória" color="rgba(229,231,235,.4)" checked={view.preview} onChange={(v) => setView((o) => ({ ...o, preview: v }))} />
        </Section>

        <Section
          title="Verificação no vácuo"
          right={
            checkSrc && ref ? (
              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                ✓ confere
              </span>
            ) : null
          }
        >
          {checkSrc && ref ? (
            <div className="space-y-2 font-mono text-[12px]">
              <p className="font-sans text-[11px] text-slate-500">
                {checkSrc === preview ? 'Comparando a prévia atual' : 'Comparando o disparo selecionado'} com as fórmulas fechadas:
              </p>
              {[
                { f: 'R = v₀²·sen(2θ)/g', th: ref.range, sm: checkSrc.summary.range },
                { f: 'H = v₀²·sen²θ/(2g)', th: ref.maxHeight, sm: checkSrc.summary.maxHeight },
                { f: 'T = 2·v₀·senθ/g', th: ref.flightTime, sm: checkSrc.summary.flightTime },
              ].map((r) => (
                <div key={r.f} className="rounded-lg border border-edge bg-bg px-3 py-2">
                  <div className="mb-1 text-slate-400">{r.f}</div>
                  <div className="grid grid-cols-3 gap-1 text-[11px]">
                    <span className="text-slate-500">teórico<br /><span className="text-slate-200">{fmt(r.th, 4)}</span></span>
                    <span className="text-slate-500">simulado<br /><span className="text-cyan">{fmt(r.sm, 4)}</span></span>
                    <span className="text-slate-500">erro<br /><span className="text-emerald-400">{Math.abs(r.sm - r.th).toExponential(1).replace('.', ',')}</span></span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[12px] text-slate-400">
              Com arrasto, as fórmulas ideais não valem.{' '}
              <button type="button" className="text-cyan underline-offset-2 hover:underline" onClick={() => set('cd', 0)}>
                Zerar Cd para comparar
              </button>
              {(() => {
                const r0 = analyticVacuum(params);
                const loss = 1 - preview.summary.range / r0.range;
                return Number.isFinite(loss) && r0.range > 0 ? (
                  <p className="mt-2 font-mono text-[11px] text-slate-500">
                    Prévia: alcance {fmt(loss * 100, 1)}% menor que no vácuo ({fmt(preview.summary.range)} m contra {fmt(r0.range)} m).
                  </p>
                ) : null;
              })()}
            </div>
          )}
        </Section>

        <Section
          title={`Trajetórias (${sim.shots.length})`}
          right={
            <button
              type="button"
              disabled={!sel}
              onClick={() => sel && downloadJson(sel.result)}
              className="flex items-center gap-1.5 rounded-md border border-amber/50 px-2.5 py-1 text-[12px] font-medium text-amber transition hover:bg-amber/10 disabled:opacity-40"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
              </svg>
              Exportar JSON
            </button>
          }
        >
          {sim.shots.length === 0 ? (
            <p className="text-[12px] text-slate-500">Nenhum disparo ainda. Ajuste os parâmetros e clique em Disparar. Até 8 trajetórias ficam na tela para comparação.</p>
          ) : (
            <ul className="space-y-1.5">
              {[...sim.shots].reverse().map((s) => {
                const p = s.result.params;
                const active = s.id === sim.selectedId;
                return (
                  <li key={s.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => sim.setSelectedId(s.id)}
                      onKeyDown={(e) => e.key === 'Enter' && sim.setSelectedId(s.id)}
                      className={`group flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition ${active ? 'border-slate-600 bg-bg' : 'border-edge hover:border-slate-700'}`}
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color, boxShadow: active ? `0 0 8px ${s.color}` : undefined }} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-[11px] text-slate-300">
                          {fmt(p.v0, 1)} m/s · {fmt(p.angleDeg, 0)}° · g {fmt(p.g, 2)} · Cd {fmt(p.cd, 2)}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">
                          R {fmt(s.result.summary.range)} m · H {fmt(s.result.summary.maxHeight)} m · T {fmt(s.result.summary.flightTime)} s
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-label="Remover trajetória"
                        onClick={(e) => {
                          e.stopPropagation();
                          sim.remove(s.id);
                        }}
                        className="text-slate-600 opacity-0 transition group-hover:opacity-100 hover:text-rose-400 focus:opacity-100"
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <p className="px-5 py-4 text-[11px] leading-relaxed text-slate-600">
          Integração RK4 com localização exata do ápice e do impacto. Unidades do SI. A prévia tracejada muda junto com os controles, e cada disparo guarda os parâmetros que tinha no momento do lançamento.
        </p>
      </aside>
    </div>
  );
}
