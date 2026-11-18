import { useState } from 'react';
import ModuleShell from '../../shell/ModuleShell';
import Scene from '../../core/Scene';
import TimeChart from '../../core/TimeChart';
import { measuredPeriod, useStepper } from '../../core/stepper';
import { COLORS, arrow, clear, fitView, pill } from '../../core/canvas';
import { fmt } from '../../core/format';
import { buildModuleExport, downloadJson, stamp } from '../../core/export';
import { Chip, ExportButton, Note, Playback, Section, Slider, VerifyTable } from '../../ui/controls';
import { DEG, exactPeriod, pendEnergy, smallAnglePeriod, stepPendulum } from './physics';
import { param } from '../../core/params';

export default function PenduloModule() {
  const [L, setL] = useState(() => param('L', 1));
  const [m, setM] = useState(() => param('m', 0.5));
  const [g, setG] = useState(() => param('g', 9.81));
  const [th0, setTh0] = useState(() => param('th0', 20));
  const [b, setB] = useState(() => param('b', 0));
  const p = { L, m, g, b };

  const sim = useStepper({
    create: () => ({ th: th0 * DEG, w: 0 }),
    step: (s, h) => stepPendulum(p, s.th, s.w, h),
    sample: (s) => {
      const e = pendEnergy(p, s.th, s.w);
      return { th: s.th / DEG, w: s.w, K: e.K, U: e.U, E: e.E };
    },
    dt: 1 / 1000,
    sampleEvery: 1 / 120,
    resetKey: [L, g, th0],
  });

  const Tex = exactPeriod(L, g, th0 * DEG);
  const T0 = smallAnglePeriod(L, g);
  const Tm = measuredPeriod(sim.history, 'th');

  const draw = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    clear(ctx, W, H);
    const R = L + 0.25;
    const v = fitView(W, H, { x0: -R, x1: R, y0: -R, y1: 0.15 }, { l: 30, r: 30, t: 110, b: 30 });
    const ox = v.X(0);
    const oy = v.Y(0);
    // suporte
    ctx.fillStyle = '#1F2937';
    ctx.fillRect(ox - 70, oy - 8, 140, 8);
    // transferidor
    ctx.strokeStyle = 'rgba(148,163,184,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(ox, oy, L * v.s, 0, Math.PI);
    ctx.stroke();
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = COLORS.label;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let a = -90; a <= 90; a += 10) {
      const r1 = L * v.s;
      const r2 = r1 + (a % 30 === 0 ? 10 : 5);
      const ang = Math.PI / 2 + a * DEG;
      ctx.beginPath();
      ctx.moveTo(ox + Math.cos(ang) * r1, oy + Math.sin(ang) * r1);
      ctx.lineTo(ox + Math.cos(ang) * r2, oy + Math.sin(ang) * r2);
      ctx.stroke();
      if (a % 30 === 0 && a !== 0) ctx.fillText(`${Math.abs(a)}°`, ox + Math.cos(ang) * (r2 + 12), oy + Math.sin(ang) * (r2 + 12));
    }
    // vertical de referência
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox, oy + L * v.s + 6);
    ctx.stroke();
    ctx.setLineDash([]);
    // rastro (últimos 1,5 s)
    const hist = sim.history;
    ctx.strokeStyle = 'rgba(56,189,248,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    for (let i = hist.length - 1; i >= 0 && hist[i].t > sim.t - 1.5; i--) {
      const a = hist[i].th * DEG;
      const x = ox + Math.sin(a) * L * v.s;
      const y = oy + Math.cos(a) * L * v.s;
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // haste e massa
    const th = sim.state.th;
    const bx = ox + Math.sin(th) * L * v.s;
    const by = oy + Math.cos(th) * L * v.s;
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(bx, by);
    ctx.stroke();
    // arco do ângulo
    ctx.strokeStyle = 'rgba(245,158,11,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const r = Math.min(48, L * v.s * 0.4);
    if (th >= 0) ctx.arc(ox, oy, r, Math.PI / 2 - th, Math.PI / 2);
    else ctx.arc(ox, oy, r, Math.PI / 2, Math.PI / 2 - th);
    ctx.stroke();
    ctx.fillStyle = COLORS.amber;
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.fillText(`${fmt(th / DEG, 1)}°`, ox + Math.sin(th / 2) * (r + 22), oy + Math.cos(th / 2) * (r + 22));
    const rad = 8 + Math.cbrt(m) * 10;
    ctx.fillStyle = COLORS.cyan;
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(bx, by, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // velocidade tangencial
    const vt = sim.state.w * L; // m/s
    const k = 60 / Math.max(0.5, Math.sqrt(2 * g * L * (1 - Math.cos(th0 * DEG))));
    arrow(ctx, bx, by, bx + Math.cos(th) * vt * k, by - Math.sin(th) * vt * k, COLORS.green, 2.5);
    ctx.fillStyle = COLORS.text;
    ctx.beginPath();
    ctx.arc(ox, oy, 4, 0, Math.PI * 2);
    ctx.fill();
    if (Tm !== null) pill(ctx, `T medido = ${fmt(Tm, 3)} s`, W - 16, H - 20, COLORS.cyan, 'right');
  };

  const exportar = () =>
    downloadJson(
      `pendulo_${stamp()}.json`,
      buildModuleExport({
        modulo: 'pendulo',
        titulo: 'Pêndulo Simples',
        metodo: "RK4 em (θ, ω) para θ'' = −(g/L)·sen θ − b·θ', dt = 1 ms",
        unidades: { t: 's', th: '°', w: 'rad/s', K: 'J', U: 'J', E: 'J' },
        parametros: { comprimento: L, massa: m, g, anguloInicial: th0, amortecimento: b },
        resultados: { periodoMedido: Tm, periodoExato: Tex, periodoPequenosAngulos: T0 },
        verificacao: Tm !== null && b === 0 ? [{ grandeza: 'T = 4√(L/g)·K(sen θ₀/2)', teorico: Tex, simulado: Tm }] : [],
        serie: sim.history,
      }),
    );

  return (
    <ModuleShell
      title="Pêndulo Simples"
      tema="Movimento harmônico simples"
      status={sim.playing ? { text: 'Oscilando', tone: 'run' } : { text: sim.t > 0 ? 'Pausado' : 'Pronto', tone: sim.t > 0 ? 'pause' : 'idle' }}
      keys={{ toggle: sim.toggle, step: sim.stepFrame, reset: sim.reset }}
      stats={[
        { label: 'Tempo', value: fmt(sim.t), unit: 's' },
        { label: 'Ângulo', value: fmt(sim.state.th / DEG, 1), unit: '°' },
        { label: 'Velocidade', value: fmt(Math.abs(sim.state.w * L)), unit: 'm/s' },
        { label: 'Período medido', value: Tm !== null ? fmt(Tm, 3) : '—', unit: 's', accent: Tm !== null },
      ]}
      scene={<Scene draw={draw} label="Pêndulo com transferidor, rastro e vetor velocidade" />}
      charts={
        <>
          <TimeChart title="Ângulo" unit="°" data={sim.history} series={[{ key: 'th', label: 'θ', color: COLORS.amber }]} />
          <TimeChart title="Velocidade angular" unit="rad/s" data={sim.history} series={[{ key: 'w', label: 'ω', color: COLORS.green }]} />
          <TimeChart
            title="Energias"
            unit="J"
            data={sim.history}
            series={[
              { key: 'K', label: 'Ec', color: COLORS.green },
              { key: 'U', label: 'Ep', color: COLORS.cyan },
              { key: 'E', label: 'Total', color: COLORS.amber },
            ]}
          />
        </>
      }
      panel={
        <>
          <Playback playing={sim.playing} onToggle={sim.toggle} onStep={sim.stepFrame} onReset={sim.reset} speed={sim.speed} setSpeed={sim.setSpeed} startLabel="Soltar" />
          <Section title="Pêndulo">
            <Slider label="Comprimento" symbol="L" value={L} min={0.2} max={3} step={0.05} unit="m" digits={2} onChange={setL} />
            <Slider label="Ângulo inicial" symbol="θ₀" value={th0} min={1} max={170} step={1} unit="°" digits={0} accent="#F59E0B" onChange={setTh0} />
            <Slider label="Massa" symbol="m" value={m} min={0.1} max={2} step={0.05} unit="kg" digits={2} hint="Não altera o período; muda só a energia." onChange={setM} />
            <Slider label="Gravidade" symbol="g" value={g} min={1} max={25} step={0.01} unit="m/s²" digits={2} onChange={setG} />
            <div className="flex flex-wrap gap-1.5">
              {[
                ['Lua', 1.62],
                ['Marte', 3.71],
                ['Terra', 9.81],
                ['Júpiter', 24.79],
              ].map(([n, gv]) => (
                <Chip key={n} active={g === gv} onClick={() => setG(gv as number)}>
                  {n}
                </Chip>
              ))}
            </div>
            <Slider label="Amortecimento" symbol="b" value={b} min={0} max={1} step={0.01} unit="1/s" digits={2} accent="#FB7185" onChange={setB} />
          </Section>
          <VerifyTable
            rows={[
              { formula: 'T = 4√(L/g)·K(sen θ₀/2) (exato)', theory: b === 0 ? Tex : null, sim: b === 0 ? Tm : null, digits: 4, tol: 2e-4, note: b > 0 ? 'Válido sem amortecimento (b = 0).' : 'Espere uma oscilação completa…' },
            ]}
          />
          <Section title="Pequenos ângulos">
            <Note>
              A fórmula do ensino médio T₀ = 2π√(L/g) = <span className="font-mono text-slate-200">{fmt(T0, 3)} s</span> vale para θ₀ pequeno. Com θ₀ = {th0}°, o período exato é{' '}
              <span className="font-mono text-slate-200">{fmt(Tex, 3)} s</span>, {fmt((Tex / T0 - 1) * 100, 2)}% maior.
            </Note>
          </Section>
          <Section title="Dados" right={<ExportButton onClick={exportar} />}>
            <Note>O período é medido entre passagens sucessivas pela vertical no mesmo sentido.</Note>
          </Section>
        </>
      }
    />
  );
}
