import { useState } from 'react';
import ModuleShell from '../../shell/ModuleShell';
import Scene from '../../core/Scene';
import TimeChart from '../../core/TimeChart';
import { useStepper } from '../../core/stepper';
import { COLORS, arrow, clear, fitView, pill } from '../../core/canvas';
import { fmt } from '../../core/format';
import { buildModuleExport, downloadJson, stamp } from '../../core/export';
import { Chip, ExportButton, Note, Playback, Section, Slider, VerifyTable } from '../../ui/controls';
import { LEVEL, P_ATM, buoyancy, equilibrium, mass, pressureAt, stepBlock, submergedDepth } from './physics';
import { param } from '../../core/params';

const TANK_H = 1.6;
const TANK_W = 1.6;

const FLUIDS = [
  { name: 'Água', rho: 1000, color: 'rgba(56,189,248,0.22)' },
  { name: 'Óleo', rho: 900, color: 'rgba(250,204,21,0.2)' },
  { name: 'Álcool', rho: 789, color: 'rgba(203,213,225,0.16)' },
  { name: 'Água do mar', rho: 1025, color: 'rgba(45,212,191,0.22)' },
  { name: 'Mel', rho: 1420, color: 'rgba(245,158,11,0.28)' },
  { name: 'Mercúrio', rho: 13600, color: 'rgba(148,163,184,0.35)' },
];

const MATERIALS = [
  { name: 'Isopor', rho: 30 },
  { name: 'Madeira', rho: 600 },
  { name: 'Gelo', rho: 917 },
  { name: 'Alumínio', rho: 2700 },
  { name: 'Ferro', rho: 7870 },
  { name: 'Ouro', rho: 19300 },
];

