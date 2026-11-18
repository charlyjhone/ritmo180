import { useEffect, useState } from 'react';
import { param, choice } from '../../core/params';
import ModuleShell from '../../shell/ModuleShell';
import Scene from '../../core/Scene';
import TimeChart from '../../core/TimeChart';
import { useStepper } from '../../core/stepper';
import { COLORS, clear } from '../../core/canvas';
import { fmt } from '../../core/format';
import { buildModuleExport, downloadJson, stamp } from '../../core/export';
import { Chip, ExportButton, Note, Playback, Section, Slider, VerifyTable } from '../../ui/controls';
import {
  ATM,
  GASES,
  KB,
  LY,
  NA,
  R_GAS,
  createGas,
  idealPressure,
  kineticTemperature,
  maxwellPdf,
  measuredPressure,
  setTemperature,
  setWidth,
  stepGas,
  volume,
  type GasState,
} from './physics';

interface Point {
  P: number;
  V: number;
  T: number;
  N: number;
}

export default function GasesModule() {
  const [N, setN] = useState(() => param('N', 300));
  const [T, setT] = useState(() => param('T', 300));
  const [Lx, setLx] = useState(() => param('Lx', 12));
  const [gasId, setGasId] = useState(() => choice<string>('gasId', 'N2', GASES.map((g) => g.id)));
  const [points, setPoints] = useState<Point[]>([]);
  const gas = GASES.find((g) => g.id === gasId)!;

  const sim = useStepper<GasState>({
    create: () => createGas(N, T, gas.M, Lx),
    step: (s, h) => stepGas(s, h, gas.M),
    sample: (s) => {
      const Pm = measuredPressure(s);
      return { Pm: Pm !== null ? Pm / ATM : 0, Pt: idealPressure(s.n, T, s.Lx) / ATM };
    },
    dt: 0.02,
    sampleEvery: 2,
    timeScale: 20, // 1 s real = 20 ps
    resetKey: [N, gasId],
    autoplay: true,
  });

  // mudanças de T e de volume agem sobre o gás em movimento (sem recriá-lo)
  useEffect(() => {
    setTemperature(sim.state, T, gas.M);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [T]);
  useEffect(() => {
    setWidth(sim.state, Lx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Lx]);

  const s = sim.state;
  const Pm = measuredPressure(s);
  const Pt = idealPressure(N, T, Lx);
  const Tk = kineticTemperature(s, gas.M);
  const V = volume(Lx);
  const settled = s.tMeas > 300;
  const vrms = Math.sqrt((3 * KB * T) / (gas.M * 1.66053907e-27));

  const draw = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    clear(ctx, W, H);
    const top = 116;
    const histW = Math.min(260, W * 0.32);
    const areaW = W - histW - 70;
    const scale = Math.min(areaW / 20, (H - top - 50) / LY);
    const bx = 30;
    const by = top + 10;
    // caixa (largura máxima tracejada)
    ctx.strokeStyle = 'rgba(100,116,139,0.35)';
    ctx.setLineDash([4, 6]);
    ctx.strokeRect(bx, by, 20 * scale, LY * scale);
    ctx.setLineDash([]);
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(bx, by, s.Lx * scale, LY * scale);
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 3;
    ctx.strokeRect(bx, by, s.Lx * scale, LY * scale);
    // pistão
    ctx.fillStyle = '#475569';
    ctx.fillRect(bx + s.Lx * scale, by - 6, 10, LY * scale + 12);
    ctx.fillRect(bx + s.Lx * scale + 10, by + (LY * scale) / 2 - 4, 30, 8);
    // partículas coloridas pela rapidez
    const vmean = Math.sqrt((8 * KB * T) / (Math.PI * gas.M * 1.66053907e-27)) / 1000;
    for (let i = 0; i < s.n; i++) {
      const sp = Math.hypot(s.vx[i], s.vy[i], s.vz[i]) / vmean;
      const u = Math.max(0, Math.min(1, (sp - 0.4) / 1.4));
      ctx.fillStyle = `rgb(${Math.round(56 + 195 * u)},${Math.round(189 - 76 * u)},${Math.round(248 - 115 * u)})`;
      ctx.beginPath();
      ctx.arc(bx + s.x[i] * scale, by + s.y[i] * scale, Math.max(2, Math.min(4, scale * 0.12)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = COLORS.label;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`${fmt(s.Lx, 1)} nm × ${LY} nm × ${LY} nm  ·  V = ${fmt(V * 1e27, 0)} nm³`, bx, by + LY * scale + 10);
    ctx.fillText('cor: lenta (azul) → rápida (vermelha)', bx, by + LY * scale + 26);

    // histograma de rapidez com a curva de Maxwell
    const hx = W - histW - 20;
    const hy = by;
    const hh = Math.min(200, LY * scale);
    const bins = 24;
    const vmax = 3.2 * vmean;
    const counts = new Array<number>(bins).fill(0);
    for (let i = 0; i < s.n; i++) {
      const sp = Math.hypot(s.vx[i], s.vy[i], s.vz[i]);
      const k = Math.floor((sp / vmax) * bins);
      if (k >= 0 && k < bins) counts[k]++;
    }
    const bw = vmax / bins;
    const peak = Math.max(...counts, ...Array.from({ length: 60 }, (_, j) => s.n * bw * maxwellPdf(((j + 0.5) / 60) * vmax, T, gas.M)));
    ctx.fillStyle = '#131B2C';
    ctx.fillRect(hx, hy, histW, hh);
    ctx.fillStyle = 'rgba(56,189,248,0.55)';
    counts.forEach((c, k) => {
      const h = (c / peak) * (hh - 20);
      ctx.fillRect(hx + (k * histW) / bins + 1, hy + hh - h, histW / bins - 2, h);
    });
    ctx.strokeStyle = COLORS.amber;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let j = 0; j <= 60; j++) {
      const v = (j / 60) * vmax;
      const yv = (s.n * bw * maxwellPdf(v, T, gas.M)) / peak;
      const px = hx + (v / vmax) * histW;
      const py = hy + hh - yv * (hh - 20);
      j ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = '600 11px Inter, sans-serif';
    ctx.fillText('Distribuição de velocidades', hx, hy - 16);
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = COLORS.label;
    ctx.textBaseline = 'top';
    ctx.fillText(`0`, hx, hy + hh + 4);
    ctx.textAlign = 'right';
    ctx.fillText(`${fmt(vmax * 1000, 0)} m/s`, hx + histW, hy + hh + 4);
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.amber;
    ctx.fillText('— Maxwell-Boltzmann', hx, hy + hh + 18);
  };

  const exportar = () =>
    downloadJson(
      `gases_${stamp()}.json`,
      buildModuleExport({
        modulo: 'gases',
        titulo: 'Gases ideais',
        metodo: 'Partículas não interagentes com reflexão elástica; pressão = impulso nas paredes / (área·tempo); velocidades de Maxwell com <vx²> = <vy²> = <vz²> = kT/m',
        unidades: { t: 'ps', Pm: 'atm (medida)', Pt: 'atm (PV = NkT)' },
        parametros: { particulas: N, gas: gas.name, temperatura: T, largura_nm: Lx },
        resultados: { volume_m3: V, pressaoMedida_Pa: Pm, pressaoIdeal_Pa: Pt, mols: N / NA, vrms_ms: vrms, registros: points.length },
        verificacao: Pm !== null && settled ? [{ grandeza: 'P = N·k·T/V (Pa)', teorico: Pt, simulado: Pm }] : [],
        serie: sim.history,
      }),
    );

  return (
    <ModuleShell
      title="Gases Ideais"
      tema="PV = nRT, teoria cinética"
      status={sim.playing ? { text: settled ? 'Medindo pressão' : 'Estabilizando a média', tone: 'run' } : { text: 'Pausado', tone: 'pause' }}
      keys={{ toggle: sim.toggle, step: sim.stepFrame, reset: sim.reset }}
      stats={[
        { label: 'Pressão medida', value: Pm !== null ? fmt(Pm / ATM, 2) : '—', unit: 'atm', accent: true },
        { label: 'PV = NkT prevê', value: fmt(Pt / ATM, 2), unit: 'atm' },
        { label: 'Temperatura', value: fmt(Tk, 1), unit: 'K' },
        { label: 'v quadrática média', value: fmt(vrms, 0), unit: 'm/s' },
      ]}
      scene={<Scene draw={draw} label="Partículas de gás numa caixa com pistão e histograma de velocidades comparado à curva de Maxwell" />}
      charts={
        <>
          <TimeChart
            title="Pressão (média acumulada)"
            unit="atm"
            data={sim.history}
            series={[
              { key: 'Pm', label: 'medida', color: COLORS.cyan },
              { key: 'Pt', label: 'PV = NkT', color: COLORS.amber },
            ]}
            window={null}
            tUnit="ps"
          />
        </>
      }
      panel={
        <>
          <Playback playing={sim.playing} onToggle={sim.toggle} onStep={sim.stepFrame} onReset={sim.reset} speed={sim.speed} setSpeed={sim.setSpeed} />
          <Section title="Gás">
            <div className="flex flex-wrap gap-1.5">
              {GASES.map((g) => (
                <Chip key={g.id} active={gasId === g.id} onClick={() => setGasId(g.id)} title={`M = ${g.M} g/mol`}>
                  {g.name}
                </Chip>
              ))}
            </div>
            <Slider label="Número de partículas" symbol="N" value={N} min={20} max={1000} step={10} unit="" digits={0} onChange={setN} />
          </Section>
          <Section title="Estado">
            <Slider label="Temperatura" symbol="T" value={T} min={50} max={1000} step={5} unit="K" digits={0} accent="#FB7185" hint="Aquecer reescala as velocidades de todas as partículas." onChange={setT} />
            <Slider label="Largura da caixa (pistão)" symbol="L" value={Lx} min={4} max={20} step={0.5} unit="nm" digits={1} accent="#A78BFA" onChange={setLx} />
            <button
              type="button"
              disabled={Pm === null || !settled}
              onClick={() => Pm !== null && setPoints((p) => [...p.slice(-5), { P: Pm, V, T, N }])}
              className="w-full rounded-lg border border-edge py-2 text-[13px] text-slate-200 transition hover:border-cyan/60 disabled:opacity-40"
            >
              Registrar ponto (P, V, T)
            </button>
            {points.length > 0 && (
              <div className="space-y-1 font-mono text-[11px] text-slate-400">
                <div className="grid grid-cols-4 gap-1 text-slate-500">
                  <span>P (atm)</span>
                  <span>V (nm³)</span>
                  <span>T (K)</span>
                  <span>PV/NT</span>
                </div>
                {points.map((p, i) => (
                  <div key={i} className="grid grid-cols-4 gap-1">
                    <span>{fmt(p.P / ATM, 2)}</span>
                    <span>{fmt(p.V * 1e27, 0)}</span>
                    <span>{fmt(p.T, 0)}</span>
                    <span className="text-slate-200">{fmt((p.P * p.V) / (p.N * p.T) / 1e-23, 3)}e-23</span>
                  </div>
                ))}
                <Note>PV/(NT) fica constante: é a constante de Boltzmann k = 1,381×10⁻²³ J/K (e R = k·Nₐ = {fmt(R_GAS, 3)} J/mol·K).</Note>
              </div>
            )}
          </Section>
          <VerifyTable
            empty="Aguardando 300 ps de medição…"
            rows={[
              { formula: 'P = N·k·T/V  (impulso nas paredes)', theory: Pt, sim: settled ? Pm : null, digits: 0, tol: 0.03, note: 'Acumulando choques com as paredes…' },
              { formula: '(3/2)·k·T = ⟨½·m·v²⟩', theory: T, sim: Tk, digits: 3, tol: 1e-9 },
            ]}
          />
          <Section title="Dados" right={<ExportButton onClick={exportar} />}>
            <Note>
              Mesmo N, T e V dão a mesma pressão para qualquer gás: as partículas mais leves são mais rápidas, mas cada choque transfere menos momento. A tolerância de 3% vem da média estatística dos choques.
            </Note>
          </Section>
        </>
      }
    />
  );
}
