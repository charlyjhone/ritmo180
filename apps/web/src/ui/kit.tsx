// Componentes visuais compartilhados, com as mesmas classes do design.
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { formatClock } from "@ritmo/engine";
import type { Area, ScoreView } from "@ritmo/contracts";

export const clock = formatClock;
export const clockOrDash = (seconds: number | null | undefined) => (seconds == null ? "—" : formatClock(seconds));
export const number = (n: number) => n.toLocaleString("pt-BR");
export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");
export const points = (n: number) => `${signed(n)} ${Math.abs(n) === 1 ? "ponto" : "pontos"}`;

export function PageHead({ kicker, title, actions, size }: { kicker: string; title: ReactNode; actions?: ReactNode; size?: string }) {
  return (
    <div className="page-head">
      <div>
        <div className="kicker">{kicker}</div>
        <h1 className={size} id="headline">{title}</h1>
      </div>
      {actions}
    </div>
  );
}

export interface MetricProps {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: "up" | "down" | "";
  valueTone?: "amber" | "ok" | "brand" | "";
  hint?: ReactNode;
  extra?: ReactNode;
  xl?: boolean;
}

export function Metric({ label, value, note, tone = "", valueTone = "", hint, extra, xl }: MetricProps) {
  return (
    <div className="card">
      <div className="metric-label">{label}</div>
      <div className={`metric-value mono ${valueTone} ${xl ? "xl" : ""}`}>{value}</div>
      {note ? <div className={`metric-note ${tone}`}>{note}</div> : null}
      {hint ? <div className="metric-hint">{hint}</div> : null}
      {extra}
    </div>
  );
}

export const Metrics = ({ label, children }: { label: string; children: ReactNode }) => <section className="grid-metrics" aria-label={label}>{children}</section>;
export const Pill = ({ tone = "gray", children }: { tone?: string; children: ReactNode }) => <span className={`pill ${tone}`}>{children}</span>;

export const Bar = ({ pct, tone = "", size = "h8" }: { pct: number; tone?: string; size?: string }) => (
  <div className={`track ${size}`}><i className={tone} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>
);

export function TimeStrip({ read, path, calc, check, small }: { read: number; path: number; calc: number; check: number; small?: boolean }) {
  const total = read + path + calc + check || 1;
  const seg = (ms: number) => `${(ms / total) * 100}%`;
  const label = (name: string, ms: number) => `${name} ${clock(ms / 1000)}`;
  return (
    <div className={`strip ${small ? "small" : ""}`} role="img" aria-label={`${label("Leitura", read)}, ${label("Caminho", path)}, ${label("Cálculo", calc)}, ${label("Conferência", check)}`}>
      <div className="read" style={{ width: seg(read) }}>{label("Leitura", read)}</div>
      <div className="path" style={{ width: seg(path) }}>{label("Caminho", path)}</div>
      <div className="calc" style={{ width: seg(calc) }}>{label("Cálculo", calc)}</div>
      <div className="check" style={{ width: seg(check) }}>{clock(check / 1000)}</div>
    </div>
  );
}

