import { useEffect, useState, type ReactNode } from 'react';
import { fmt } from '../core/format';

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="border-b border-edge px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{title}</h2>
        {right}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

interface SliderProps {
  label: string;
  symbol?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  digits?: number;
  accent?: string;
  hint?: string;
  onChange: (v: number) => void;
}

export function Slider({ label, symbol, value, min, max, step, unit, digits = 1, accent = '#38BDF8', hint, onChange }: SliderProps) {
  const [text, setText] = useState(fmt(value, digits));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(fmt(value, digits));
  }, [value, digits, editing]);

  const commit = () => {
    setEditing(false);
    const n = Number(text.replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
    else setText(fmt(value, digits));
  };
  const fill = ((value - min) / (max - min)) * 100;
  const id = `sl-${label.replace(/\W+/g, '-')}`;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-[13px] text-slate-300">
          {label}
          {symbol && <span className="ml-1.5 font-mono text-xs text-slate-500">{symbol}</span>}
        </label>
        <div className="flex items-center rounded-md border border-edge bg-bg focus-within:border-cyan/60">
          <input
            aria-label={`${label} (${unit})`}
            className="w-[68px] bg-transparent py-1 pl-2 text-right font-mono text-[13px] text-slate-100 outline-none"
            value={text}
            inputMode="decimal"
            onFocus={() => setEditing(true)}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <span className="pr-2 pl-1 font-mono text-[11px] text-slate-500">{unit}</span>
        </div>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ['--fill' as string]: `${fill}%`, ['--accent' as string]: accent }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

export function Chip({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
        active ? 'border-cyan/60 bg-cyan/10 text-cyan' : 'border-edge text-slate-400 hover:border-slate-600 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  );
}

export function Toggle({ label, checked, onChange, color = '#38BDF8' }: { label: string; checked: boolean; onChange: (v: boolean) => void; color?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-[13px] text-slate-300">
      <span className="flex items-center gap-2">
        <span className="inline-block h-0.5 w-3.5 rounded" style={{ background: color }} />
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition-colors ${checked ? 'bg-cyan/80' : 'bg-edge'}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
    </label>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-edge bg-bg px-1.5 py-0.5 font-mono text-[10px] text-slate-400">{children}</kbd>;
}

export function Stat({ label, value, unit, accent }: { label: string; value: string; unit: string; accent?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border border-edge bg-panel/90 px-3.5 py-2.5 backdrop-blur">
      <div className="truncate text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className={`truncate font-mono text-xl font-medium tabular-nums ${accent ? 'text-cyan' : 'text-slate-100'}`}>{value}</span>
        <span className="font-mono text-[11px] text-slate-500">{unit}</span>
      </div>
    </div>
  );
}

const SPEEDS = [0.25, 0.5, 1, 2];

export function Playback({
  playing,
  finished,
  onToggle,
  onStep,
  onReset,
  speed,
  setSpeed,
  startLabel = 'Iniciar',
}: {
  playing: boolean;
  finished?: boolean;
  onToggle: () => void;
  onStep: () => void;
  onReset: () => void;
  speed: number;
  setSpeed: (s: number) => void;
  startLabel?: string;
}) {
  return (
    <Section title="Reprodução">
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition active:scale-[0.99] ${
          playing ? 'border border-cyan/60 text-cyan hover:bg-cyan/10' : 'bg-cyan text-bg hover:bg-sky-300'
        }`}
      >
        {playing ? (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M5 3l15 9-15 9z" /></svg>
        )}
        {playing ? 'Pausar' : finished ? 'Repetir' : startLabel}
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onStep}
          title="Avança 1 quadro (1/60 s)"
          className={`rounded-lg border py-2 text-[13px] transition ${!playing ? 'border-amber/50 text-amber hover:bg-amber/10' : 'border-edge text-slate-200 hover:border-slate-600'}`}
        >
          Passo
        </button>
        <button type="button" onClick={onReset} className="rounded-lg border border-edge py-2 text-[13px] text-slate-200 transition hover:border-rose-500/60 hover:text-rose-300">
          Reiniciar
        </button>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-slate-400">Velocidade</span>
        <div className="flex gap-1">
          {SPEEDS.map((s) => (
            <Chip key={s} active={speed === s} onClick={() => setSpeed(s)}>
              {fmt(s, s < 1 ? 2 : 0)}×
            </Chip>
          ))}
        </div>
      </div>
    </Section>
  );
}

export interface VerifyRow {
  formula: string;
  theory: number | null;
  sim: number | null;
  digits?: number;
  /** Erro relativo aceito para marcar como conferido. */
  tol?: number;
  note?: string;
}

export function VerifyTable({ rows, empty }: { rows: VerifyRow[]; empty?: string }) {
  const valid = rows.filter((r) => r.theory !== null && r.sim !== null);
  const ok =
    valid.length > 0 &&
    valid.every((r) => Math.abs(r.sim! - r.theory!) <= (r.tol ?? 1e-3) * Math.max(1e-9, Math.abs(r.theory!)) + 1e-9);
  return (
    <Section
      title="Verificação"
      right={
        valid.length ? (
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
              ok ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' : 'border-amber/40 bg-amber/10 text-amber'
            }`}
          >
            {ok ? '✓ confere' : 'diferença'}
          </span>
        ) : null
      }
    >
      {valid.length === 0 && empty ? <p className="text-[12px] text-slate-500">{empty}</p> : null}
      <div className="space-y-2 font-mono text-[12px]">
        {rows.map((r) => (
          <div key={r.formula} className="rounded-lg border border-edge bg-bg px-3 py-2">
            <div className="mb-1 text-slate-400">{r.formula}</div>
            {r.theory === null || r.sim === null ? (
              <div className="font-sans text-[11px] text-slate-500">{r.note ?? 'Aguardando dados da simulação…'}</div>
            ) : (
              <div className="grid grid-cols-3 gap-1 text-[11px]">
                <span className="text-slate-500">
                  teórico
                  <br />
                  <span className="text-slate-200">{fmt(r.theory, r.digits ?? 3)}</span>
                </span>
                <span className="text-slate-500">
                  simulado
                  <br />
                  <span className="text-cyan">{fmt(r.sim, r.digits ?? 3)}</span>
                </span>
                <span className="text-slate-500">
                  erro
                  <br />
                  <span className="text-emerald-400">
                    {fmt((Math.abs(r.sim - r.theory) / Math.max(1e-12, Math.abs(r.theory))) * 100, 3)}%
                  </span>
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

export function ExportButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md border border-amber/50 px-2.5 py-1 text-[12px] font-medium text-amber transition hover:bg-amber/10 disabled:opacity-40"
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
      </svg>
      Exportar JSON
    </button>
  );
}

export function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const id = `sel-${label.replace(/\W+/g, '-')}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] text-slate-300">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full rounded-md border border-edge bg-bg px-2.5 py-2 text-[13px] text-slate-200 outline-none focus:border-cyan/60"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="text-[12px] leading-relaxed text-slate-400">{children}</p>;
}
