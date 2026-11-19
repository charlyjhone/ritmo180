import { useState } from 'react';
import ModuleShell from '../../shell/ModuleShell';
import Scene from '../../core/Scene';
import TimeChart from '../../core/TimeChart';
import { rk4, useStepper } from '../../core/stepper';
import { COLORS, arrow, clear } from '../../core/canvas';
import { fmt } from '../../core/format';
import { buildModuleExport, downloadJson, stamp } from '../../core/export';
import { Chip, ExportButton, Note, Playback, Section, Slider, VerifyTable } from '../../ui/controls';
import { C_PRE, type Climate, derivs, effectiveT, emissivity, equilibrium, fluxes } from './physics';
import { param } from '../../core/params';

const T_END = 80; // anos
const S_REF = 1361;
const ALB_REF = 0.3;
const PRESETS = [
  { label: 'Pré-industrial', ppm: 280 },
  { label: 'Hoje', ppm: 420 },
  { label: '2× CO₂', ppm: 560 },
  { label: '4× CO₂', ppm: 1120 },
];
const K2C = (k: number) => k - 273.15;

export default function EstufaModule() {
  const [ppm, setPpm] = useState(() => param('ppm', 560));
  const [albedo, setAlbedo] = useState(() => param('albedo', ALB_REF));
  const [S, setS] = useState(() => param('S', S_REF));
  const climate: Climate = { S, albedo, eps: emissivity(ppm) };
  const start = equilibrium(S_REF, ALB_REF, emissivity(C_PRE));
  const eq = equilibrium(S, albedo, climate.eps);

  const sim = useStepper<{ Ts: number; Ta: number }>({
    create: () => ({ Ts: start.Ts, Ta: start.Ta }),
    step: (s, h) => {
      const [Ts, Ta] = rk4([s.Ts, s.Ta], h, ([a, b]) => derivs(climate, a, b));
      return { Ts, Ta };
    },
    sample: (s) => {
      const f = fluxes(climate, s.Ts, s.Ta);
      return { Ts: K2C(s.Ts), Ta: K2C(s.Ta), abs: f.absorbed, olr: f.olr };
    },
    tEnd: T_END,
    dt: 0.005,
    sampleEvery: 0.2,
    timeScale: 6,
    resetKey: [ppm, albedo, S],
  });

  const { Ts, Ta } = sim.state;
  const f = fluxes(climate, Ts, Ta);
  const done = sim.finished;

  const draw = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    clear(ctx, W, H);
    const top = 112;
    const ground = H - 70;
    const atmY0 = top + (ground - top) * 0.32;
    const atmY1 = top + (ground - top) * 0.52;
    // céu e atmosfera
    ctx.fillStyle = 'rgba(56,189,248,0.05)';
    ctx.fillRect(0, top, W, ground - top);
    ctx.fillStyle = `rgba(167,139,250,${(0.12 + 0.35 * climate.eps).toFixed(3)})`;
    ctx.fillRect(0, atmY0, W, atmY1 - atmY0);
    ctx.font = '600 12px "JetBrains Mono", monospace';
    ctx.fillStyle = COLORS.violet;
    ctx.textAlign = 'left';
    ctx.fillText(`atmosfera · ε = ${fmt(climate.eps, 3)} · ${ppm} ppm CO₂ · Ta = ${fmt(K2C(Ta), 1)} °C`, 14, atmY0 + 18);
    // superfície
    const iceFrac = Math.max(0, Math.min(1, (albedo - 0.1) / 0.5));
    const grd = ctx.createLinearGradient(0, ground, W, ground);
    grd.addColorStop(0, '#1E3A5F');
    grd.addColorStop(0.55, '#14532D');
    grd.addColorStop(Math.max(0.56, 1 - iceFrac * 0.5), '#3F6212');
    grd.addColorStop(1, iceFrac > 0.05 ? '#E2E8F0' : '#3F6212');
    ctx.fillStyle = grd;
    ctx.fillRect(0, ground, W, H - ground);
    ctx.fillStyle = COLORS.text;
    ctx.fillText(`superfície · Ts = ${fmt(K2C(Ts), 2)} °C · albedo ${fmt(albedo, 2)}`, 14, ground + 22);
    // setas com largura ∝ fluxo
    const w = (F: number) => 1 + F / 28;
    const lab = (t: string, x: number, y: number, c: string) => {
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = c;
      ctx.textAlign = 'center';
      ctx.fillText(t, x, y);
    };
    const xs = [0.12, 0.27, 0.45, 0.63, 0.8].map((u) => u * W);
    arrow(ctx, xs[0], top + 6, xs[0], ground - 4, '#FDE047', w(f.solarIn));
    lab(`Sol ${fmt(f.solarIn, 0)}`, xs[0], top + 2 + 0, '#FDE047');
    arrow(ctx, xs[1], ground - 4, xs[1], top + 14, '#FEF9C3', w(f.reflected), true);
    lab(`refletido ${fmt(f.reflected, 0)}`, xs[1], top + 8, '#FEF9C3');
    arrow(ctx, xs[2], ground - 4, xs[2], atmY1 + 2, COLORS.rose, w(f.surface));
    lab(`superfície ${fmt(f.surface, 0)}`, xs[2], ground - 10 - 0, COLORS.rose);
    arrow(ctx, xs[2] + 18, atmY0, xs[2] + 18, top + 14, COLORS.rose, w(f.transmitted), true);
    lab(`atravessa ${fmt(f.transmitted, 0)}`, xs[2] + 18, top + 8, COLORS.rose);
    arrow(ctx, xs[3], atmY0, xs[3], top + 14, COLORS.violet, w(f.atm));
    lab(`↑ ${fmt(f.atm, 0)}`, xs[3], top + 8, COLORS.violet);
    arrow(ctx, xs[4], atmY1, xs[4], ground - 4, COLORS.violet, w(f.atm));
    lab(`retorno ${fmt(f.atm, 0)}`, xs[4], ground - 10, COLORS.violet);
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = COLORS.label;
    ctx.textAlign = 'right';
    ctx.fillText(`W/m² · entra ${fmt(f.absorbed, 1)} · sai (OLR) ${fmt(f.olr, 1)} · ano ${fmt(sim.t, 1)}`, W - 12, H - 10);
  };

  const exportar = () =>
    downloadJson(
      `estufa_${stamp()}.json`,
      buildModuleExport({
        modulo: 'estufa',
        titulo: `Modelo de uma camada · ${ppm} ppm`,
        metodo: 'Duas temperaturas (superfície e atmosfera) com balanço radiativo de Stefan–Boltzmann (RK4, passo 0,005 ano)',
        unidades: { t: 'ano', Ts: '°C', Ta: '°C', abs: 'W/m²', olr: 'W/m²' },
        parametros: { CO2_ppm: ppm, albedo, S, epsilon: climate.eps },
        resultados: { Ts_final_C: K2C(Ts), Ta_final_C: K2C(Ta), Ts_eq_C: K2C(eq.Ts), aquecimento_C: eq.Ts - start.Ts },
        verificacao: [{ grandeza: 'Ts de equilíbrio (K)', teorico: eq.Ts, simulado: Ts }],
        serie: sim.history,
      }),
    );

  return (
    <ModuleShell
      title="Efeito Estufa"
      tema="Balanço radiativo, CO₂, albedo"
      status={sim.playing ? { text: 'Aquecendo', tone: 'run' } : done ? { text: `Equilíbrio após ${T_END} anos`, tone: 'done' } : { text: sim.t > 0 ? 'Pausado' : 'Pronto', tone: sim.t > 0 ? 'pause' : 'idle' }}
      keys={{ toggle: sim.toggle, step: sim.stepFrame, reset: sim.reset }}
      stats={[
        { label: 'Temperatura da superfície', value: fmt(K2C(Ts), 2), unit: '°C', accent: true },
        { label: 'Sem efeito estufa', value: fmt(K2C(effectiveT(S, albedo)), 1), unit: '°C' },
        { label: 'Aquecimento previsto', value: fmt(eq.Ts - start.Ts, 2), unit: '°C' },
        { label: 'Desequilíbrio', value: fmt(f.absorbed - f.olr, 2), unit: 'W/m²' },
      ]}
      scene={<Scene draw={draw} label="Fluxos de radiação entre Sol, atmosfera e superfície, com largura proporcional à intensidade" />}
      charts={
        <>
          <TimeChart title="Temperaturas" unit="°C" data={sim.history} series={[{ key: 'Ts', label: 'superfície', color: COLORS.rose }, { key: 'Ta', label: 'atmosfera', color: COLORS.violet }]} window={null} tUnit="ano" zero={false} />
          <TimeChart title="Balanço no topo" unit="W/m²" data={sim.history} series={[{ key: 'abs', label: 'absorvido', color: '#FDE047' }, { key: 'olr', label: 'emitido (OLR)', color: COLORS.cyan }]} window={null} tUnit="ano" zero={false} />
        </>
      }
      panel={
        <>
          <Playback playing={sim.playing} finished={sim.finished} onToggle={sim.toggle} onStep={sim.stepFrame} onReset={sim.reset} speed={sim.speed} setSpeed={sim.setSpeed} startLabel="Simular" />
          <Section title="Gás carbônico">
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <Chip key={p.ppm} active={ppm === p.ppm} onClick={() => setPpm(p.ppm)}>
                  {p.label}
                </Chip>
              ))}
            </div>
            <Slider label="Concentração de CO₂" symbol="C" value={ppm} min={140} max={1500} step={10} unit="ppm" digits={0} accent={COLORS.violet} hint={`forçamento 5,35·ln(C/280) = ${fmt(5.35 * Math.log(ppm / C_PRE), 2)} W/m²`} onChange={setPpm} />
          </Section>
          <Section title="Planeta">
            <Slider label="Albedo" symbol="α" value={albedo} min={0.1} max={0.6} step={0.01} unit="" digits={2} accent="#E2E8F0" hint="gelo e nuvens refletem; oceano e florestas absorvem" onChange={setAlbedo} />
            <Slider label="Constante solar" symbol="S" value={S} min={1300} max={1420} step={1} unit="W/m²" digits={0} accent="#FDE047" onChange={setS} />
          </Section>
          <VerifyTable
            empty="Simule para comparar."
            rows={[
              { formula: 'Ts = Te·(2/(2−ε))^¼  (K)', theory: eq.Ts, sim: done ? Ts : null, digits: 4, tol: 1e-5, note: 'Aguardando o equilíbrio…' },
              { formula: 'Ta = Ts/2^¼  (K)', theory: done ? Ts / 2 ** 0.25 : null, sim: done ? Ta : null, digits: 4, tol: 1e-5, note: 'Aguardando o equilíbrio…' },
              { formula: 'S(1−α)/4 = OLR  (W/m²)', theory: f.absorbed, sim: done ? f.olr : null, digits: 4, tol: 1e-5, note: 'Aguardando o equilíbrio…' },
            ]}
          />
          <Section title="Dados" right={<ExportButton onClick={exportar} />}>
            <Note>
              Modelo de uma camada: a atmosfera deixa passar a luz do Sol, mas absorve a fração ε do infravermelho da superfície e reemite metade para baixo. Mais CO₂ aumenta ε e a Terra aquece até voltar ao equilíbrio (entra = sai). O oceano (camada de mistura) dá a inércia de alguns anos.
            </Note>
          </Section>
        </>
      }
    />
  );
}
