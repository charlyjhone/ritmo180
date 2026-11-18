import { useMemo, useState } from 'react';
import ModuleShell from '../../shell/ModuleShell';
import Scene from '../../core/Scene';
import TimeChart from '../../core/TimeChart';
import { useStepper } from '../../core/stepper';
import { COLORS, arrow, clear, niceStep, pill } from '../../core/canvas';
import { fmt } from '../../core/format';
import { buildModuleExport, downloadJson, stamp } from '../../core/export';
import { ExportButton, Note, Playback, Section, Slider, Toggle, VerifyTable } from '../../ui/controls';
import { muvState, torricelliV2 } from './physics';
import { params } from '../../core/params';

interface P {
  x0: number;
  v0: number;
  a: number;
  tMax: number;
}

export default function MuvModule() {
  const [p, setP] = useState<P>(() => params({ x0: 0, v0: 4, a: 1.5, tMax: 8 }));
  const [strobe, setStrobe] = useState(true);
  const set = (k: keyof P) => (v: number) => setP((o) => ({ ...o, [k]: v }));

  const sim = useStepper({
    create: () => ({ x: p.x0, v: p.v0 }),
    // Aceleração constante: a atualização x += v·h + a·h²/2 é exata.
    step: (s, h) => ({ x: s.x + s.v * h + 0.5 * p.a * h * h, v: s.v + p.a * h }),
    sample: (s) => ({ x: s.x, v: s.v, a: p.a }),
    tEnd: p.tMax,
    resetKey: [p.x0, p.v0, p.a, p.tMax],
  });

  // Extensão da pista: posições extremas no intervalo [0, tMax]
  const range = useMemo(() => {
    const xs = [0, p.tMax].map((t) => muvState(p, t).x);
    if (p.a !== 0) {
      const tv = -p.v0 / p.a;
      if (tv > 0 && tv < p.tMax) xs.push(muvState(p, tv).x);
    }
    xs.push(0);
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    const m = Math.max(2, (hi - lo) * 0.08);
    return { lo: lo - m, hi: hi + m };
  }, [p]);

  const tInv = p.a !== 0 && -p.v0 / p.a > 0 ? -p.v0 / p.a : null;

  const draw = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    clear(ctx, W, H);
    const padL = 40;
    const padR = 40;
    const s = (W - padL - padR) / (range.hi - range.lo);
    const X = (x: number) => padL + (x - range.lo) * s;
    const roadY = Math.max(170, H * 0.62);

    // estrada
    ctx.fillStyle = '#0E1422';
    ctx.fillRect(0, roadY, W, 34);
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, roadY + 0.5);
    ctx.lineTo(W, roadY + 0.5);
    ctx.moveTo(0, roadY + 34.5);
    ctx.lineTo(W, roadY + 34.5);
    ctx.stroke();
    ctx.setLineDash([14, 12]);
    ctx.strokeStyle = 'rgba(245,158,11,0.35)';
    ctx.beginPath();
    ctx.moveTo(0, roadY + 17);
    ctx.lineTo(W, roadY + 17);
    ctx.stroke();
    ctx.setLineDash([]);

    // régua
    const step = niceStep(80 / s);
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let x = Math.ceil(range.lo / step) * step; x <= range.hi; x += step) {
      ctx.strokeStyle = Math.abs(x) < 1e-9 ? COLORS.cyan : COLORS.axis;
      ctx.beginPath();
      ctx.moveTo(X(x) + 0.5, roadY + 34);
      ctx.lineTo(X(x) + 0.5, roadY + 44);
      ctx.stroke();
      ctx.fillStyle = Math.abs(x) < 1e-9 ? COLORS.cyan : COLORS.label;
      ctx.fillText(fmt(x, step < 1 ? 1 : 0), X(x), roadY + 48);
    }
    ctx.fillStyle = COLORS.label;
    ctx.textAlign = 'right';
    ctx.fillText('x (m)', W - 10, roadY + 66);

    // marcas estroboscópicas (1 por segundo)
    if (strobe) {
      for (let k = 0; k <= Math.floor(sim.t + 1e-9); k++) {
        const q = muvState(p, k);
        const px = X(q.x);
        ctx.fillStyle = 'rgba(56,189,248,0.25)';
        ctx.fillRect(px - 2, roadY - 26 - (k % 2) * 0, 4, 22);
        ctx.fillStyle = COLORS.muted;
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${k}s`, px, roadY - 30 - (k % 2) * 12);
      }
    }

    // carro
    const cx = X(sim.state.x);
    const cy = roadY - 4;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#1E293B';
    ctx.strokeStyle = COLORS.cyan;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-26, -24, 52, 16, 5);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(-14, -36, 28, 13, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#0B0F19';
    ctx.strokeStyle = '#94A3B8';
    for (const wx of [-15, 15]) {
      ctx.beginPath();
      ctx.arc(wx, -6, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = COLORS.cyan;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(cx + 0.5, cy);
    ctx.lineTo(cx + 0.5, roadY + 34);
    ctx.stroke();
    ctx.setLineDash([]);

    // vetores
    const vk = Math.min(10, 140 / Math.max(1, Math.abs(p.v0) + Math.abs(p.a) * p.tMax));
    arrow(ctx, cx, cy - 52, cx + sim.state.v * vk, cy - 52, COLORS.cyan, 2.5);
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.fillStyle = COLORS.cyan;
    ctx.textAlign = sim.state.v >= 0 ? 'left' : 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`v = ${fmt(sim.state.v)} m/s`, cx + sim.state.v * vk + (sim.state.v >= 0 ? 8 : -8), cy - 52);
    if (p.a !== 0) {
      arrow(ctx, cx, cy - 76, cx + p.a * 18, cy - 76, COLORS.amber, 2.5);
      ctx.fillStyle = COLORS.amber;
      ctx.textAlign = p.a >= 0 ? 'left' : 'right';
      ctx.fillText(`a = ${fmt(p.a)} m/s²`, cx + p.a * 18 + (p.a >= 0 ? 8 : -8), cy - 76);
    }
    if (tInv !== null && tInv <= p.tMax && sim.t >= tInv) {
      const xi = muvState(p, tInv).x;
      pill(ctx, `inversão em t = ${fmt(tInv)} s`, X(xi), roadY + 92, COLORS.amber);
    }
  };

  const theoryNow = muvState(p, sim.t);
  const dx = sim.state.x - p.x0;
  const exportar = () =>
    downloadJson(
      `muv_${stamp()}.json`,
      buildModuleExport({
        modulo: 'muv',
        titulo: 'Movimento Uniformemente Variado',
        metodo: 'Integração exata para aceleração constante (x += v·h + a·h²/2)',
        unidades: { t: 's', x: 'm', v: 'm/s', a: 'm/s²' },
        parametros: { x0: p.x0, v0: p.v0, a: p.a, tMax: p.tMax },
        resultados: { tempo: sim.t, posicao: sim.state.x, velocidade: sim.state.v, deslocamento: dx, instanteInversao: tInv },
        verificacao: [
          { grandeza: 'x(t) = x0 + v0·t + a·t²/2', teorico: theoryNow.x, simulado: sim.state.x },
          { grandeza: 'v² = v0² + 2·a·Δx', teorico: torricelliV2(p.v0, p.a, dx), simulado: sim.state.v ** 2 },
        ],
        serie: sim.history,
      }),
    );

  const status = sim.playing ? { text: 'Em movimento', tone: 'run' as const } : sim.finished ? { text: `Fim: t = ${fmt(p.tMax)} s`, tone: 'done' as const } : sim.t > 0 ? { text: 'Pausado', tone: 'pause' as const } : { text: 'Pronto', tone: 'idle' as const };

  return (
    <ModuleShell
      title="Movimento Uniformemente Variado"
      tema="Cinemática"
      status={status}
      keys={{ toggle: sim.toggle, step: sim.stepFrame, reset: sim.reset }}
      stats={[
        { label: 'Tempo', value: fmt(sim.t), unit: 's' },
        { label: 'Posição', value: fmt(sim.state.x), unit: 'm', accent: true },
        { label: 'Velocidade', value: fmt(sim.state.v), unit: 'm/s' },
        { label: 'Aceleração', value: fmt(p.a), unit: 'm/s²' },
      ]}
      scene={<Scene draw={draw} label="Carro em uma estrada com régua em metros, vetores velocidade e aceleração" />}
      charts={
        <>
          <TimeChart title="Posição" unit="m" data={sim.history} series={[{ key: 'x', label: 'x', color: COLORS.cyan }]} window={null} zero={false} />
          <TimeChart title="Velocidade" unit="m/s" data={sim.history} series={[{ key: 'v', label: 'v', color: COLORS.green }]} window={null} />
          <TimeChart title="Aceleração" unit="m/s²" data={sim.history} series={[{ key: 'a', label: 'a', color: COLORS.amber }]} window={null} />
        </>
      }
      panel={
        <>
          <Playback playing={sim.playing} finished={sim.finished} onToggle={sim.toggle} onStep={sim.stepFrame} onReset={sim.reset} speed={sim.speed} setSpeed={sim.setSpeed} />
          <Section title="Condições iniciais">
            <Slider label="Posição inicial" symbol="x₀" value={p.x0} min={-50} max={50} step={1} unit="m" digits={0} onChange={set('x0')} />
            <Slider label="Velocidade inicial" symbol="v₀" value={p.v0} min={-20} max={20} step={0.5} unit="m/s" onChange={set('v0')} />
            <Slider label="Aceleração" symbol="a" value={p.a} min={-5} max={5} step={0.1} unit="m/s²" accent="#F59E0B" onChange={set('a')} />
            <Slider label="Duração" symbol="t" value={p.tMax} min={2} max={20} step={1} unit="s" digits={0} onChange={set('tMax')} />
            <Toggle label="Marcas a cada 1 s" checked={strobe} onChange={setStrobe} />
            <Note>
              x(t) = {fmt(p.x0, 0)} + ({fmt(p.v0, 1)})·t + ({fmt(p.a / 2, 2)})·t²
              {tInv !== null && tInv <= p.tMax ? ` · o carro inverte o sentido em t = ${fmt(tInv)} s.` : ''}
            </Note>
          </Section>
          <VerifyTable
            rows={[
              { formula: 'x = x₀ + v₀t + at²/2', theory: theoryNow.x, sim: sim.state.x, tol: 1e-6 },
              { formula: 'v = v₀ + at', theory: theoryNow.v, sim: sim.state.v, tol: 1e-6 },
              { formula: 'v² = v₀² + 2aΔx (Torricelli)', theory: torricelliV2(p.v0, p.a, dx), sim: sim.state.v ** 2, tol: 1e-6 },
            ]}
          />
          <Section title="Dados" right={<ExportButton onClick={exportar} />}>
            <Note>As marcas estroboscópicas ficam mais espaçadas quando a velocidade cresce: a distância entre marcas consecutivas aumenta de a·(1 s)² a cada segundo.</Note>
          </Section>
        </>
      }
    />
  );
}
