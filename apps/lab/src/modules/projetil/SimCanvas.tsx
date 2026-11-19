import { useEffect, useRef } from 'react';
import { DEG, sampleAt, type LaunchParams, type TrajectoryPoint, type TrajectoryResult } from './simulate';
import type { Shot } from './useSimulation';
import { fmt } from '../../core/format';

export interface ViewOptions {
  velocity: boolean;
  components: boolean;
  timeMarks: boolean;
  preview: boolean;
}

interface Props {
  shots: Shot[];
  selectedId: number | null;
  preview: TrajectoryResult;
  params: LaunchParams;
  view: ViewOptions;
}

const PAD = { l: 58, r: 28, t: 120, b: 40 };
const C = {
  bg: '#0B0F19',
  ground: '#0E1422',
  gridMinor: 'rgba(31,41,55,0.55)',
  gridMajor: '#1F2937',
  axis: '#374151',
  label: '#6B7280',
  text: '#E5E7EB',
  cyan: '#38BDF8',
  amber: '#F59E0B',
};

function niceStep(raw: number): number {
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}

function arrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, w = 2, dashed = false) {
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

function pill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, align: 'left' | 'center' = 'center') {
  ctx.font = '500 11px "JetBrains Mono", monospace';
  const w = ctx.measureText(text).width + 12;
  const bx = align === 'center' ? x - w / 2 : x;
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

export default function SimCanvas({ shots, selectedId, preview, params, view }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const props = useRef({ shots, selectedId, preview, params, view });
  props.current = { shots, selectedId, preview, params, view };
  const mouse = useRef<{ x: number; y: number } | null>(null);
  const extent = useRef({ x: 40, y: 20 }); // metros visíveis (suavizado)

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext('2d')!;
    let W = 0;
    let H = 0;
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
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const { shots, selectedId, preview, params, view } = props.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // --- escala automática (mesma escala em x e y) ---
      let tx = 10;
      let ty = 5;
      const consider = (r: TrajectoryResult) => {
        tx = Math.max(tx, r.summary.range);
        ty = Math.max(ty, r.summary.maxHeight);
      };
      if (view.preview) consider(preview);
      shots.forEach((s) => consider(s.result));
      tx *= 1.12;
      ty *= 1.25;
      const e = extent.current;
      e.x += (tx - e.x) * 0.12;
      e.y += (ty - e.y) * 0.12;
      // reserva espaço no topo para a telemetria sobreposta
      const padT = W < 640 ? 170 : 132;
      const aw = W - PAD.l - PAD.r;
      const ah = Math.max(40, H - padT - PAD.b);
      const s = Math.max(1e-6, Math.min(aw / e.x, ah / e.y));
      const ox = PAD.l;
      const oy = H - PAD.b;
      const X = (x: number) => ox + x * s;
      const Y = (y: number) => oy - y * s;

      // --- fundo ---
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, W, H);
      const grd = ctx.createLinearGradient(0, oy, 0, H);
      grd.addColorStop(0, '#111827');
      grd.addColorStop(1, C.bg);
      ctx.fillStyle = grd;
      ctx.fillRect(0, oy, W, H - oy);

      // --- grade cartesiana ---
      const major = niceStep(90 / s);
      const minor = major / 5;
      const maxXm = (W - ox) / s;
      const maxYm = oy / s;
      ctx.lineWidth = 1;
      ctx.strokeStyle = C.gridMinor;
      ctx.beginPath();
      for (let x = minor; x <= maxXm; x += minor) {
        ctx.moveTo(Math.round(X(x)) + 0.5, 0);
        ctx.lineTo(Math.round(X(x)) + 0.5, oy);
      }
      for (let y = minor; y <= maxYm; y += minor) {
        ctx.moveTo(ox, Math.round(Y(y)) + 0.5);
        ctx.lineTo(W, Math.round(Y(y)) + 0.5);
      }
      ctx.stroke();
      ctx.strokeStyle = C.gridMajor;
      ctx.beginPath();
      for (let x = major; x <= maxXm; x += major) {
        ctx.moveTo(Math.round(X(x)) + 0.5, 0);
        ctx.lineTo(Math.round(X(x)) + 0.5, oy);
      }
      for (let y = major; y <= maxYm; y += major) {
        ctx.moveTo(ox, Math.round(Y(y)) + 0.5);
        ctx.lineTo(W, Math.round(Y(y)) + 0.5);
      }
      ctx.stroke();

      // eixos
      ctx.strokeStyle = C.axis;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, oy + 0.5);
      ctx.lineTo(W, oy + 0.5);
      ctx.moveTo(ox + 0.5, 0);
      ctx.lineTo(ox + 0.5, H);
      ctx.stroke();

      // rótulos
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.fillStyle = C.label;
      const dec = major < 1 ? (major < 0.1 ? 2 : 1) : 0;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let x = 0; x <= maxXm; x += major) ctx.fillText(fmt(x, dec), X(x), oy + 8);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let y = major; y <= maxYm; y += major) ctx.fillText(fmt(y, dec), ox - 8, Y(y));
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('x (m)', W - 8, oy - 6);
      ctx.save();
      ctx.translate(14, PAD.t + 4);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('y (m)', 0, 0);
      ctx.restore();

      const path = (pts: TrajectoryPoint[], tEnd: number, end?: TrajectoryPoint) => {
        ctx.beginPath();
        ctx.moveTo(X(pts[0].x), Y(pts[0].y));
        for (let i = 1; i < pts.length && pts[i].t <= tEnd; i++) ctx.lineTo(X(pts[i].x), Y(pts[i].y));
        if (end) ctx.lineTo(X(end.x), Y(end.y));
      };

      // --- previsão (linha tracejada ao vivo) ---
      if (view.preview) {
        ctx.save();
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = 'rgba(229,231,235,0.28)';
        ctx.lineWidth = 1.5;
        path(preview.points, Infinity);
        ctx.stroke();
        ctx.restore();
      }

      // --- trajetórias ---
      const ordered = [...shots].sort((a, b) => (a.id === selectedId ? 1 : 0) - (b.id === selectedId ? 1 : 0));
      for (const shot of ordered) {
        const sel = shot.id === selectedId;
        const res = shot.result;
        const cur = sampleAt(res.points, shot.t);
        ctx.save();
        ctx.globalAlpha = sel ? 1 : 0.5;
        ctx.strokeStyle = shot.color;
        ctx.lineWidth = sel ? 2.5 : 1.6;
        ctx.lineJoin = 'round';
        if (sel) {
          ctx.shadowColor = shot.color;
          ctx.shadowBlur = 8;
        }
        path(res.points, shot.t, cur);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // marcas de tempo a cada 0,5 s (maiores a cada 1 s)
        if (view.timeMarks) {
          ctx.fillStyle = shot.color;
          for (let k = 1; k * 0.5 <= shot.t; k++) {
            const q = sampleAt(res.points, k * 0.5);
            ctx.beginPath();
            ctx.arc(X(q.x), Y(q.y), k % 2 === 0 ? 3 : 1.8, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        const landed = shot.t >= res.summary.flightTime;
        if (sel) {
          // ápice
          if (shot.t >= res.summary.apexTime && res.summary.maxHeight > 0) {
            const ax = X(res.summary.apexX);
            const ay = Y(res.summary.maxHeight);
            ctx.save();
            ctx.setLineDash([3, 4]);
            ctx.strokeStyle = 'rgba(245,158,11,0.6)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(ax, oy);
            ctx.stroke();
            ctx.restore();
            ctx.fillStyle = C.amber;
            ctx.beginPath();
            ctx.moveTo(ax, ay - 5);
            ctx.lineTo(ax + 5, ay);
            ctx.lineTo(ax, ay + 5);
            ctx.lineTo(ax - 5, ay);
            ctx.closePath();
            ctx.fill();
            pill(ctx, `H = ${fmt(res.summary.maxHeight)} m`, ax, ay - 20, C.amber);
          }
          if (landed) {
            const lx = X(res.summary.range);
            ctx.strokeStyle = shot.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(lx - 6, oy - 6);
            ctx.lineTo(lx + 6, oy + 6);
            ctx.moveTo(lx + 6, oy - 6);
            ctx.lineTo(lx - 6, oy + 6);
            ctx.stroke();
            pill(ctx, `R = ${fmt(res.summary.range)} m`, lx, oy - 22, shot.color);
          }
        }

        // projétil
        if (!landed || sel) {
          const px = X(cur.x);
          const py = Y(cur.y);
          const rad = Math.max(4, Math.min(10, res.params.diameter * s * 0.5));
          ctx.globalAlpha = 1;
          ctx.fillStyle = sel ? '#F9FAFB' : shot.color;
          ctx.shadowColor = shot.color;
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.arc(px, py, rad, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;

          if (sel && !landed && (view.velocity || view.components)) {
            const k = 80 / Math.max(res.params.v0, 1); // px por m/s
            if (view.components) {
              arrow(ctx, px, py, px + cur.vx * k, py, C.amber, 1.5, true);
              arrow(ctx, px, py, px, py - cur.vy * k, C.amber, 1.5, true);
              ctx.font = '500 11px "JetBrains Mono", monospace';
              ctx.fillStyle = C.amber;
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              ctx.fillText('vx', px + cur.vx * k + 6, py);
              ctx.fillText('vy', px + 6, py - cur.vy * k);
            }
            if (view.velocity) {
              arrow(ctx, px, py, px + cur.vx * k, py - cur.vy * k, C.cyan, 2.5);
              ctx.font = '600 11px "JetBrains Mono", monospace';
              ctx.fillStyle = C.cyan;
              ctx.fillText('v', px + cur.vx * k + 6, py - cur.vy * k - 6);
            }
          }
        }
        ctx.restore();
      }

      // --- canhão ---
      const th = params.angleDeg * DEG;
      ctx.save();
      ctx.translate(ox, oy);
      ctx.strokeStyle = 'rgba(245,158,11,0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, 44, -th, 0);
      ctx.stroke();
      ctx.rotate(-th);
      ctx.fillStyle = '#1F2937';
      ctx.strokeStyle = C.cyan;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-4, -6, 34, 12, 4);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#111827';
      ctx.strokeStyle = '#374151';
      ctx.beginPath();
      ctx.arc(ox, oy, 11, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.fillStyle = C.amber;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const lab = Math.min(th, 80 * DEG) / 2;
      ctx.fillText(`θ ${fmt(params.angleDeg, 0)}°`, ox + 52 * Math.cos(lab), oy - 52 * Math.sin(lab));

      // --- leitura do cursor ---
      const m = mouse.current;
      if (m && m.x > ox && m.y < oy) {
        const wx = (m.x - ox) / s;
        const wy = (oy - m.y) / s;
        ctx.save();
        ctx.strokeStyle = 'rgba(148,163,184,0.35)';
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(m.x, 0);
        ctx.lineTo(m.x, oy);
        ctx.moveTo(ox, m.y);
        ctx.lineTo(W, m.y);
        ctx.stroke();
        ctx.restore();

        const sel = shots.find((q) => q.id === selectedId);
        let snapped = false;
        if (sel) {
          let best: TrajectoryPoint | null = null;
          let bd = 18 * 18;
          for (const q of sel.result.points) {
            if (q.t > sel.t) break;
            const d = (X(q.x) - m.x) ** 2 + (Y(q.y) - m.y) ** 2;
            if (d < bd) {
              bd = d;
              best = q;
            }
          }
          if (best) {
            snapped = true;
            const bx = X(best.x);
            const by = Y(best.y);
            ctx.strokeStyle = sel.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(bx, by, 6, 0, Math.PI * 2);
            ctx.stroke();
            const lines = [
              `t  = ${fmt(best.t)} s`,
              `x  = ${fmt(best.x)} m`,
              `y  = ${fmt(best.y)} m`,
              `|v| = ${fmt(Math.hypot(best.vx, best.vy))} m/s`,
            ];
            ctx.font = '11px "JetBrains Mono", monospace';
            const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 20;
            const hgt = lines.length * 16 + 12;
            let tx2 = bx + 14;
            let ty2 = by - hgt - 8;
            if (tx2 + w > W - 8) tx2 = bx - w - 14;
            if (ty2 < 8) ty2 = by + 14;
            ctx.fillStyle = 'rgba(17,24,39,0.95)';
            ctx.strokeStyle = '#1F2937';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(tx2, ty2, w, hgt, 8);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = C.text;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            lines.forEach((l, i) => ctx.fillText(l, tx2 + 10, ty2 + 8 + i * 16));
          }
        }
        if (!snapped) {
          pill(ctx, `(${fmt(wx, 1)} ; ${fmt(wy, 1)}) m`, m.x + 10, m.y - 14, '#94A3B8', 'left');
        }
      }
    };
    raf = requestAnimationFrame(draw);

    const onMove = (ev: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.current = { x: ev.clientX - r.left, y: ev.clientY - r.top };
    };
    const onLeave = () => (mouse.current = null);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="block cursor-crosshair touch-none"
        role="img"
        aria-label="Área de simulação com grade cartesiana, trajetórias e vetores de velocidade"
      />
    </div>
  );
}
