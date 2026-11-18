import { useState } from 'react';
import ModuleShell from '../../shell/ModuleShell';
import Scene from '../../core/Scene';
import { COLORS, clear, fitView } from '../../core/canvas';
import { fmt } from '../../core/format';
import { buildModuleExport, downloadJson, stamp } from '../../core/export';
import { Chip, ExportButton, Note, Section, Slider, VerifyTable } from '../../ui/controls';
import { gauss, isMirror, magnification, signedFocal, traceImage, vergence, type Element } from './physics';
import { param, choice } from '../../core/params';

const ELEMENTS: { id: Element; label: string }[] = [
  { id: 'convergente', label: 'Lente convergente' },
  { id: 'divergente', label: 'Lente divergente' },
  { id: 'concavo', label: 'Espelho côncavo' },
  { id: 'convexo', label: 'Espelho convexo' },
];

type Pt = [number, number];

export default function LentesModule() {
  const [el, setEl] = useState<Element>(() => choice('el', 'convergente', ELEMENTS.map((e) => e.id)));
  const [fAbs, setF] = useState(() => param('fAbs', 10));
  const [p, setP] = useState(() => param('p', 25));
  const [h, setH] = useState(() => param('h', 5));

  const mirror = isMirror(el);
  const f = signedFocal(el, fAbs);
  const piG = gauss(f, p);
  const AG = Number.isFinite(piG) ? magnification(p, piG) : Infinity;
  const tr = traceImage(el, fAbs, p, h);
  const atInfinity = !Number.isFinite(piG) || Math.abs(piG) > 1e4;
  const real = !atInfinity && piG > 0;
  const Ameas = Number.isFinite(tr.y) && !atInfinity ? tr.y / h : null;

  const nature = atInfinity ? 'imprópria (no infinito)' : `${real ? 'real' : 'virtual'}, ${AG < 0 ? 'invertida' : 'direita'}, ${Math.abs(Math.abs(AG) - 1) < 1e-6 ? 'do mesmo tamanho' : Math.abs(AG) > 1 ? 'maior' : 'menor'}`;

  const draw = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    clear(ctx, W, H);
    const imgX = atInfinity ? 0 : tr.x;
    const span = Math.max(p, 2.3 * fAbs);
    const xL = -Math.max(span, imgX < 0 ? Math.min(-imgX, 4 * fAbs) : 0) - 4;
    const xR = mirror ? Math.max(Math.min(imgX, 3 * fAbs), 0.6 * fAbs) + 4 : Math.max(2.4 * fAbs, Math.min(imgX, 4 * fAbs)) + 4;
    const yM = Math.max(h, atInfinity ? 0 : Math.min(Math.abs(tr.y), 3 * h)) * 1.5;
    const v = fitView(W, H, { x0: xL, x1: xR, y0: -yM, y1: yM }, { l: 24, r: 24, t: 110, b: 30 });
    const P = (q: Pt) => [v.X(q[0]), v.Y(q[1])] as const;

    // eixo óptico
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, v.Y(0));
    ctx.lineTo(W, v.Y(0));
    ctx.stroke();
    // marcas F, C/A
    const mark = (x: number, label: string) => {
      ctx.fillStyle = COLORS.violet;
      ctx.beginPath();
      ctx.arc(v.X(x), v.Y(0), 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(label, v.X(x), v.Y(0) + 6);
    };
    if (mirror) {
      mark(-f, 'F');
      mark(-2 * f, 'C');
    } else {
      mark(-fAbs, f > 0 ? 'F' : "F'");
      mark(fAbs, f > 0 ? "F'" : 'F');
      mark(-2 * fAbs, 'A');
      mark(2 * fAbs, "A'");
    }
    // régua
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = COLORS.label;
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'right';
    ctx.fillText('cm', W - 10, H - 8);
    const st = fAbs >= 15 ? 10 : 5;
    ctx.textAlign = 'center';
    for (let x = Math.ceil(xL / st) * st; x <= xR; x += st) {
      ctx.fillRect(v.X(x), H - 26, 1, 5);
      ctx.fillText(fmt(x, 0), v.X(x), H - 8);
    }

    // elemento
    const top = yM * 0.92;
    ctx.strokeStyle = COLORS.cyan;
    ctx.lineWidth = 3;
    if (!mirror) {
      ctx.beginPath();
      ctx.moveTo(v.X(0), v.Y(top));
      ctx.lineTo(v.X(0), v.Y(-top));
      ctx.stroke();
      const head = (y: number, dir: 1 | -1) => {
        const out = f > 0 ? dir : -dir;
        ctx.beginPath();
        ctx.moveTo(v.X(0) - 9, v.Y(y) + out * 9);
        ctx.lineTo(v.X(0), v.Y(y));
        ctx.lineTo(v.X(0) + 9, v.Y(y) + out * 9);
        ctx.stroke();
      };
      head(top, 1);
      head(-top, -1);
      ctx.fillStyle = 'rgba(56,189,248,0.07)';
      ctx.beginPath();
      ctx.ellipse(v.X(0), v.Y(0), 10, top * v.s, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const bulge = (f > 0 ? 1 : -1) * 0.12 * top;
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const y = -top + (2 * top * i) / 40;
        const x = bulge * (y / top) ** 2;
        i ? ctx.lineTo(v.X(x), v.Y(y)) : ctx.moveTo(v.X(x), v.Y(y));
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(56,189,248,0.35)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 16; i++) {
        const y = -top + (2 * top * i) / 16;
        const x = bulge * (y / top) ** 2;
        ctx.beginPath();
        ctx.moveTo(v.X(x), v.Y(y));
        ctx.lineTo(v.X(x) + 8, v.Y(y) + 8);
        ctx.stroke();
      }
    }

    // raios notáveis
    const O: Pt = [-p, h];
    const img: Pt | null = atInfinity ? null : [tr.x, tr.y];
    const far = (from: Pt, d: Pt): Pt => {
      const L = (xR - xL) * 3;
      const n = Math.hypot(d[0], d[1]);
      return [from[0] + (d[0] / n) * L, from[1] + (d[1] / n) * L];
    };
    const ray = (hit: Pt, d: Pt, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(...P(O));
      ctx.lineTo(...P(hit));
      ctx.lineTo(...P(far(hit, d)));
      ctx.stroke();
      if (img && !real) {
        ctx.setLineDash([5, 5]);
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(...P(hit));
        ctx.lineTo(...P(img));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
    };
    ray([0, h], tr.rays.d1, COLORS.amber);
    ray([0, 0], tr.rays.d2, COLORS.cyan);
    if (Math.abs(p - f) > 1e-9) {
      const y3 = (-h * f) / (p - f);
      ray([0, y3], [mirror ? -1 : 1, 0], COLORS.green);
    }

    // objeto e imagem
    const arrowUp = (x: number, y: number, color: string, dashed: boolean, label: string) => {
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 3;
      if (dashed) ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(v.X(x), v.Y(0));
      ctx.lineTo(v.X(x), v.Y(y));
      ctx.stroke();
      ctx.setLineDash([]);
      const dir = y >= 0 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(v.X(x), v.Y(y));
      ctx.lineTo(v.X(x) - 7, v.Y(y) + dir * 12);
      ctx.lineTo(v.X(x) + 7, v.Y(y) + dir * 12);
      ctx.closePath();
      ctx.fill();
      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = y >= 0 ? 'bottom' : 'top';
      ctx.fillText(label, v.X(x), v.Y(y) - dir * 6);
    };
    arrowUp(-p, h, COLORS.text, false, 'objeto');
    if (img && Math.abs(img[1]) < yM * 3) arrowUp(img[0], img[1], COLORS.rose, !real, real ? 'imagem real' : 'imagem virtual');
    ctx.font = '600 12px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = atInfinity ? COLORS.amber : COLORS.muted;
    ctx.fillText(atInfinity ? 'Objeto no foco: os raios saem paralelos e a imagem vai para o infinito.' : `Imagem ${nature}`, 16, v.Y(-yM) + 18 > H - 40 ? H - 40 : v.Y(-yM) + 18);
  };

  const exportar = () =>
    downloadJson(
      `lentes_${stamp()}.json`,
      buildModuleExport({
        modulo: 'lentes',
        titulo: 'Lentes e Espelhos',
        metodo: 'Traçado dos raios notáveis e interseção das retas emergentes; comparado com a equação de Gauss',
        unidades: { distancias: 'cm', vergencia: 'di' },
        parametros: { elemento: el, focal: f, p, alturaObjeto: h },
        resultados: { pLinhaGauss: atInfinity ? null : piG, pLinhaRaios: atInfinity ? null : tr.pi, aumento: atInfinity ? null : AG, alturaImagem: atInfinity ? null : tr.y, natureza: nature, vergencia: vergence(f) },
        verificacao: atInfinity ? [] : [{ grandeza: "p' (raios) = fp/(p − f)", teorico: piG, simulado: tr.pi }],
        serie: [],
      }),
    );

  return (
    <ModuleShell
      title="Lentes e Espelhos"
      tema="Formação de imagens, equação de Gauss, vergência"
      status={{ text: atInfinity ? 'Imagem imprópria' : real ? 'Imagem real' : 'Imagem virtual', tone: atInfinity ? 'pause' : real ? 'run' : 'done' }}
      stats={[
        { label: "Distância da imagem p'", value: atInfinity ? '∞' : fmt(piG, 2), unit: 'cm', accent: true },
        { label: 'Aumento A', value: atInfinity ? '∞' : fmt(AG, 3), unit: '×' },
        { label: 'Altura da imagem', value: atInfinity ? '∞' : fmt(AG * h, 2), unit: 'cm' },
        { label: 'Vergência', value: fmt(vergence(f), 2), unit: 'di' },
      ]}
      scene={<Scene draw={draw} label="Traçado de raios notáveis de um objeto diante de uma lente ou espelho, com a imagem formada" />}
      panel={
        <>
          <Section title="Elemento óptico">
            <div className="flex flex-wrap gap-1.5">
              {ELEMENTS.map((e) => (
                <Chip key={e.id} active={el === e.id} onClick={() => setEl(e.id)}>
                  {e.label}
                </Chip>
              ))}
            </div>
            <Slider label="Distância focal" symbol="|f|" value={fAbs} min={4} max={30} step={0.5} unit="cm" digits={1} accent="#A78BFA" onChange={setF} />
          </Section>
          <Section title="Objeto">
            <Slider label="Distância ao elemento" symbol="p" value={p} min={2} max={80} step={0.5} unit="cm" digits={1} onChange={setP} />
            <Slider label="Altura" symbol="o" value={h} min={1} max={10} step={0.5} unit="cm" digits={1} onChange={setH} />
            <div className="flex flex-wrap gap-1.5">
              <Chip active={Math.abs(p - 2 * fAbs) < 1e-9} onClick={() => setP(2 * fAbs)}>p = 2f</Chip>
              <Chip active={Math.abs(p - 1.5 * fAbs) < 1e-9} onClick={() => setP(1.5 * fAbs)}>entre f e 2f</Chip>
              <Chip active={Math.abs(p - 0.5 * fAbs) < 1e-9} onClick={() => setP(0.5 * fAbs)}>antes de f</Chip>
            </div>
          </Section>
          <VerifyTable
            rows={[
              { formula: "1/f = 1/p + 1/p'  (p' pelos raios)", theory: atInfinity ? null : piG, sim: atInfinity ? null : tr.pi, digits: 4, tol: 1e-9, note: 'Objeto no foco: imagem no infinito.' },
              { formula: "A = −p'/p = i/o  (i pelos raios)", theory: atInfinity ? null : AG, sim: Ameas, digits: 4, tol: 1e-9, note: 'Objeto no foco: imagem no infinito.' },
            ]}
          />
          <Section title="Dados" right={<ExportButton onClick={exportar} />}>
            <Note>
              Convenção de Gauss: f &gt; 0 para lente convergente e espelho côncavo; p&apos; &gt; 0 indica imagem real. Raios: <span className="text-amber">paralelo → foco</span>, <span className="text-cyan">pelo centro/vértice</span>,{' '}
              <span className="text-emerald-400">pelo foco → paralelo</span>. Linhas tracejadas são prolongamentos (imagem virtual).
            </Note>
          </Section>
        </>
      }
    />
  );
}
