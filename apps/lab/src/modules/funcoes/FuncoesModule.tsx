import { useMemo, useState } from 'react';
import ModuleShell from '../../shell/ModuleShell';
import Scene from '../../core/Scene';
import { useStepper } from '../../core/stepper';
import { COLORS, clear, drawGrid, fitView, pill } from '../../core/canvas';
import { fmt } from '../../core/format';
import { buildModuleExport, downloadJson, stamp } from '../../core/export';
import { Chip, ExportButton, Note, Playback, Section, Slider, Toggle, VerifyTable, type VerifyRow } from '../../ui/controls';
import { hashParams, params } from '../../core/params';
import { type Coefs, type Kind, bhaskara, bisect, derivative, evaluate, numericRoots, vertex } from './physics';

const XR = 10;
const BOX = { x0: -XR, x1: XR, y0: -8, y1: 8 };
const DEFAULTS: Record<Kind, Coefs> = { afim: { a: 0.5, b: -2, c: 0 }, quadratica: { a: 0.5, b: -1, c: -4 }, exponencial: { a: 2, b: 0, c: 0.5 } };

export default function FuncoesModule() {
  // #funcoes?kind=exponencial&a=0.5&c=4 abre a função já montada
  const [kind, setKind] = useState<Kind>(() => {
    const k = hashParams().get('kind');
    return k === 'afim' || k === 'quadratica' || k === 'exponencial' ? k : 'quadratica';
  });
  const [coefsBy, setCoefsBy] = useState(() => ({ ...DEFAULTS, [kind]: params(DEFAULTS[kind]) }));
  const [tangent, setTangent] = useState(true);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const p = coefsBy[kind];
  const f = (x: number) => evaluate(kind, p, x);

  const sim = useStepper<{ x: number }>({
    create: () => ({ x: -XR }),
    step: (_s, h, t) => ({ x: -XR + t + h }),
    sample: (s) => ({ x: s.x, y: f(s.x) }),
    tEnd: 2 * XR,
    dt: 1 / 120,
    sampleEvery: 0.05,
    timeScale: 2.5,
    resetKey: [kind, p.a, p.b, p.c],
  });
  const xp = sim.state.x;

  const set = (k: keyof Coefs, v: number) => setCoefsBy((x) => ({ ...x, [kind]: { ...x[kind], [k]: v } }));

  // pontos notáveis (fórmula) e as mesmas grandezas obtidas numericamente
  const bh = kind === 'quadratica' ? bhaskara(p) : null;
  const vx = kind === 'quadratica' ? vertex(p) : null;
  const doubleRoot = kind === 'quadratica' && bh !== null && bh.delta === 0;
  const numRoots = useMemo(
    () => (kind === 'exponencial' || p.a === 0 || doubleRoot ? [] : numericRoots((x) => evaluate(kind, p, x), -1e3, 1e3, 200000)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, p.a, p.b, p.c],
  );
  const vxNum = useMemo(
    () => (kind === 'quadratica' ? bisect((x) => (evaluate(kind, p, x + 1) - evaluate(kind, p, x - 1)) / 2, -1e3, 1e3) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, p.a, p.b, p.c],
  );
  const yInt = f(0);

  const draw = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    clear(ctx, W, H);
    const v = fitView(W, H, BOX, { l: 40, r: 24, t: 112, b: 30 });
    drawGrid(ctx, v, W, H, { unit: '', axes: true, labels: true });
    // sinal: trechos positivos e negativos
    const N = 600;
    for (let i = 0; i < N; i++) {
      const xa = v.x0 + ((v.x1 - v.x0) * i) / N;
      const xb = v.x0 + ((v.x1 - v.x0) * (i + 1)) / N;
      const y = f((xa + xb) / 2);
      if (!Number.isFinite(y)) continue;
      ctx.fillStyle = y > 0 ? 'rgba(52,211,153,0.07)' : 'rgba(251,113,133,0.07)';
      const y0 = v.Y(0);
      const y1 = v.Y(Math.max(v.y0, Math.min(v.y1, y)));
      ctx.fillRect(v.X(xa), Math.min(y0, y1), v.X(xb) - v.X(xa) + 0.5, Math.abs(y1 - y0));
    }
    // curva
    ctx.strokeStyle = COLORS.cyan;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i <= 800; i++) {
      const x = v.x0 + ((v.x1 - v.x0) * i) / 800;
      const y = f(x);
      if (!Number.isFinite(y) || Math.abs(y) > 1e4) {
        pen = false;
        continue;
      }
      if (pen) ctx.lineTo(v.X(x), v.Y(y));
      else ctx.moveTo(v.X(x), v.Y(y));
      pen = true;
    }
    ctx.stroke();
    const dot = (x: number, y: number, c: string, label: string, dy = -16) => {
      if (x < v.x0 || x > v.x1 || y < v.y0 || y > v.y1) return;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(v.X(x), v.Y(y), 5, 0, Math.PI * 2);
      ctx.fill();
      pill(ctx, label, v.X(x), v.Y(y) + dy, c);
    };
    numRoots.forEach((r) => dot(r, 0, COLORS.rose, `raiz ${fmt(r, 3)}`, 18));
    if (doubleRoot && vx) dot(vx.xv, 0, COLORS.rose, `raiz dupla ${fmt(vx.xv, 3)}`, 18);
    if (vx && !doubleRoot) dot(vx.xv, vx.yv, COLORS.violet, `V (${fmt(vx.xv, 2)}; ${fmt(vx.yv, 2)})`, p.a > 0 ? 18 : -18);
    dot(0, yInt, COLORS.amber, `(0; ${fmt(yInt, 2)})`, -16);
    // ponto que percorre a curva e a reta tangente
    const yp = f(xp);
    if (Number.isFinite(yp)) {
      if (tangent) {
        const m = derivative(kind, p, xp);
        ctx.strokeStyle = 'rgba(250,204,21,0.8)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(v.X(xp - 3), v.Y(yp - 3 * m));
        ctx.lineTo(v.X(xp + 3), v.Y(yp + 3 * m));
        ctx.stroke();
        ctx.setLineDash([]);
      }
      dot(xp, yp, '#FACC15', `x = ${fmt(xp, 2)} · f = ${fmt(yp, 2)}${tangent ? ` · taxa ${fmt(derivative(kind, p, xp), 2)}` : ''}`, -18);
    }
    if (hover) {
      const [hx] = v.inv(hover.x, hover.y);
      const hy = f(hx);
      if (Number.isFinite(hy) && hy > v.y0 && hy < v.y1) {
        ctx.strokeStyle = 'rgba(229,231,235,0.35)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(v.X(hx), v.Y(0));
        ctx.lineTo(v.X(hx), v.Y(hy));
        ctx.lineTo(v.X(0), v.Y(hy));
        ctx.stroke();
        ctx.setLineDash([]);
        pill(ctx, `(${fmt(hx, 2)}; ${fmt(hy, 2)})`, v.X(hx) + 8, v.Y(hy) - 14, COLORS.text, 'left');
      }
    }
    ctx.font = '600 15px "JetBrains Mono", monospace';
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(formula(kind, p), 50, 136);
  };

  const rows: VerifyRow[] = [];
  if (kind === 'afim') {
    rows.push({ formula: 'Raiz x = −b/a', theory: p.a !== 0 ? -p.b / p.a : null, sim: numRoots[0] ?? null, digits: 6, tol: 1e-9, note: 'a = 0: função constante, sem raiz única.' });
    const h = sim.history;
    const k = h.length - 1;
    rows.push({ formula: 'Taxa de variação a = Δy/Δx (pontos percorridos)', theory: p.a, sim: k >= 2 ? (h[k].y - h[0].y) / (h[k].x - h[0].x) : null, digits: 6, tol: 1e-9, note: 'Toque ▶ para percorrer a reta.' });
  } else if (kind === 'quadratica' && bh && vx) {
    if (bh.delta > 0) {
      rows.push({ formula: 'x₁ = (−b − √Δ)/2a (Bhaskara × bissecção)', theory: bh.roots[0], sim: numRoots[0] ?? null, digits: 6, tol: 1e-9 });
      rows.push({ formula: 'x₂ = (−b + √Δ)/2a', theory: bh.roots[1], sim: numRoots[1] ?? null, digits: 6, tol: 1e-9 });
      rows.push({ formula: 'Soma x₁ + x₂ = −b/a (Girard)', theory: -p.b / p.a, sim: numRoots.length === 2 ? numRoots[0] + numRoots[1] : null, digits: 6, tol: 1e-9 });
      rows.push({ formula: 'Produto x₁·x₂ = c/a', theory: p.c / p.a, sim: numRoots.length === 2 ? numRoots[0] * numRoots[1] : null, digits: 6, tol: 1e-8 });
    } else rows.push({ formula: `Δ = ${fmt(bh.delta, 3)}: ${bh.delta === 0 ? 'uma raiz dupla (no vértice)' : 'sem raízes reais'}`, theory: null, sim: null, note: bh.delta === 0 ? 'A parábola só toca o eixo x.' : 'A parábola não cruza o eixo x.' });
    rows.push({ formula: `x do vértice = −b/2a (onde a taxa numérica zera: ${p.a > 0 ? 'mínimo' : 'máximo'})`, theory: vx.xv, sim: vxNum, digits: 6, tol: 1e-9 });
    rows.push({ formula: 'y do vértice = −Δ/4a', theory: vx.yv, sim: vxNum !== null ? f(vxNum) : null, digits: 6, tol: 1e-9 });
  } else if (kind === 'exponencial') {
    const target = 2 * p.c;
    rows.push({ formula: 'f(x + 1)/f(x) = a (razão constante)', theory: p.a, sim: f(xp + 1) / f(xp), digits: 6, tol: 1e-12 });
    rows.push({ formula: 'Duplicação: x = log₂/log a (bissecção em f(x) = 2c)', theory: Math.log(2) / Math.log(p.a), sim: p.a !== 1 ? bisect((x) => f(x) - target, -200, 200) : null, digits: 6, tol: 1e-9, note: 'a = 1: função constante.' });
  }

  const exportar = () =>
    downloadJson(
      `funcoes_${stamp()}.json`,
      buildModuleExport({
        modulo: 'funcoes',
        titulo: formula(kind, p),
        metodo: 'Fórmulas fechadas comparadas com raízes por varredura + bissecção e extremo por seção áurea',
        unidades: { x: 'adimensional', y: 'adimensional' },
        parametros: { tipo: kind, ...p },
        resultados: { raizesNumericas: numRoots.join("; ") || null, interceptoY: yInt, ...(vx ? { xv: vx.xv, yv: vx.yv, delta: bh!.delta } : {}) },
        verificacao: rows.filter((r) => r.theory !== null).map((r) => ({ grandeza: r.formula, teorico: r.theory!, simulado: r.sim ?? NaN })),
        serie: sim.history,
      }),
    );

  return (
    <ModuleShell
      title="Funções"
      tema="Afim, quadrática e exponencial: raízes, vértice, taxa de variação"
      status={sim.playing ? { text: 'Percorrendo a curva', tone: 'run' } : { text: formula(kind, p), tone: 'idle' }}
      keys={{ toggle: sim.toggle, step: sim.stepFrame, reset: sim.reset }}
      stats={
        kind === 'quadratica' && bh && vx
          ? [
              { label: 'Δ = b² − 4ac', value: fmt(bh.delta, 3), unit: '', accent: true },
              { label: 'Raízes', value: bh.roots.length ? bh.roots.map((r) => fmt(r, 2)).join(' · ') : 'não reais', unit: '' },
              { label: 'x do vértice', value: fmt(vx.xv, 3), unit: '' },
              { label: p.a > 0 ? 'Valor mínimo' : 'Valor máximo', value: fmt(vx.yv, 3), unit: '' },
            ]
          : kind === 'afim'
            ? [
                { label: 'Coeficiente angular', value: fmt(p.a, 2), unit: '', accent: true },
                { label: 'Coeficiente linear', value: fmt(p.b, 2), unit: '' },
                { label: 'Raiz', value: p.a !== 0 ? fmt(-p.b / p.a, 3) : '—', unit: '' },
                { label: 'Monotonia', value: p.a > 0 ? 'crescente' : p.a < 0 ? 'decrescente' : 'constante', unit: '' },
              ]
            : [
                { label: 'Base a', value: fmt(p.a, 2), unit: '', accent: true },
                { label: 'Valor inicial f(0)', value: fmt(p.c, 2), unit: '' },
                { label: 'Duplica a cada', value: p.a > 1 ? fmt(Math.log(2) / Math.log(p.a), 3) : '—', unit: 'x' },
                { label: 'Comportamento', value: p.a > 1 ? 'crescimento' : p.a < 1 ? 'decaimento' : 'constante', unit: '' },
              ]
      }
      scene={<Scene draw={draw} label="Plano cartesiano com o gráfico da função, raízes, vértice, intercepto e reta tangente" onPointer={setHover} />}
      panel={
        <>
          <Playback playing={sim.playing} finished={sim.finished} onToggle={sim.toggle} onStep={sim.stepFrame} onReset={sim.reset} speed={sim.speed} setSpeed={sim.setSpeed} startLabel="Percorrer" />
          <Section title="Tipo">
            <div className="flex flex-wrap gap-1.5">
              <Chip active={kind === 'afim'} onClick={() => setKind('afim')}>Afim (1º grau)</Chip>
              <Chip active={kind === 'quadratica'} onClick={() => setKind('quadratica')}>Quadrática (2º grau)</Chip>
              <Chip active={kind === 'exponencial'} onClick={() => setKind('exponencial')}>Exponencial</Chip>
            </div>
          </Section>
          <Section title="Coeficientes">
            {kind === 'exponencial' ? (
              <>
                <Slider label="Base" symbol="a" value={p.a} min={0.2} max={4} step={0.05} unit="" digits={2} accent={COLORS.cyan} hint="a > 1 cresce; 0 < a < 1 decai" onChange={(v) => set('a', v)} />
                <Slider label="Valor inicial" symbol="c" value={p.c} min={0.1} max={5} step={0.1} unit="" digits={1} accent={COLORS.amber} onChange={(v) => set('c', v)} />
              </>
            ) : (
              <>
                <Slider label={kind === 'afim' ? 'Coeficiente angular' : 'Coeficiente a'} symbol="a" value={p.a} min={-3} max={3} step={0.05} unit="" digits={2} accent={COLORS.cyan} hint={kind === 'quadratica' ? 'a > 0: concavidade para cima' : undefined} onChange={(v) => set('a', kind === 'quadratica' && v === 0 ? 0.05 : v)} />
                <Slider label={kind === 'afim' ? 'Coeficiente linear' : 'Coeficiente b'} symbol="b" value={p.b} min={-8} max={8} step={0.1} unit="" digits={1} accent={COLORS.violet} onChange={(v) => set('b', v)} />
                {kind === 'quadratica' && <Slider label="Coeficiente c" symbol="c" value={p.c} min={-8} max={8} step={0.1} unit="" digits={1} accent={COLORS.amber} hint="onde a parábola corta o eixo y" onChange={(v) => set('c', v)} />}
              </>
            )}
            <Toggle label="Reta tangente (taxa de variação)" checked={tangent} onChange={setTangent} color="#FACC15" />
          </Section>
          <VerifyTable empty="Ajuste os coeficientes." rows={rows} />
          <Section title="Dados" right={<ExportButton onClick={exportar} />}>
            <Note>
              As raízes e o vértice são calculados pela fórmula e, de forma independente, por métodos numéricos (varredura com bissecção; o vértice onde a taxa de variação numérica zera). Passe o mouse no gráfico para ler pontos. Verde: f(x) &gt; 0; vermelho: f(x) &lt; 0.
            </Note>
          </Section>
        </>
      }
    />
  );
}

function formula(k: Kind, p: Coefs) {
  const s = (v: number, t: string) => (v === 0 ? '' : `${v < 0 ? ' − ' : ' + '}${fmt(Math.abs(v), 2)}${t}`);
  if (k === 'afim') return `f(x) = ${fmt(p.a, 2)}x${s(p.b, '')}`;
  if (k === 'quadratica') return `f(x) = ${fmt(p.a, 2)}x²${s(p.b, 'x')}${s(p.c, '')}`;
  return `f(x) = ${fmt(p.c, 2)}·${fmt(p.a, 2)}ˣ`;
}