export default function EmpuxoModule() {
  const [fluid, setFluid] = useState(() => param('fluid', 0));
  const [rhoC, setRhoC] = useState(() => param('rhoC', 600));
  const [a, setA] = useState(() => param('a', 0.3));
  const [g, setG] = useState(() => param('g', 9.81));
  const [depth, setDepth] = useState(() => param('depth', 0.6));
  const F = FLUIDS[fluid];
  const p = { a, rhoC, rhoF: F.rho, g };
  const m = mass(p);
  const eq = equilibrium(p);

  const sim = useStepper({
    create: () => ({ y: LEVEL + 0.15, v: 0 }),
    step: (s, h) => stepBlock(p, s.y, s.v, h),
    sample: (s) => ({ y: s.y, v: s.v, E: buoyancy(p, s.y), P: m * g, frac: submergedDepth(p, s.y) / a }),
    dt: 1 / 1000,
    resetKey: [fluid, rhoC, a, g],
    autoplay: false,
  });

  const st = sim.state;
  const E = buoyancy(p, st.y);
  const P = m * g;
  const frac = submergedDepth(p, st.y) / a;
  const N = st.y <= 1e-9 ? Math.max(0, P - E) : 0;
  const atRest = sim.t > 0.5 && Math.abs(st.v) < 2e-3 && Math.abs(E + N - P) < 2e-3 * P;

  const draw = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    clear(ctx, W, H);
    const v = fitView(W, H, { x0: -0.3, x1: TANK_W + 0.9, y0: -0.12, y1: TANK_H + 0.25 }, { l: 50, r: 30, t: 110, b: 30 });
    // fluido
    ctx.fillStyle = F.color;
    ctx.fillRect(v.X(0), v.Y(LEVEL), TANK_W * v.s, LEVEL * v.s);
    ctx.strokeStyle = 'rgba(56,189,248,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(v.X(0), v.Y(LEVEL));
    ctx.lineTo(v.X(TANK_W), v.Y(LEVEL));
    ctx.stroke();
    // recipiente
    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(v.X(0), v.Y(TANK_H));
    ctx.lineTo(v.X(0), v.Y(0));
    ctx.lineTo(v.X(TANK_W), v.Y(0));
    ctx.lineTo(v.X(TANK_W), v.Y(TANK_H));
    ctx.stroke();
    // escala de profundidade
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = COLORS.label;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let d = 0; d <= LEVEL + 1e-9; d += 0.2) {
      ctx.fillRect(v.X(0) - 6, v.Y(LEVEL - d), 6, 1);
      ctx.fillText(`${fmt(d, 1)}`, v.X(0) - 9, v.Y(LEVEL - d));
    }
    ctx.textAlign = 'center';
    ctx.fillText('prof. (m)', v.X(0) - 22, v.Y(LEVEL) - 16);

    // bloco
    const bx = TANK_W / 2 - a / 2;
    ctx.fillStyle = '#334155';
    ctx.strokeStyle = COLORS.cyan;
    ctx.lineWidth = 2;
    ctx.fillRect(v.X(bx), v.Y(st.y + a), a * v.s, a * v.s);
    ctx.strokeRect(v.X(bx), v.Y(st.y + a), a * v.s, a * v.s);
    // parte submersa
    const ds = submergedDepth(p, st.y);
    if (ds > 0) {
      ctx.fillStyle = 'rgba(56,189,248,0.25)';
      ctx.fillRect(v.X(bx), v.Y(st.y + ds), a * v.s, ds * v.s);
    }
    ctx.fillStyle = COLORS.text;
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (a * v.s > 50) ctx.fillText(`${fmt(m, m < 10 ? 2 : 0)} kg`, v.X(TANK_W / 2), v.Y(st.y + a / 2));

    // forças
    const cx = v.X(TANK_W / 2);
    const cy = v.Y(st.y + a / 2);
    const k = 110 / Math.max(P, E, 1);
    arrow(ctx, cx - 14, cy, cx - 14, cy + P * k, COLORS.rose, 2.5);
    ctx.fillStyle = COLORS.rose;
    ctx.textAlign = 'right';
    ctx.fillText(`P ${fmt(P, 1)} N`, cx - 22, cy + P * k);
    if (E > 1e-6) {
      arrow(ctx, cx + 14, cy, cx + 14, cy - E * k, COLORS.cyan, 2.5);
      ctx.fillStyle = COLORS.cyan;
      ctx.textAlign = 'left';
      ctx.fillText(`E ${fmt(E, 1)} N`, cx + 22, cy - E * k);
    }
    if (N > 1e-6) {
      arrow(ctx, cx + 40, v.Y(0), cx + 40, v.Y(0) - N * k, COLORS.green, 2.5);
      ctx.fillStyle = COLORS.green;
      ctx.textAlign = 'left';
      ctx.fillText(`N ${fmt(N, 1)} N`, cx + 48, v.Y(0) - N * k);
    }
    // linha de equilíbrio prevista
    if (eq.floats) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(52,211,153,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(v.X(bx) - 12, v.Y(eq.y));
      ctx.lineTo(v.X(bx + a) + 12, v.Y(eq.y));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // sonda de pressão (Stevin)
    const probeX = TANK_W + 0.45;
    const py = v.Y(LEVEL - depth);
    ctx.strokeStyle = COLORS.amber;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(v.X(TANK_W * 0.9), py);
    ctx.lineTo(v.X(probeX) - 50, py);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.amber;
    ctx.beginPath();
    ctx.arc(v.X(TANK_W * 0.9), py, 5, 0, Math.PI * 2);
    ctx.fill();
    pill(ctx, `${fmt(pressureAt(F.rho, g, depth) / 1000, 2)} kPa`, v.X(probeX), py, COLORS.amber);
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = COLORS.label;
    ctx.textAlign = 'center';
    ctx.fillText(`h = ${fmt(depth, 2)} m`, v.X(probeX), py + 20);

    if (atRest) pill(ctx, eq.floats ? `flutua com ${fmt(frac * 100, 1)}% submerso` : 'afundou: peso maior que o empuxo máximo', W - 16, H - 20, eq.floats ? COLORS.green : COLORS.rose, 'right');
  };

  const exportar = () =>
    downloadJson(
      `empuxo_${stamp()}.json`,
      buildModuleExport({
        modulo: 'empuxo',
        titulo: 'Hidrostática e Empuxo',
        metodo: 'RK4 vertical com empuxo de Arquimedes e arrasto do fluido; contato com o fundo',
        unidades: { t: 's', y: 'm (base do cubo)', v: 'm/s', E: 'N', P: 'N', frac: 'fração submersa' },
        parametros: { fluido: F.name, densidadeFluido: F.rho, densidadeCorpo: rhoC, aresta: a, g, profundidadeSonda: depth },
        resultados: { massa: m, peso: P, empuxo: E, pesoAparente: P - E, fracaoSubmersa: frac, pressaoSonda: pressureAt(F.rho, g, depth) },
        verificacao: atRest && eq.floats ? [{ grandeza: 'V_sub/V = ρc/ρf', teorico: eq.fraction, simulado: frac }] : [],
        serie: sim.history,
      }),
    );

  return (
    <ModuleShell
      title="Hidrostática e Empuxo"
      tema="Arquimedes e Stevin"
      status={
        sim.playing ? { text: atRest ? 'Em equilíbrio' : 'Em movimento', tone: atRest ? 'done' : 'run' } : { text: sim.t > 0 ? 'Pausado' : 'Pronto para soltar', tone: sim.t > 0 ? 'pause' : 'idle' }
      }
      keys={{ toggle: sim.toggle, step: sim.stepFrame, reset: sim.reset }}
      stats={[
        { label: 'Empuxo', value: fmt(E, 1), unit: 'N', accent: true },
        { label: 'Peso', value: fmt(P, 1), unit: 'N' },
        { label: 'Peso aparente', value: fmt(P - E, 1), unit: 'N' },
        { label: 'Submerso', value: fmt(frac * 100, 1), unit: '%' },
      ]}
      scene={<Scene draw={draw} label="Cubo em recipiente com fluido, forças peso, empuxo e normal, e sonda de pressão" />}
      charts={
        <>
          <TimeChart title="Forças" unit="N" data={sim.history} series={[{ key: 'E', label: 'Empuxo', color: COLORS.cyan }, { key: 'P', label: 'Peso', color: COLORS.rose }]} />
          <TimeChart title="Altura da base" unit="m" data={sim.history} series={[{ key: 'y', label: 'y', color: COLORS.violet }]} />
          <TimeChart title="Fração submersa" unit="—" data={sim.history} series={[{ key: 'frac', label: 'f', color: COLORS.green }]} />
        </>
      }
      panel={
        <>
          <Playback playing={sim.playing} onToggle={sim.toggle} onStep={sim.stepFrame} onReset={sim.reset} speed={sim.speed} setSpeed={sim.setSpeed} startLabel="Soltar o bloco" />
          <Section title="Fluido">
            <div className="flex flex-wrap gap-1.5">
              {FLUIDS.map((f, i) => (
                <Chip key={f.name} active={fluid === i} onClick={() => setFluid(i)} title={`${f.rho} kg/m³`}>
                  {f.name}
                </Chip>
              ))}
            </div>
            <Note>ρ do fluido = {fmt(F.rho, 0)} kg/m³</Note>
          </Section>
          <Section title="Bloco">
            <Slider label="Densidade do bloco" symbol="ρc" value={rhoC} min={20} max={20000} step={10} unit="kg/m³" digits={0} onChange={setRhoC} />
            <div className="flex flex-wrap gap-1.5">
              {MATERIALS.map((mt) => (
                <Chip key={mt.name} active={rhoC === mt.rho} onClick={() => setRhoC(mt.rho)} title={`${mt.rho} kg/m³`}>
                  {mt.name}
                </Chip>
              ))}
            </div>
            <Slider label="Aresta do cubo" symbol="a" value={a} min={0.1} max={0.5} step={0.01} unit="m" digits={2} onChange={setA} />
            <Slider label="Gravidade" symbol="g" value={g} min={1} max={25} step={0.01} unit="m/s²" digits={2} onChange={setG} />
          </Section>
          <Section title="Sonda de pressão (Stevin)">
            <Slider label="Profundidade" symbol="h" value={depth} min={0} max={LEVEL} step={0.01} unit="m" digits={2} accent="#F59E0B" onChange={setDepth} />
            <Note>
              P = P₀ + ρ·g·h = {fmt(P_ATM / 1000, 3)} kPa + {fmt((F.rho * g * depth) / 1000, 3)} kPa = <span className="font-mono text-slate-200">{fmt(pressureAt(F.rho, g, depth) / 1000, 3)} kPa</span>
            </Note>
          </Section>
          <VerifyTable
            empty="Solte o bloco e espere ele parar."
            rows={
              atRest
                ? eq.floats
                  ? [
                      { formula: 'V_sub/V = ρc/ρf (flutuação)', theory: eq.fraction, sim: frac, digits: 4, tol: 2e-3 },
                      { formula: 'E = P no equilíbrio', theory: P, sim: E, tol: 2e-3 },
                    ]
                  : [{ formula: 'N = P − ρf·g·V (no fundo)', theory: P - F.rho * g * a ** 3, sim: N, tol: 1e-6 }]
                : []
            }
          />
          <Section title="Dados" right={<ExportButton onClick={exportar} />}>
            <Note>
              {eq.floats
                ? `Como ρc < ρf, o bloco flutua com ${fmt(eq.fraction * 100, 1)}% do volume submerso (linha verde tracejada).`
                : `Como ρc ≥ ρf, o empuxo máximo (${fmt(F.rho * g * a ** 3, 1)} N) não vence o peso e o bloco vai ao fundo.`}
            </Note>
          </Section>
        </>
      }
    />
  );
}
