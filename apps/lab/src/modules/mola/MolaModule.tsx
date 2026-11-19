import { useState } from 'react';
import ModuleShell from '../../shell/ModuleShell';
import Scene from '../../core/Scene';
import TimeChart from '../../core/TimeChart';
import { measuredPeriod, useStepper } from '../../core/stepper';
import { COLORS, arrow, barGroup, clear, fitView, niceStep } from '../../core/canvas';
import { fmt } from '../../core/format';
import { buildModuleExport, downloadJson, stamp } from '../../core/export';
import { ExportButton, Note, Playback, Section, Slider, VerifyTable } from '../../ui/controls';
import { equilibriumStretch, periodDamped, periodUndamped, springEnergy, stepSpring } from './physics';
import { param } from '../../core/params';

const L0 = 0.5; // comprimento natural (m)
const BOX = 0.16; // altura do bloco (m)

export default function MolaModule() {
  const [k, setK] = useState(() => param('k', 40));
  const [m, setM] = useState(() => param('m', 1));
  const [b, setB] = useState(() => param('b', 0));
  const [g, setG] = useState(() => param('g', 9.81));
  const [A, setA] = useState(() => param('A', 0.15));
  const p = { k, m, b, g };
  const d = equilibriumStretch(p);

  const sim = useStepper({
    create: () => ({ x: A, v: 0 }),
    step: (s, h) => stepSpring(p, s.x, s.v, h),
    sample: (s) => {
      const e = springEnergy(p, s.x, s.v);
      return { x: s.x, v: s.v, K: e.K, Uel: e.Uel, Ug: e.Ug, E: e.E };
    },
    dt: 1 / 1000,
    sampleEvery: 1 / 120,
    resetKey: [k, m, g, A],
  });

  const T = periodUndamped(p);
  const Td = periodDamped(p);
  const Tm = measuredPeriod(sim.history, 'x');
  const e = springEnergy(p, sim.state.x, sim.state.v);
  const E0 = springEnergy(p, A, 0).E;

  const draw = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    clear(ctx, W, H);
    const yMin = -(L0 + d + Math.abs(A) + BOX + 0.15);
    const v = fitView(W, H, { x0: -0.9, x1: 0.9, y0: yMin, y1: 0.08 }, { l: 60, r: 30, t: 110, b: 24 });
    const cx = v.X(-0.2);
    // teto
    ctx.fillStyle = '#1F2937';
    ctx.fillRect(cx - 80, v.Y(0) - 10, 160, 10);
    // régua (cm) à esquerda
    const rx = v.X(-0.75);
    ctx.strokeStyle = COLORS.axis;
    ctx.fillStyle = COLORS.label;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.beginPath();
    ctx.moveTo(rx + 0.5, v.Y(0));
    ctx.lineTo(rx + 0.5, v.Y(yMin));
    const st = niceStep(50 / v.s);
    for (let y = 0; y >= yMin; y -= st / 5) {
      const major = Math.abs(Math.round(y / st) * st - y) < 1e-9;
      ctx.moveTo(rx, v.Y(y) + 0.5);
      ctx.lineTo(rx + (major ? 10 : 5), v.Y(y) + 0.5);
      if (major) ctx.fillText(`${fmt(-y * 100, 0)}`, rx - 4, v.Y(y));
    }
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillText('cm', rx, v.Y(yMin) + 12);

    // linhas de referência
    const yNat = -L0;
    const yEq = -(L0 + d);
    const yNow = -(L0 + d + sim.state.x);
    const ref = (y: number, label: string, color: string) => {
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rx + 12, v.Y(y));
      ctx.lineTo(v.X(0.85), v.Y(y));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(label, v.X(0.85), v.Y(y) - 3);
    };
    ref(yNat, 'comprimento natural', 'rgba(148,163,184,0.6)');
    ref(yEq, `equilíbrio (x = 0, alongamento ${fmt(d * 100, 1)} cm)`, 'rgba(52,211,153,0.7)');

    // mola em zigue-zague
    const top = v.Y(0);
    const bot = v.Y(yNow);
    const coils = 14;
    const wpx = 18;
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, top);
    const lead = 10;
    ctx.lineTo(cx, top + lead);
    const span = bot - top - 2 * lead;
    for (let i = 0; i < coils; i++) ctx.lineTo(cx + (i % 2 ? -wpx : wpx), top + lead + ((i + 0.5) / coils) * span);
    ctx.lineTo(cx, bot - lead);
    ctx.lineTo(cx, bot);
    ctx.stroke();

    // bloco
    const bw = 0.24 * v.s;
    const bh = BOX * v.s;
    ctx.fillStyle = '#1E293B';
    ctx.strokeStyle = COLORS.cyan;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(cx - bw / 2, bot, bw, bh, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (bw > 40) ctx.fillText(`${fmt(m, 2)} kg`, cx, bot + bh / 2);

    // forças
    const Fel = k * (d + sim.state.x);
    const P = m * g;
    const kf = 80 / Math.max(P, Math.abs(k * (d + Math.abs(A))), 1);
    arrow(ctx, cx + bw / 2 + 16, bot + bh / 2, cx + bw / 2 + 16, bot + bh / 2 - Fel * kf, COLORS.green, 2.5);
    arrow(ctx, cx + bw / 2 + 34, bot + bh / 2, cx + bw / 2 + 34, bot + bh / 2 + P * kf, COLORS.rose, 2.5);
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.green;
    ctx.fillText(`Fel ${fmt(Fel, 1)} N`, cx + bw / 2 + 44, bot + bh / 2 - Math.max(16, Fel * kf * 0.6));
    ctx.fillStyle = COLORS.rose;
    ctx.fillText(`P ${fmt(P, 1)} N`, cx + bw / 2 + 44, bot + bh / 2 + Math.max(16, P * kf * 0.6));

    // energias
    barGroup(
      ctx,
      W - 16 - (4 * 48 + 14),
      106,
      Math.max(60, Math.min(140, H - 240)),
      [
        { label: 'Ec', value: e.K, color: COLORS.green },
        { label: 'Eel', value: e.Uel, color: COLORS.cyan },
        { label: 'Epg', value: e.Ug, color: COLORS.violet },
        { label: 'Total', value: e.E, color: COLORS.amber },
      ],
      Math.max(e.Uel, Math.abs(e.Ug), E0, 1e-6) * 1.05,
      'J (Epg com referência no equilíbrio)',
    );
  };

  const exportar = () =>
    downloadJson(
      `massa-mola_${stamp()}.json`,
      buildModuleExport({
        modulo: 'mola',
        titulo: 'Sistema Massa-Mola',
        metodo: "RK4 em (x, v) para m·x'' = −k·x − b·x', dt = 1 ms; x medido a partir do equilíbrio, positivo para baixo",
        unidades: { t: 's', x: 'm', v: 'm/s', K: 'J', Uel: 'J', Ug: 'J', E: 'J' },
        parametros: { k, massa: m, amortecimento: b, g, amplitudeInicial: A },
        resultados: { alongamentoEquilibrio: d, periodoMedido: Tm, periodoTeorico: Td ?? T },
        verificacao: Tm !== null && Td !== null ? [{ grandeza: b === 0 ? 'T = 2π√(m/k)' : 'T = 2π/√(k/m − (b/2m)²)', teorico: Td, simulado: Tm }] : [],
        serie: sim.history,
      }),
    );

  return (
    <ModuleShell
      title="Sistema Massa-Mola"
      tema="Lei de Hooke e MHS"
      status={sim.playing ? { text: 'Oscilando', tone: 'run' } : { text: sim.t > 0 ? 'Pausado' : 'Pronto', tone: sim.t > 0 ? 'pause' : 'idle' }}
      keys={{ toggle: sim.toggle, step: sim.stepFrame, reset: sim.reset }}
      stats={[
        { label: 'Deslocamento', value: fmt(sim.state.x * 100, 1), unit: 'cm' },
        { label: 'Velocidade', value: fmt(sim.state.v), unit: 'm/s' },
        { label: 'Força elástica', value: fmt(k * (d + sim.state.x), 1), unit: 'N' },
        { label: 'Período medido', value: Tm !== null ? fmt(Tm, 3) : '—', unit: 's', accent: Tm !== null },
      ]}
      scene={<Scene draw={draw} label="Massa pendurada em mola vertical com régua, linhas de equilíbrio e barras de energia" />}
      charts={
        <>
          <TimeChart title="Deslocamento" unit="m" data={sim.history} series={[{ key: 'x', label: 'x', color: COLORS.cyan }]} />
          <TimeChart title="Velocidade" unit="m/s" data={sim.history} series={[{ key: 'v', label: 'v', color: COLORS.green }]} />
          <TimeChart
            title="Energias"
            unit="J"
            data={sim.history}
            series={[
              { key: 'K', label: 'Ec', color: COLORS.green },
              { key: 'Uel', label: 'Eel', color: COLORS.cyan },
              { key: 'E', label: 'Total', color: COLORS.amber },
            ]}
            zero={false}
          />
        </>
      }
      panel={
        <>
          <Playback playing={sim.playing} onToggle={sim.toggle} onStep={sim.stepFrame} onReset={sim.reset} speed={sim.speed} setSpeed={sim.setSpeed} startLabel="Soltar" />
          <Section title="Mola e bloco">
            <Slider label="Constante elástica" symbol="k" value={k} min={10} max={200} step={1} unit="N/m" digits={0} onChange={setK} />
            <Slider label="Massa" symbol="m" value={m} min={0.1} max={3} step={0.05} unit="kg" digits={2} onChange={setM} />
            <Slider label="Amplitude inicial" symbol="A" value={A} min={-0.3} max={0.3} step={0.01} unit="m" digits={2} hint="Positiva puxa o bloco para baixo do equilíbrio." onChange={setA} />
            <Slider label="Gravidade" symbol="g" value={g} min={1} max={25} step={0.01} unit="m/s²" digits={2} hint="Muda o equilíbrio, mas não o período." onChange={setG} />
            <Slider label="Amortecimento" symbol="b" value={b} min={0} max={4} step={0.05} unit="kg/s" digits={2} accent="#FB7185" onChange={setB} />
          </Section>
          <VerifyTable
            rows={[
              { formula: b === 0 ? 'T = 2π√(m/k)' : 'T = 2π/√(k/m − (b/2m)²)', theory: Td, sim: Td !== null ? Tm : null, digits: 4, tol: 5e-4, note: Td === null ? 'Amortecimento crítico ou maior: não há oscilação.' : 'Espere uma oscilação completa…' },
              { formula: 'Fel = k·Δl (no equilíbrio, Fel = P)', theory: m * g, sim: k * d, tol: 1e-9 },
            ]}
          />
          <Section title="Dados" right={<ExportButton onClick={exportar} />}>
            <Note>
              Período sem amortecimento: {fmt(T, 3)} s. Quadruplicar a massa dobra o período; a gravidade só muda onde fica o equilíbrio (Δl = m·g/k = {fmt(d * 100, 1)} cm).
            </Note>
          </Section>
        </>
      }
    />
  );
}
