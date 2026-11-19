import { useState } from 'react';
import { param, choice } from '../../core/params';
import ModuleShell from '../../shell/ModuleShell';
import Scene from '../../core/Scene';
import TimeChart from '../../core/TimeChart';
import { useStepper } from '../../core/stepper';
import { COLORS, clear, fitView, pill } from '../../core/canvas';
import { fmt } from '../../core/format';
import { buildModuleExport, downloadJson, stamp } from '../../core/export';
import { Chip, ExportButton, Note, Playback, Section, Slider, VerifyTable } from '../../ui/controls';
import {
  CELLS,
  DX,
  STRING_L,
  advanceWave,
  createWave,
  fdDt,
  harmonic,
  measuredProbePeriod,
  measuredWavelength,
  pulseT0,
  waveSpeed,
  type EndType,
  type Source,
  type WaveParams,
  type WaveState,
} from './physics';

const ENDS: { id: EndType; label: string }[] = [
  { id: 'fixa', label: 'Fixa' },
  { id: 'livre', label: 'Livre' },
  { id: 'sem-fim', label: 'Sem fim' },
];

export default function OndasModule() {
  const [source, setSource] = useState<Source>(() => choice('source', 'oscilador', ['oscilador', 'pulso']));
  const [end, setEnd] = useState<EndType>(() => choice('end', 'sem-fim', ENDS.map((e) => e.id)));
  const [T, setT] = useState(() => param('T', 4));
  const [mu, setMu] = useState(() => param('mu', 0.25));
  const [f, setF] = useState(() => param('f', 1));
  const [Acm, setAcm] = useState(() => param('Acm', 8));
  const [gamma, setGamma] = useState(() => param('gamma', 0));
  const [probeX, setProbeX] = useState(() => param('probeX', 4));

  const p: WaveParams = { T, mu, gamma, A: Acm / 100, f, source, end };
  const v = waveSpeed(p);
  const lamTheory = v / f;

  const sim = useStepper<WaveState>({
    create: () => createWave(probeX),
    step: (s, h) => ({ ...advanceWave(p, s, h) }),
    sample: (s) => ({ src: s.u[0] * 100, probe: s.u[s.probe] * 100 }),
    dt: fdDt(p),
    sampleEvery: 1 / 60,
    resetKey: [source, end, T, mu, f, Acm, gamma, probeX],
  });

  const st = sim.state;
  const front = v * st.t;
  const lamMeas = source === 'oscilador' && end === 'sem-fim' && gamma === 0 ? measuredWavelength(st.u, 0.3, Math.min(front - lamTheory * 0.5, STRING_L - 0.05)) : null;
  const Tmeas = source === 'oscilador' ? measuredProbePeriod(st.crossings) : null;
  const vMeas = source === 'pulso' && st.peak ? probeX / (st.peak.t - pulseT0(p)) : null;

  const draw = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    clear(ctx, W, H);
    const ampView = Math.max(0.25, (Acm / 100) * 2.4);
    const vw = fitView(W, H, { x0: -0.6, x1: STRING_L + 0.6, y0: -ampView, y1: ampView }, { l: 24, r: 24, t: 116, b: 40 });
    // stretch vertical: a amplitude é ampliada para ficar visível
    const sy = Math.min((H - 160) / (2 * ampView), vw.s * 3);
    const Y = (u: number) => vw.Y(0) - u * sy;
    // eixo e régua
    ctx.strokeStyle = COLORS.axis;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(vw.X(0), Y(0));
    ctx.lineTo(vw.X(STRING_L), Y(0));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = COLORS.label;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let x = 0; x <= STRING_L + 1e-9; x += 1) {
      ctx.fillRect(vw.X(x), H - 30, 1, 6);
      ctx.fillText(`${x}`, vw.X(x), H - 22);
    }
    ctx.textAlign = 'right';
    ctx.fillText('x (m)', W - 12, H - 22);

    // frente de onda (oscilador)
    if (source === 'oscilador' && front < STRING_L) {
      ctx.fillStyle = 'rgba(56,189,248,0.05)';
      ctx.fillRect(vw.X(front), Y(ampView), W - vw.X(front), (2 * ampView) * sy);
    }

    // corda
    ctx.strokeStyle = COLORS.cyan;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i <= CELLS; i++) {
      const x = vw.X(i * DX);
      const y = Y(st.u[i]);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    // contas a cada 20 cm
    for (let i = 0; i <= CELLS; i += 10) {
      ctx.fillStyle = i % 50 === 0 ? COLORS.amber : '#94A3B8';
      ctx.beginPath();
      ctx.arc(vw.X(i * DX), Y(st.u[i]), i % 50 === 0 ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // oscilador
    const ox = vw.X(0);
    ctx.fillStyle = '#334155';
    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = 1.5;
    ctx.fillRect(ox - 34, Y(st.u[0]) - 12, 30, 24);
    ctx.strokeRect(ox - 34, Y(st.u[0]) - 12, 30, 24);
    ctx.fillStyle = COLORS.muted;
    ctx.fillRect(ox - 4, Y(st.u[0]) - 3, 6, 6);

    // extremidade direita
    const ex = vw.X(STRING_L);
    if (end === 'fixa') {
      ctx.fillStyle = '#475569';
      ctx.fillRect(ex, Y(ampView * 0.6), 10, ampView * 1.2 * sy);
    } else if (end === 'livre') {
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(ex + 8, Y(ampView * 0.9));
      ctx.lineTo(ex + 8, Y(-ampView * 0.9));
      ctx.stroke();
      ctx.strokeStyle = COLORS.amber;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(ex + 8, Y(st.u[CELLS]), 6, 9, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const g = ctx.createLinearGradient(ex - 40, 0, ex + 30, 0);
      g.addColorStop(0, 'rgba(11,15,25,0)');
      g.addColorStop(1, 'rgba(11,15,25,1)');
      ctx.fillStyle = g;
      ctx.fillRect(ex - 40, Y(ampView), 70, 2 * ampView * sy);
      ctx.fillStyle = COLORS.label;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText('sem fim →', ex + 20, Y(-ampView * 0.75));
    }

    // sonda
    const px = vw.X(probeX);
    ctx.strokeStyle = 'rgba(52,211,153,0.6)';
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(px, Y(ampView));
    ctx.lineTo(px, Y(-ampView));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.green;
    ctx.beginPath();
    ctx.arc(px, Y(st.u[st.probe]), 5.5, 0, Math.PI * 2);
    ctx.fill();
    pill(ctx, `sonda ${fmt(st.u[st.probe] * 100, 1)} cm`, px, Y(-ampView) + 16, COLORS.green);

    // λ medido
    if (lamMeas) {
      const x0 = 0.6;
      ctx.strokeStyle = COLORS.amber;
      ctx.lineWidth = 1.5;
      const yb = Y(ampView * 0.85);
      ctx.beginPath();
      ctx.moveTo(vw.X(x0), yb - 5);
      ctx.lineTo(vw.X(x0), yb + 5);
      ctx.moveTo(vw.X(x0), yb);
      ctx.lineTo(vw.X(x0 + lamMeas), yb);
      ctx.moveTo(vw.X(x0 + lamMeas), yb - 5);
      ctx.lineTo(vw.X(x0 + lamMeas), yb + 5);
      ctx.stroke();
      ctx.fillStyle = COLORS.amber;
      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`λ = ${fmt(lamMeas, 3)} m`, vw.X(x0 + lamMeas / 2), yb - 6);
    }
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = COLORS.label;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`escala vertical ampliada ${fmt(sy / vw.s, 1)}×`, 16, H - 36);
  };

  const exportar = () =>
    downloadJson(
      `ondas_${stamp()}.json`,
      buildModuleExport({
        modulo: 'ondas',
        titulo: 'Ondas em uma corda',
        metodo: "Diferenças finitas com Courant 1 (v·Δt = Δx, exato para a equação de onda sem amortecimento); 400 células em 8 m",
        unidades: { t: 's', src: 'cm', probe: 'cm' },
        parametros: { fonte: source, extremidade: end, tracao: T, densidadeLinear: mu, frequencia: f, amplitude_cm: Acm, amortecimento: gamma, sonda_m: probeX },
        resultados: { velocidade: v, lambdaTeorico: lamTheory, lambdaMedido: lamMeas, periodoMedido: Tmeas, velocidadeMedidaPulso: vMeas },
        verificacao: [
          ...(lamMeas !== null ? [{ grandeza: 'λ = v/f', teorico: lamTheory, simulado: lamMeas }] : []),
          ...(Tmeas !== null ? [{ grandeza: 'T = 1/f', teorico: 1 / f, simulado: Tmeas }] : []),
          ...(vMeas !== null ? [{ grandeza: 'v = √(T/μ)', teorico: v, simulado: vMeas }] : []),
        ],
        serie: sim.history,
      }),
    );

  return (
    <ModuleShell
      title="Ondas em uma Corda"
      tema="v = λ·f, reflexão, ondas estacionárias"
      status={sim.playing ? { text: 'Propagando', tone: 'run' } : { text: sim.t > 0 ? 'Pausado' : 'Pronto', tone: sim.t > 0 ? 'pause' : 'idle' }}
      keys={{ toggle: sim.toggle, step: sim.stepFrame, reset: sim.reset }}
      stats={[
        { label: 'Velocidade da onda', value: fmt(v, 2), unit: 'm/s', accent: true },
        { label: 'Comprimento de onda', value: source === 'oscilador' ? fmt(lamTheory, 2) : '—', unit: 'm' },
        { label: 'Período', value: source === 'oscilador' ? fmt(1 / f, 3) : '—', unit: 's' },
        { label: 'Tempo', value: fmt(sim.t, 2), unit: 's' },
      ]}
      scene={<Scene draw={draw} label="Corda vibrante com oscilador na esquerda, extremidade configurável e sonda de deslocamento" />}
      charts={
        <>
          <TimeChart title="Deslocamento na fonte" unit="cm" data={sim.history} series={[{ key: 'src', label: 'fonte', color: COLORS.amber }]} window={6} />
          <TimeChart title="Deslocamento na sonda" unit="cm" data={sim.history} series={[{ key: 'probe', label: 'sonda', color: COLORS.green }]} window={6} />
        </>
      }
      panel={
        <>
          <Playback playing={sim.playing} onToggle={sim.toggle} onStep={sim.stepFrame} onReset={sim.reset} speed={sim.speed} setSpeed={sim.setSpeed} startLabel={source === 'pulso' ? 'Enviar pulso' : 'Ligar oscilador'} />
          <Section title="Fonte">
            <div className="flex gap-1.5">
              <Chip active={source === 'oscilador'} onClick={() => setSource('oscilador')}>Oscilador</Chip>
              <Chip active={source === 'pulso'} onClick={() => setSource('pulso')}>Pulso</Chip>
            </div>
            {source === 'oscilador' && <Slider label="Frequência" symbol="f" value={f} min={0.2} max={5} step={0.05} unit="Hz" digits={2} accent="#F59E0B" onChange={setF} />}
            <Slider label="Amplitude" symbol="A" value={Acm} min={1} max={20} step={0.5} unit="cm" digits={1} accent="#F59E0B" onChange={setAcm} />
          </Section>
          <Section title="Corda">
            <Slider label="Tração" symbol="T" value={T} min={0.5} max={20} step={0.1} unit="N" digits={1} onChange={setT} />
            <Slider label="Densidade linear" symbol="μ" value={mu} min={0.05} max={1} step={0.01} unit="kg/m" digits={2} onChange={setMu} />
            <Slider label="Amortecimento" symbol="γ" value={gamma} min={0} max={1} step={0.01} unit="1/s" digits={2} accent="#FB7185" onChange={setGamma} />
            <div>
              <div className="mb-1.5 text-[13px] text-slate-300">Extremidade direita</div>
              <div className="flex gap-1.5">
                {ENDS.map((e) => (
                  <Chip key={e.id} active={end === e.id} onClick={() => setEnd(e.id)}>
                    {e.label}
                  </Chip>
                ))}
              </div>
            </div>
            <Slider label="Posição da sonda" symbol="x" value={probeX} min={0.5} max={7.5} step={0.1} unit="m" digits={1} accent="#34D399" onChange={setProbeX} />
          </Section>
          {end === 'fixa' && source === 'oscilador' && (
            <Section title="Ondas estacionárias">
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => {
                  const fn = harmonic(p, n);
                  return (
                    <Chip key={n} active={Math.abs(f - fn) < 1e-9} onClick={() => { setF(fn); if (gamma === 0) setGamma(0.15); }} title={`${fmt(fn, 2)} Hz`}>
                      {n}º harm.
                    </Chip>
                  );
                })}
              </div>
              <Note>Com as duas pontas presas, a corda ressoa em fₙ = n·v/(2L) = n × {fmt(harmonic(p, 1), 3)} Hz. Use um pouco de amortecimento para a amplitude se estabilizar.</Note>
            </Section>
          )}
          <VerifyTable
            empty={source === 'pulso' ? 'Envie o pulso e espere ele passar pela sonda.' : 'Ligue o oscilador e espere a onda passar da sonda.'}
            rows={
              source === 'pulso'
                ? [{ formula: 'v = √(T/μ) (tempo do pulso até a sonda)', theory: v, sim: vMeas, digits: 4, tol: 1e-3, note: 'Aguardando o pulso chegar à sonda…' }]
                : [
                    { formula: 'T = 1/f (cruzamentos na sonda)', theory: 1 / f, sim: Tmeas, digits: 4, tol: 1e-3, note: 'Aguardando dois períodos na sonda…' },
                    ...(end === 'sem-fim' && gamma === 0 ? [{ formula: 'λ = v/f (medido na corda)', theory: lamTheory, sim: lamMeas, digits: 4, tol: 1e-3, note: 'Aguardando a onda cobrir alguns comprimentos…' }] : []),
                  ]
            }
          />
          <Section title="Dados" right={<ExportButton onClick={exportar} />}>
            <Note>
              A velocidade depende só da corda (v = √(T/μ)); a frequência, só da fonte. Na ponta fixa o pulso volta invertido; na livre, volta do mesmo lado; sem fim, não volta.
            </Note>
          </Section>
        </>
      }
    />
  );
}
