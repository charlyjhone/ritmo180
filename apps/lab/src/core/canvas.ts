import { useEffect, useRef } from 'react';
import { fmt } from './format';

export const COLORS = {
  bg: '#0B0F19',
  panel: '#111827',
  edge: '#1F2937',
  gridMinor: 'rgba(31,41,55,0.55)',
  gridMajor: '#1F2937',
  axis: '#374151',
  label: '#6B7280',
  text: '#E5E7EB',
  muted: '#9CA3AF',
  cyan: '#38BDF8',
  amber: '#F59E0B',
  violet: '#A78BFA',
  green: '#34D399',
  pink: '#F472B6',
  rose: '#FB7185',
  water: 'rgba(56,189,248,0.18)',
};

export type DrawFn = (ctx: CanvasRenderingContext2D, W: number, H: number) => void;

/** Canvas com HiDPI, ResizeObserver e redesenho por requestAnimationFrame. */
export function useCanvas(draw: DrawFn) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext('2d')!;
    let W = 1;
    let H = 1;
    let dpr = 1;
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      W = Math.max(1, r.width);
      H = Math.max(1, r.height);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawRef.current(ctx, W, H);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return { wrapRef, canvasRef };
}

export interface View {
  X: (x: number) => number;
  Y: (y: number) => number;
  s: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Converte pixel → mundo */
  inv: (px: number, py: number) => [number, number];
}

/** Transformação mundo→tela com a mesma escala nos dois eixos, centrando o retângulo pedido. */
export function fitView(
  W: number,
  H: number,
  box: { x0: number; x1: number; y0: number; y1: number },
  pad = { l: 56, r: 24, t: 24, b: 40 },
): View {
  const aw = Math.max(10, W - pad.l - pad.r);
  const ah = Math.max(10, H - pad.t - pad.b);
  const s = Math.min(aw / (box.x1 - box.x0), ah / (box.y1 - box.y0));
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const ox = pad.l + aw / 2 - cx * s;
  const oy = pad.t + ah / 2 + cy * s;
  const X = (x: number) => ox + x * s;
  const Y = (y: number) => oy - y * s;
  return {
    X,
    Y,
    s,
    x0: (0 - ox) / s,
    x1: (W - ox) / s,
    y0: (oy - H) / s,
    y1: oy / s,
    inv: (px, py) => [(px - ox) / s, (oy - py) / s],
  };
}

export function niceStep(raw: number): number {
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}

export function clear(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);
}

/** Grade cartesiana com rótulos em metros (ou outra unidade). */
export function drawGrid(ctx: CanvasRenderingContext2D, v: View, W: number, H: number, opts: { unit?: string; axes?: boolean; labels?: boolean } = {}) {
  const major = niceStep(90 / v.s);
  const minor = major / 5;
  const line = (step: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.ceil(v.x0 / step) * step; x <= v.x1; x += step) {
      const px = Math.round(v.X(x)) + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, H);
    }
    for (let y = Math.ceil(v.y0 / step) * step; y <= v.y1; y += step) {
      const py = Math.round(v.Y(y)) + 0.5;
      ctx.moveTo(0, py);
      ctx.lineTo(W, py);
    }
    ctx.stroke();
  };
  line(minor, COLORS.gridMinor);
  line(major, COLORS.gridMajor);
  if (opts.axes !== false) {
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, v.Y(0) + 0.5);
    ctx.lineTo(W, v.Y(0) + 0.5);
    ctx.moveTo(v.X(0) + 0.5, 0);
    ctx.lineTo(v.X(0) + 0.5, H);
    ctx.stroke();
  }
  if (opts.labels !== false) {
    const dec = major < 1 ? (major < 0.1 ? 2 : 1) : 0;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillStyle = COLORS.label;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const yLab = Math.min(Math.max(v.Y(0) + 6, 4), H - 16);
    for (let x = Math.ceil(v.x0 / major) * major; x <= v.x1; x += major) if (Math.abs(x) > 1e-9) ctx.fillText(fmt(x, dec), v.X(x), yLab);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const xLab = Math.min(Math.max(v.X(0) - 6, 36), W - 4);
    for (let y = Math.ceil(v.y0 / major) * major; y <= v.y1; y += major) if (Math.abs(y) > 1e-9) ctx.fillText(fmt(y, dec), xLab, v.Y(y));
    if (opts.unit) {
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(opts.unit, W - 8, H - 6);
    }
  }
}

export function arrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, w = 2, dashed = false) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 2) return;
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const head = Math.min(10, len * 0.4);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = w;
  if (dashed) ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1 - Math.cos(ang) * head * 0.8, y1 - Math.sin(ang) * head * 0.8);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - head * Math.cos(ang - 0.4), y1 - head * Math.sin(ang - 0.4));
  ctx.lineTo(x1 - head * Math.cos(ang + 0.4), y1 - head * Math.sin(ang + 0.4));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Seta com rótulo na ponta. */
export function labeledArrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, label: string, w = 2.2) {
  arrow(ctx, x0, y0, x1, y1, color, w);
  if (Math.hypot(x1 - x0, y1 - y0) < 4) return;
  const ang = Math.atan2(y1 - y0, x1 - x0);
  ctx.font = '600 11px "JetBrains Mono", monospace';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x1 + Math.cos(ang) * 14, y1 + Math.sin(ang) * 14);
}

export function pill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, align: 'left' | 'center' | 'right' = 'center') {
  ctx.font = '500 11px "JetBrains Mono", monospace';
  const w = ctx.measureText(text).width + 12;
  const bx = align === 'center' ? x - w / 2 : align === 'left' ? x : x - w;
  ctx.fillStyle = 'rgba(17,24,39,0.92)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(bx, y - 10, w, 20, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + 6, y + 0.5);
}

/** Barras de energia/quantidade com valores, desenhadas no canto do canvas. */
export function barGroup(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  bars: { label: string; value: number; color: string }[],
  maxAbs: number,
  unit: string,
) {
  const bw = 34;
  const gap = 14;
  const w = bars.length * (bw + gap) + gap;
  ctx.fillStyle = 'rgba(17,24,39,0.92)';
  ctx.strokeStyle = COLORS.edge;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h + 56, 10);
  ctx.fill();
  ctx.stroke();
  const anyNeg = bars.some((b) => b.value < -1e-9);
  const base = anyNeg ? y + 20 + h / 2 : y + 20 + h;
  const scale = (anyNeg ? h / 2 : h) / Math.max(maxAbs, 1e-9);
  ctx.strokeStyle = COLORS.axis;
  ctx.beginPath();
  ctx.moveTo(x + 8, base + 0.5);
  ctx.lineTo(x + w - 8, base + 0.5);
  ctx.stroke();
  bars.forEach((b, i) => {
    const bx = x + gap + i * (bw + gap);
    const bh = b.value * scale;
    ctx.fillStyle = b.color;
    ctx.fillRect(bx, base - Math.max(bh, 0), bw, Math.abs(bh));
    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.fillStyle = b.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(b.label, bx + bw / 2, y + h + 26);
    ctx.fillStyle = COLORS.muted;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText(fmt(b.value, Math.abs(b.value) >= 100 ? 0 : 1), bx + bw / 2, y + h + 40);
  });
  ctx.fillStyle = COLORS.label;
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(unit, x + 8, y + 5);
  return w;
}
