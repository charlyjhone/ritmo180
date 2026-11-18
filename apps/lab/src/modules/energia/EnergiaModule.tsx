import { useMemo, useState } from 'react';
import ModuleShell from '../../shell/ModuleShell';
import Scene from '../../core/Scene';
import TimeChart from '../../core/TimeChart';
import { useStepper } from '../../core/stepper';
import { COLORS, barGroup, clear, drawGrid, fitView } from '../../core/canvas';
import { fmt } from '../../core/format';
import { buildModuleExport, downloadJson, stamp } from '../../core/export';
import { Chip, ExportButton, Note, Playback, Section, Select, Slider, VerifyTable } from '../../ui/controls';
import { TRACKS, energies, stepTrack, type TrackId } from './physics';
import { param, choice } from '../../core/params';

export default function EnergiaModule() {
  const [trackId, setTrackId] = useState<TrackId>(() => choice('trackId', 'U', Object.keys(TRACKS)));
  const [x0, setX0] = useState(() => param('x0', -5));
  const [m, setM] = useState(() => param('m', 60));
  const [g, setG] = useState(() => param('g', 9.81));
  const [c, setC] = useState(() => param('c', 0));
  const track = TRACKS[trackId];
  const p = useMemo(() => ({ track, g, m, c }), [track, g, m, c]);
  const xStart = Math.min(track.x1 - 0.3, Math.max(track.x0 + 0.3, x0));
  const E0 = energies(p, xStart, 0).E;

  const sim = useStepper({
    create: () => ({ x: xStart, vx: 0, Eth: 0, Elast: E0 }),
    step: (s, h) => {
      const r = stepTrack(p, s.x, s.vx, h);
      let { x, vx } = r;
      if (x < track.x0) {
        x = track.x0;
        vx = Math.abs(vx);
      } else if (x > track.x1) {
        x = track.x1;
        vx = -Math.abs(vx);
      }
      // Energia térmica: tudo o que a energia mecânica perde pelo atrito
      const E = energies(p, x, vx).E;
      const lost = c > 0 ? Math.max(0, s.Elast - E) : 0;
      return { x, vx, Eth: s.Eth + lost, Elast: E };
    },
    sample: (s) => {
      const e = energies(p, s.x, s.vx);
      return { K: e.K, U: e.U, Eth: s.Eth, Etot: e.K + e.U + s.Eth, v: e.speed, h: e.h };
    },
    dt: 1 / 600,
    resetKey: [trackId, xStart, m, g],
  });

  const e = energies(p, sim.state.x, sim.state.vx);
  const h0 = track.f(xStart);
  const pts = useMemo(() => {
    const out: [number, number][] = [];
    for (let i = 0; i <= 300; i++) {
      const x = track.x0 + ((track.x1 - track.x0) * i) / 300;
      out.push([x, track.f(x)]);
    }
    return out;
  }, [track]);
  const yMax = Math.max(...pts.map((q) => q[1]));

  const draw = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    clear(ctx, W, H);
    const v = fitView(W, H, { x0: track.x0 - 0.5, x1: track.x1 + 0.5, y0: -0.8, y1: yMax + 1 }, { l: 50, r: 30, t: 120, b: 36 });
    drawGrid(ctx, v, W, H, { unit: 'm' });
    // pista
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(v.X(x), v.Y(y)) : ctx.moveTo(v.X(x), v.Y(y))));
    ctx.lineTo(v.X(track.x1), v.Y(-0.8));
    ctx.lineTo(v.X(track.x0), v.Y(-0.8));
    ctx.closePath();
    ctx.fillStyle = '#121A2B';
    ctx.fill();
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(v.X(x), v.Y(y)) : ctx.moveTo(v.X(x), v.Y(y))));
    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = 3;
    ctx.stroke();
    // altura inicial
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = 'rgba(245,158,11,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(v.X(track.x0), v.Y(h0));
    ctx.lineTo(v.X(track.x1), v.Y(h0));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.amber;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`h₀ = ${fmt(h0)} m`, v.X(track.x1) - 4, v.Y(h0) - 4);
    // corpo
    const x = sim.state.x;
    const d = track.df(x);
    const nlen = Math.sqrt(1 + d * d);
    const r = 0.32;
    const cxw = x - (d / nlen) * r;
    const cyw = track.f(x) + (1 / nlen) * r;
    ctx.fillStyle = COLORS.cyan;
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(v.X(cxw), v.Y(cyw), r * v.s, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // altura atual
    ctx.strokeStyle = 'rgba(167,139,250,0.6)';
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(v.X(x), v.Y(track.f(x)));
    ctx.lineTo(v.X(x), v.Y(0));
    ctx.stroke();
    ctx.setLineDash([]);
    // barras de energia
    const Emax = Math.max(E0, 1);
    barGroup(
      ctx,
      W - 16 - (4 * 48 + 14),
      106,
      Math.max(60, Math.min(150, H - 240)),
      [
        { label: 'Ec', value: e.K, color: COLORS.green },
        { label: 'Ep', value: e.U, color: COLORS.cyan },
        { label: 'Térm', value: sim.state.Eth, color: COLORS.rose },
        { label: 'Total', value: e.K + e.U + sim.state.Eth, color: COLORS.amber },
      ],
      Emax,
      'J',
    );
  };

  const vTheory = c === 0 ? Math.sqrt(Math.max(0, 2 * g * (h0 - e.h))) : null;
  const exportar = () =>
    downloadJson(
      `energia_${stamp()}.json`,
      buildModuleExport({
        modulo: 'energia',
        titulo: 'Conservação da Energia',
        metodo: 'RK4 em (x, ẋ) ao longo de y = f(x), dt = 1/600 s; atrito viscoso tangencial',
        unidades: { t: 's', K: 'J', U: 'J', Eth: 'J', Etot: 'J', v: 'm/s', h: 'm' },
        parametros: { pista: track.name, x0: xStart, alturaInicial: h0, massa: m, g, atrito: c },
        resultados: { energiaInicial: E0, energiaTermica: sim.state.Eth },
        verificacao: vTheory !== null ? [{ grandeza: 'v = √(2g(h₀ − h))', teorico: vTheory, simulado: e.speed }] : [],
        serie: sim.history,
      }),
    );

  return (
    <ModuleShell
      title="Conservação da Energia"
      tema="Energia mecânica e térmica"
      status={sim.playing ? { text: 'Deslizando', tone: 'run' } : { text: sim.t > 0 ? 'Pausado' : 'Pronto', tone: sim.t > 0 ? 'pause' : 'idle' }}
      keys={{ toggle: sim.toggle, step: sim.stepFrame, reset: sim.reset }}
      stats={[
        { label: 'Velocidade', value: fmt(e.speed), unit: 'm/s', accent: true },
        { label: 'Altura', value: fmt(e.h), unit: 'm' },
        { label: 'Energia cinética', value: fmt(e.K, 0), unit: 'J' },
        { label: 'Energia potencial', value: fmt(e.U, 0), unit: 'J' },
      ]}
      scene={<Scene draw={draw} label="Corpo deslizando em uma pista curva com barras de energia cinética, potencial, térmica e total" />}
      charts={
        <>
          <TimeChart
            title="Energias"
            unit="J"
            data={sim.history}
            series={[
              { key: 'K', label: 'Ec', color: COLORS.green },
              { key: 'U', label: 'Ep', color: COLORS.cyan },
              { key: 'Eth', label: 'Térm', color: COLORS.rose },
              { key: 'Etot', label: 'Total', color: COLORS.amber },
            ]}
          />
          <TimeChart title="Velocidade" unit="m/s" data={sim.history} series={[{ key: 'v', label: 'v', color: COLORS.green }]} />
          <TimeChart title="Altura" unit="m" data={sim.history} series={[{ key: 'h', label: 'h', color: COLORS.violet }]} />
        </>
      }
      panel={
        <>
          <Playback playing={sim.playing} onToggle={sim.toggle} onStep={sim.stepFrame} onReset={sim.reset} speed={sim.speed} setSpeed={sim.setSpeed} startLabel="Soltar" />
          <Section title="Pista e corpo">
            <Select
              label="Formato da pista"
              value={trackId}
              options={Object.values(TRACKS).map((t) => ({ value: t.id, label: t.name }))}
              onChange={(v) => {
                setTrackId(v);
                setX0(TRACKS[v].x0 + 1);
              }}
            />
            <Slider label="Posição de largada" symbol="x₀" value={x0} min={track.x0 + 0.3} max={track.x1 - 0.3} step={0.1} unit="m" hint={`Altura inicial h₀ = ${fmt(h0)} m`} onChange={setX0} />
            <Slider label="Massa" symbol="m" value={m} min={1} max={120} step={1} unit="kg" digits={0} onChange={setM} />
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
            <Slider label="Atrito" symbol="c" value={c} min={0} max={1} step={0.01} unit="1/s" digits={2} accent="#FB7185" hint="Muda na hora. Com atrito, a energia mecânica vira térmica." onChange={setC} />
          </Section>
          <VerifyTable
            rows={[
              { formula: 'v = √(2g(h₀ − h))', theory: vTheory, sim: c === 0 ? e.speed : null, tol: 2e-3, note: 'Válida só sem atrito (c = 0).' },
              { formula: 'Ec + Ep + Etérm = E₀', theory: E0, sim: e.K + e.U + sim.state.Eth, tol: 1e-4 },
            ]}
          />
          <Section title="Dados" right={<ExportButton onClick={exportar} />}>
            <Note>
              Sem atrito, o corpo nunca passa da linha tracejada h₀: a energia total m·g·h₀ = {fmt(E0, 0)} J só troca de forma entre cinética e potencial.
            </Note>
          </Section>
        </>
      }
    />
  );
}
