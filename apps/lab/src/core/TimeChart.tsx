import { COLORS, niceStep, useCanvas } from './canvas';
import type { Sample } from './stepper';
import { fmt } from './format';

export interface Series {
  key: string;
  label: string;
  color: string;
}

interface Props {
  title: string;
  unit: string;
  data: Sample[];
  series: Series[];
  /** Janela de tempo visível (s); null = tudo. */
  window?: number | null;
  /** Força incluir zero no eixo y. */
  zero?: boolean;
  tUnit?: string;
}

/** Gráfico de séries temporais em canvas, atualizado a cada quadro. */
export default function TimeChart({ title, unit, data, series, window = 10, zero = true, tUnit = 's' }: Props) {
  const { wrapRef, canvasRef } = useCanvas((ctx, W, H) => {
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(0, 0, W, H);
    const pad = { l: 46, r: 12, t: 24, b: 22 };
    const pw = W - pad.l - pad.r;
    const ph = H - pad.t - pad.b;

    const tEnd = data.length ? data[data.length - 1].t : 0;
    const t1 = window ? Math.max(window, tEnd) : Math.max(tEnd, 1e-6);
    const t0 = window ? t1 - window : 0;
    let lo = zero ? 0 : Infinity;
    let hi = zero ? 0 : -Infinity;
    let i0 = 0;
    while (i0 < data.length && data[i0].t < t0) i0++;
    for (let i = i0; i < data.length; i++)
      for (const s of series) {
        const v = data[i][s.key];
        if (Number.isFinite(v)) {
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
    if (!Number.isFinite(lo)) {
      lo = -1;
      hi = 1;
    }
    if (hi - lo < 1e-9) {
      hi += 1;
      lo -= 1;
    }
    const m = (hi - lo) * 0.08;
    hi += m;
    lo -= zero && lo === 0 ? 0 : m;

    const X = (t: number) => pad.l + ((t - t0) / (t1 - t0)) * pw;
    const Y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * ph;

    // grade
    ctx.strokeStyle = COLORS.edge;
    ctx.lineWidth = 1;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = COLORS.label;
    const ys = niceStep((hi - lo) / 4);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.beginPath();
    for (let v = Math.ceil(lo / ys) * ys; v <= hi; v += ys) {
      const py = Math.round(Y(v)) + 0.5;
      ctx.moveTo(pad.l, py);
      ctx.lineTo(W - pad.r, py);
      ctx.fillText(fmt(v, ys < 1 ? (ys < 0.1 ? 2 : 1) : 0), pad.l - 6, py);
    }
    ctx.stroke();
    const ts = niceStep((t1 - t0) / 6);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let t = Math.ceil(t0 / ts) * ts; t <= t1 + 1e-9; t += ts) ctx.fillText(fmt(t, ts < 1 ? 1 : 0), X(t), H - pad.b + 5);
    if (lo < 0 && hi > 0) {
      ctx.strokeStyle = COLORS.axis;
      ctx.beginPath();
      ctx.moveTo(pad.l, Math.round(Y(0)) + 0.5);
      ctx.lineTo(W - pad.r, Math.round(Y(0)) + 0.5);
      ctx.stroke();
    }

    // séries
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.l, pad.t - 2, pw, ph + 4);
    ctx.clip();
    for (const s of series) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.8;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let started = false;
      const stride = Math.max(1, Math.floor((data.length - i0) / (pw * 1.5)));
      for (let i = Math.max(0, i0 - 1); i < data.length; i += stride) {
        const v = data[i][s.key];
        if (!Number.isFinite(v)) continue;
        if (!started) {
          ctx.moveTo(X(data[i].t), Y(v));
          started = true;
        } else ctx.lineTo(X(data[i].t), Y(v));
      }
      if (data.length) {
        const last = data[data.length - 1];
        if (Number.isFinite(last[s.key])) ctx.lineTo(X(last.t), Y(last[s.key]));
      }
      ctx.stroke();
      if (data.length) {
        const last = data[data.length - 1];
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(X(last.t), Y(last[s.key]), 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // título e legenda
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '600 11px Inter, sans-serif';
    ctx.fillStyle = COLORS.text;
    ctx.fillText(title, 10, 12);
    let lx = 10 + ctx.measureText(title).width + 8;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = COLORS.label;
    ctx.fillText(`(${unit})`, lx, 12);
    lx += ctx.measureText(`(${unit})`).width + 14;
    if (series.length > 1)
      for (const s of series) {
        ctx.fillStyle = s.color;
        ctx.fillRect(lx, 11, 10, 2);
        ctx.fillText(s.label, lx + 14, 12);
        lx += ctx.measureText(s.label).width + 30;
      }
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.label;
    ctx.fillText(`t (${tUnit})`, W - pad.r, 12);
  });

  return (
    <div ref={wrapRef} className="relative h-full min-h-[120px] w-full overflow-hidden rounded-lg border border-edge">
      <canvas ref={canvasRef} className="absolute inset-0 block" role="img" aria-label={`Gráfico ${title} em função do tempo`} />
    </div>
  );
}
