import { useState } from 'react';
import ModuleShell from '../../shell/ModuleShell';
import Scene from '../../core/Scene';
import TimeChart from '../../core/TimeChart';
import { useStepper } from '../../core/stepper';
import { COLORS, arrow, clear, pill } from '../../core/canvas';
import { fmt } from '../../core/format';
import { buildModuleExport, downloadJson, stamp } from '../../core/export';
import { Chip, ExportButton, Note, Playback, Section, Slider, VerifyTable } from '../../ui/controls';
import { MATERIALS, enthalpy, equilibrium, initialEnthalpy, liquidFraction, stepHeat, temperature, timeConstant, type Body } from './physics';
import { param, choice } from '../../core/params';

const G = 15; // condutância térmica entre os corpos (W/K)

function tempRange(id: string): [number, number] {
  if (id === 'gelo') return [-40, 0];
  if (id === 'agua') return [0, 95];
  return [-20, 400];
}

/** Cor de temperatura: azul (frio) → vermelho (quente). */
function heatColor(T: number) {
  const u = Math.max(0, Math.min(1, (T + 30) / 230));
  const r = Math.round(56 + (251 - 56) * u);
  const g = Math.round(189 + (113 - 189) * u);
  const b = Math.round(248 + (133 - 248) * u);
  return `rgb(${r},${g},${b})`;
}