export function LineChart({ values, labels, label, width = 600, goal }: { values: (number | null)[]; labels: string[]; label: string; width?: number; goal?: number }) {
  const known = values.flatMap((v) => (v === null ? [] : [v]));
  if (known.length < 2) return <p className="sub">Ainda não há semanas suficientes para mostrar a evolução.</p>;
  const lo = Math.max(0, Math.floor(Math.min(...known, goal ?? 100) / 10) * 10 - 10);
  const hi = Math.min(100, Math.ceil(Math.max(...known, goal ?? 0) / 10) * 10 + 10);
  const y = (v: number) => Math.round(160 - ((v - lo) / (hi - lo)) * 140);
  const x = (i: number) => Math.round(60 + (i * (width - 100)) / Math.max(1, values.length - 1));
  const points = values.flatMap((v, i) => (v === null ? [] : [{ x: x(i), y: y(v), v }]));
  const last = points.at(-1)!;
  return (
    <svg className="chart" viewBox={`0 0 ${width} 220`} role="img" aria-label={label}>
      {[hi, Math.round((hi + lo) / 2), lo].map((tick) => (
        <g key={tick}>
          <line x1="40" y1={y(tick)} x2={width - 20} y2={y(tick)} stroke="#EEF0F4" />
          <text x="32" y={y(tick) + 4} textAnchor="end" fontSize="12" fill="#5B6474">{tick}%</text>
        </g>
      ))}
      {goal !== undefined ? <line x1="40" y1={y(goal)} x2={width - 20} y2={y(goal)} stroke="#0F7A4A" strokeDasharray="5 5" /> : null}
      <polyline points={points.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#2447D6" strokeWidth="3" strokeLinejoin="round" />
      {points.map((p) => <circle key={p.x} cx={p.x} cy={p.y} r="5" fill="#FFFFFF" stroke="#2447D6" strokeWidth="3" />)}
      {values.map((_, i) => <text key={i} x={x(i)} y="190" textAnchor="middle" fontSize="12" fill="#5B6474">{labels[i]}</text>)}
      <text x={last.x} y={Math.max(14, last.y - 12)} textAnchor="middle" fontSize="14" fontWeight="800" fill="#2447D6">{last.v}%</text>
    </svg>
  );
}

/** HTML de questão já limpo no importador. */
export const Html = ({ html, className }: { html: string; className?: string }) => <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;

export function Async<T>({ query, children }: { query: UseQueryResult<T>; children: (data: T) => ReactNode }) {
  if (query.isPending) return <div className="state" role="status">Carregando…</div>;
  if (query.isError) {
    return (
      <div className="state" role="alert">
        <p>{query.error.message}</p>
        <button className="btn soft" type="button" onClick={() => void query.refetch()}>Tentar de novo</button>
      </div>
    );
  }
  return <>{children(query.data)}</>;
}

export interface TabItem {
  id: string;
  label: string;
}

/** Abas com setas do teclado. */
export function Tabs({ items, active, onChange, label, className }: { items: TabItem[]; active: string; onChange: (id: string) => void; label: string; className?: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (event: KeyboardEvent, index: number) => {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + items.length) % items.length;
    onChange(items[next]!.id);
    refs.current[next]?.focus();
  };
  return (
    <div className={className} role="tablist" aria-label={label}>
      {items.map((item, i) => (
        <button
          key={item.id}
          ref={(el) => { refs.current[i] = el; }}
          className={className === "segmented" ? "btn" : undefined}
          type="button"
          role="tab"
          id={`tab-${item.id}`}
          aria-selected={item.id === active}
          aria-controls={`panel-${item.id}`}
          tabIndex={item.id === active ? 0 : -1}
          onClick={() => onChange(item.id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

const AREA_LABEL: Record<Area, string> = { CN: "CN", MT: "MT", LC: "LC", CH: "CH" };

export function ScoreMetric({ score }: { score: ScoreView }) {
  if (score.score === null) {
    return <Metric xl label={`Nota TRI estimada · ${AREA_LABEL[score.area]}`} value="—" note={`Faltam ${Math.max(0, score.neededItems - score.items)} questões calibradas`} hint="A nota aparece com medida confiável" />;
  }
  return <Metric xl label={`Nota TRI estimada · ${AREA_LABEL[score.area]}`} value={score.score} note={`Faixa provável: ${score.low} a ${score.high}`} hint={score.provisional ? "Escala provisória nesta área" : `${score.items} questões na estimativa`} />;
}

export function useInterval(callback: () => void, ms: number, active = true) {
  const saved = useRef(callback);
  saved.current = callback;
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => saved.current(), ms);
    return () => clearInterval(id);
  }, [ms, active]);
}

export function saveFile(name: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob(["﻿", text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