export default function CalorimetriaModule() {
  const [matA, setMatA] = useState(() => choice<string>('matA', 'agua', MATERIALS.map((m) => m.id)));
  const [mA, setMA] = useState(() => param('mA', 0.3));
  const [TA0, setTA0] = useState(() => param('TA0', 20));
  const [matB, setMatB] = useState(() => choice<string>('matB', 'ferro', MATERIALS.map((m) => m.id)));
  const [mB, setMB] = useState(() => param('mB', 0.5));
  const [TB0, setTB0] = useState(() => param('TB0', 200));

  const A: Body = { mat: MATERIALS.find((m) => m.id === matA)!, m: mA };
  const B: Body = { mat: MATERIALS.find((m) => m.id === matB)!, m: mB };
  const HA0 = initialEnthalpy(A, TA0);
  const HB0 = initialEnthalpy(B, TB0);
  const eq = equilibrium(A, B, HA0 + HB0);
  const tau = timeConstant(A, B, G);

  const sim = useStepper<{ HA: number; HB: number }>({
    create: () => ({ HA: HA0, HB: HB0 }),
    step: (s, h) => stepHeat(A, B, G, s.HA, s.HB, h),
    sample: (s) => ({
      TA: temperature(A, s.HA),
      TB: temperature(B, s.HB),
      Q: s.HA - HA0,
      fA: liquidFraction(A, s.HA) * 100,
      fB: liquidFraction(B, s.HB) * 100,
    }),
    until: (s, t) => t > 0 && Math.abs(temperature(A, s.HA) - temperature(B, s.HB)) < 1e-7,
    dt: tau / 1500,
    sampleEvery: tau / 60,
    timeScale: tau / 2.5,
    resetKey: [matA, mA, TA0, matB, mB, TB0],
  });

  const TA = temperature(A, sim.state.HA);
  const TB = temperature(B, sim.state.HB);
  const QA = sim.state.HA - HA0;
  const QB = sim.state.HB - HB0;
  const P = G * (TB - TA);
  const P0 = Math.abs(G * (temperature(B, HB0) - temperature(A, HA0))) || 1;
  const waterBodies = [A, B].filter((b) => b.mat.water).length;

  // fração líquida prevista no equilíbrio (quando há um único corpo de água/gelo)
  let fracTheory: number | null = null;
  let fracSim: number | null = null;
  if (waterBodies === 1) {
    const w = A.mat.water ? A : B;
    const other = A.mat.water ? B : A;
    const Hw = HA0 + HB0 - enthalpy(other, eq.T);
    fracTheory = liquidFraction(w, Hw);
    fracSim = liquidFraction(w, A.mat.water ? sim.state.HA : sim.state.HB);
  }

  const draw = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    clear(ctx, W, H);
    const top = 120;
    const bw = Math.min(W - 80, 620);
    const bh = Math.min(H - top - 40, 300);
    const x0 = (W - bw) / 2;
    const y0 = top + (H - top - 30 - bh) / 2;
    // calorímetro isolado
    ctx.fillStyle = '#131B2C';
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 10;
    ctx.setLineDash([2, 6]);
    ctx.strokeRect(x0, y0, bw, bh);
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    ctx.strokeRect(x0 + 8, y0 + 8, bw - 16, bh - 16);
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = COLORS.label;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('calorímetro ideal (sem perdas para o ambiente)', W / 2, y0 - 8);

    const half = (bw - 16) / 2;
    const body = (b: Body, Hcur: number, T: number, xl: number, label: string) => {
      const inner = { x: xl + 14, y: y0 + 22, w: half - 28, h: bh - 44 };
      const base = inner.y + inner.h;
      if (b.mat.water) {
        const f = liquidFraction(b, Hcur);
        const level = Math.min(1, 0.35 + b.m * 0.3) * inner.h;
        ctx.fillStyle = 'rgba(56,189,248,0.28)';
        ctx.fillRect(inner.x, base - level * Math.max(f, 0.12), inner.w, level * Math.max(f, 0.12));
        // cubos de gelo restantes
        const ice = 1 - f;
        const n = Math.round(ice * 9);
        const s = Math.min(34, inner.w / 4);
        for (let k = 0; k < n; k++) {
          const cx = inner.x + 10 + (k % 3) * (s + 8);
          const cy = base - level * Math.max(f, 0.12) - s * 0.6 - Math.floor(k / 3) * (s + 4);
          ctx.fillStyle = 'rgba(224,242,254,0.85)';
          ctx.strokeStyle = '#BAE6FD';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(cx, cy, s, s, 4);
          ctx.fill();
          ctx.stroke();
        }
      } else {
        const side = Math.min(inner.w * 0.75, 40 + Math.cbrt(b.m) * 60);
        const bx = inner.x + (inner.w - side) / 2;
        const g = ctx.createLinearGradient(bx, base - side, bx + side, base);
        g.addColorStop(0, b.mat.color);
        g.addColorStop(1, '#1E293B');
        ctx.fillStyle = g;
        ctx.fillRect(bx, base - side, side, side);
        ctx.strokeStyle = heatColor(T);
        ctx.lineWidth = 3;
        ctx.strokeRect(bx, base - side, side, side);
      }
      // termômetro
      const tx = xl + half - 22;
      const ty0 = y0 + 26;
      const ty1 = y0 + bh - 40;
      ctx.strokeStyle = '#64748B';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tx, ty0);
      ctx.lineTo(tx, ty1);
      ctx.stroke();
      const u = Math.max(0, Math.min(1, (T + 40) / 440));
      ctx.strokeStyle = heatColor(T);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(tx, ty1);
      ctx.lineTo(tx, ty1 - u * (ty1 - ty0));
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.fillStyle = heatColor(T);
      ctx.beginPath();
      ctx.arc(tx, ty1 + 6, 7, 0, Math.PI * 2);
      ctx.fill();
      pill(ctx, `${fmt(T, 2)} °C`, xl + half / 2, y0 + bh - 18, heatColor(T));
      ctx.font = '600 12px Inter, sans-serif';
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(label, xl + half / 2 - 10, y0 + 18);
    };
    body(A, sim.state.HA, TA, x0 + 8, `A · ${A.mat.name} ${fmt(mA * 1000, 0)} g`);
    body(B, sim.state.HB, TB, x0 + 8 + half, `B · ${B.mat.name} ${fmt(mB * 1000, 0)} g`);
    // parede condutora
    ctx.fillStyle = '#B45309';
    ctx.fillRect(x0 + 8 + half - 2, y0 + 8, 4, bh - 16);
    // fluxo de calor
    if (Math.abs(P) > 1e-6 * P0) {
      const w = 2 + 10 * Math.min(1, Math.abs(P) / P0);
      const dir = P > 0 ? -1 : 1; // P > 0: calor flui de B para A
      const cx = x0 + 8 + half;
      const cy = y0 + bh / 2;
      arrow(ctx, cx - dir * 50, cy, cx + dir * 50, cy, COLORS.rose, w);
      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.fillStyle = COLORS.rose;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${fmt(Math.abs(P), 1)} W`, cx, cy - w - 6);
    }
  };

  const exportar = () =>
    downloadJson(
      `calorimetria_${stamp()}.json`,
      buildModuleExport({
        modulo: 'calorimetria',
        titulo: 'Calorimetria',
        metodo: 'RK4 nas entalpias com condução dH/dt = G·ΔT (G = 15 W/K); curva da água com platô de fusão a 0 °C',
        unidades: { t: 's', TA: '°C', TB: '°C', Q: 'J (recebido por A)', fA: '% líquido', fB: '% líquido' },
        parametros: { materialA: A.mat.name, massaA: mA, TA0, materialB: B.mat.name, massaB: mB, TB0 },
        resultados: { Tequilibrio: eq.T, fusaoParcial: eq.partial ? 'sim' : 'não', calorTrocado: Math.abs(QA), Tfinal: TA },
        verificacao: sim.finished ? [{ grandeza: 'T de equilíbrio (K)', teorico: eq.T + 273.15, simulado: TA + 273.15 }] : [],
        serie: sim.history,
      }),
    );

  const bodyPanel = (title: string, mat: string, setMat: (s: string) => void, m: number, setM: (n: number) => void, T0: number, setT0: (n: number) => void, accent: string) => {
    const [lo, hi] = tempRange(mat);
    return (
      <Section title={title}>
        <div className="flex flex-wrap gap-1.5">
          {MATERIALS.map((mt) => (
            <Chip
              key={mt.id}
              active={mat === mt.id}
              onClick={() => {
                setMat(mt.id);
                const [a, b] = tempRange(mt.id);
                setT0(Math.min(b, Math.max(a, T0)));
              }}
              title={`c = ${mt.c} J/kg·K`}
            >
              {mt.name}
            </Chip>
          ))}
        </div>
        <Slider label="Massa" symbol="m" value={m} min={0.05} max={2} step={0.01} unit="kg" digits={2} accent={accent} onChange={setM} />
        <Slider label="Temperatura inicial" symbol="T₀" value={T0} min={lo} max={hi} step={1} unit="°C" digits={0} accent={accent} onChange={setT0} />
      </Section>
    );
  };

  return (
    <ModuleShell
      title="Calorimetria"
      tema="Calor sensível e latente, equilíbrio térmico"
      status={
        sim.playing
          ? { text: 'Trocando calor', tone: 'run' }
          : sim.finished
            ? { text: 'Equilíbrio térmico', tone: 'done' }
            : { text: sim.t > 0 ? 'Pausado' : 'Pronto', tone: sim.t > 0 ? 'pause' : 'idle' }
      }
      keys={{ toggle: sim.toggle, step: sim.stepFrame, reset: sim.reset }}
      stats={[
        { label: 'Temperatura A', value: fmt(TA, 2), unit: '°C' },
        { label: 'Temperatura B', value: fmt(TB, 2), unit: '°C' },
        { label: 'Calor trocado', value: fmt(Math.abs(QA) / 1000, 2), unit: 'kJ', accent: true },
        { label: 'Tempo', value: fmt(sim.t, 0), unit: 's' },
      ]}
      scene={<Scene draw={draw} label="Dois corpos num calorímetro isolado trocando calor através de uma parede condutora, com termômetros" />}
      charts={
        <>
          <TimeChart title="Temperaturas" unit="°C" data={sim.history} series={[{ key: 'TA', label: 'A', color: COLORS.cyan }, { key: 'TB', label: 'B', color: COLORS.amber }]} window={null} zero={false} />
          <TimeChart title="Calor recebido por A" unit="J" data={sim.history} series={[{ key: 'Q', label: 'Q_A', color: COLORS.rose }]} window={null} />
          {waterBodies > 0 ? (
            <TimeChart
              title="Água líquida"
              unit="%"
              data={sim.history}
              series={[...(A.mat.water ? [{ key: 'fA', label: 'A', color: COLORS.cyan }] : []), ...(B.mat.water ? [{ key: 'fB', label: 'B', color: COLORS.amber }] : [])]}
              window={null}
            />
          ) : (
            <></>
          )}
        </>
      }
      panel={
        <>
          <Playback playing={sim.playing} finished={sim.finished} onToggle={sim.toggle} onStep={sim.stepFrame} onReset={sim.reset} speed={sim.speed} setSpeed={sim.setSpeed} startLabel="Colocar em contato" />
          {bodyPanel('Corpo A', matA, setMatA, mA, setMA, TA0, setTA0, '#38BDF8')}
          {bodyPanel('Corpo B', matB, setMatB, mB, setMB, TB0, setTB0, '#F59E0B')}
          <VerifyTable
            empty="Coloque os corpos em contato e espere o equilíbrio."
            rows={[
              { formula: 'Σ Q = 0 → T de equilíbrio (em K)', theory: eq.T + 273.15, sim: sim.finished ? TA + 273.15 : null, digits: 3, tol: 1e-6, note: 'Aguardando o equilíbrio…' },
              { formula: 'Calor cedido = calor recebido (J)', theory: Math.abs(QB), sim: Math.abs(QA), digits: 2, tol: 1e-9 },
              ...(fracTheory !== null
                ? [{ formula: 'Fração de água líquida no equilíbrio', theory: fracTheory, sim: sim.finished ? fracSim : null, digits: 4, tol: 1e-6, note: 'Aguardando o equilíbrio…' }]
                : []),
            ]}
          />
          <Section title="Dados" right={<ExportButton onClick={exportar} />}>
            <Note>
              Previsão: equilíbrio em {fmt(eq.T, 2)} °C{eq.partial ? ', com gelo e água coexistindo (o calor disponível não derrete todo o gelo)' : ''}. Calor sensível Q = m·c·ΔT; calor latente de fusão do gelo L = 334 kJ/kg. A água (c = 4186 J/kg·K) é
              quem mais resiste a mudar de temperatura.
            </Note>
          </Section>
        </>
      }
    />
  );
}
