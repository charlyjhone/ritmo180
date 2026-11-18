import { useState } from 'react';
import ModuleShell from '../../shell/ModuleShell';
import Scene from '../../core/Scene';
import TimeChart from '../../core/TimeChart';
import { upwardZeroCrossings, useStepper, type Sample } from '../../core/stepper';
import { COLORS, arrow, clear, drawGrid, fitView, pill } from '../../core/canvas';
import { fmt } from '../../core/format';
import { buildModuleExport, downloadJson, stamp } from '../../core/export';
import { Chip, ExportButton, Note, Playback, Section, Slider, Toggle, VerifyTable } from '../../ui/controls';
import { AU_PER_YEAR_KMS, elements, initialState, orbitEnergy, stepOrbit, sweptArea, type OrbitState } from './physics';
import { param } from '../../core/params';

const SECTORS = 12;
const PER_SECTOR = 20;

const PRESETS = [
  { name: 'Terra', M: 1, r0: 1, f: 1 },
  { name: 'Marte', M: 1, r0: 1.524, f: 1 },
  { name: 'Júpiter', M: 1, r0: 5.2, f: 1 },
  { name: 'Cometa', M: 1, r0: 3, f: 0.55 },
];

export default function OrbitasModule() {
  const [M, setM] = useState(() => param('M', 1));
  const [r0, setR0] = useState(() => param('r0', 1));
  const [f, setF] = useState(() => param('f', 0.8));
  const [showSectors, setShowSectors] = useState(true);
  const [showVel, setShowVel] = useState(true);
  const p = { M, r0, f };
  const el = elements(p);
  const sampleEvery = el.T / (SECTORS * PER_SECTOR);

  const sim = useStepper<OrbitState>({
    create: () => initialState(p),
    step: (s, h) => stepOrbit(p, s, h),
    sample: (s) => {
      const r = Math.hypot(s.x, s.y);
      const e = orbitEnergy(p, s);
      return { x: s.x, y: s.y, r, v: Math.hypot(s.vx, s.vy) * AU_PER_YEAR_KMS, K: e.K, U: e.U, E: e.E };
    },
    dt: el.T / 2000,
    sampleEvery,
    timeScale: el.T / 6,
    resetKey: [M, r0, f],
  });

  const st = sim.state;
  const hist = sim.history;
  const rNow = Math.hypot(st.x, st.y);
  const vNow = Math.hypot(st.vx, st.vy);
  const z = upwardZeroCrossings(hist, 'y');
  const Tm = z.length ? z[0] : null;
  const firstOrbit = Tm !== null ? hist.filter((h) => h.t <= Tm + 1e-9) : [];
  const rs = firstOrbit.map((h) => h.r);
  const eMeas = rs.length ? (Math.max(...rs) - Math.min(...rs)) / (Math.max(...rs) + Math.min(...rs)) : null;

  // setores de áreas iguais (Kepler II) na primeira volta
  const sectors: { pts: Sample[]; area: number }[] = [];
  for (let k = 0; k < SECTORS; k++) {
    const pts = hist.slice(k * PER_SECTOR, (k + 1) * PER_SECTOR + 1);
    if (pts.length < PER_SECTOR + 1) break;
    sectors.push({ pts, area: sweptArea(pts) });
  }
  const sectorTheory = (el.L / 2) * (el.T / SECTORS);
  const areas = sectors.map((s) => s.area);
  const worstArea = areas.length ? areas.reduce((w, a) => (Math.abs(a - sectorTheory) > Math.abs(w - sectorTheory) ? a : w), areas[0]) : null;

  const draw = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    clear(ctx, W, H);
    const cxo = -el.a * el.e * (f < 1 ? -1 : 1); // centro da elipse
    const half = Math.max(el.a, el.b) * 1.12;
    const v = fitView(W, H, { x0: cxo - half, x1: cxo + half, y0: -half, y1: half }, { l: 40, r: 40, t: 110, b: 30 });
    drawGrid(ctx, v, W, H, { unit: 'UA', axes: true, labels: true });

    // órbita prevista
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = 'rgba(148,163,184,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(v.X(cxo), v.Y(0), el.a * v.s, el.b * v.s, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // setores
    if (showSectors) {
      sectors.forEach((sec, i) => {
        ctx.fillStyle = i % 2 ? 'rgba(56,189,248,0.16)' : 'rgba(245,158,11,0.16)';
        ctx.beginPath();
        ctx.moveTo(v.X(0), v.Y(0));
        for (const q of sec.pts) ctx.lineTo(v.X(q.x), v.Y(q.y));
        ctx.closePath();
        ctx.fill();
      });
    }

    // rastro
    ctx.strokeStyle = COLORS.cyan;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const tail = hist.slice(-SECTORS * PER_SECTOR);
    tail.forEach((q, i) => (i ? ctx.lineTo(v.X(q.x), v.Y(q.y)) : ctx.moveTo(v.X(q.x), v.Y(q.y))));
    ctx.lineTo(v.X(st.x), v.Y(st.y));
    ctx.stroke();

    // estrela
    const sr = 8 + 4 * Math.cbrt(M);
    const grad = ctx.createRadialGradient(v.X(0), v.Y(0), 0, v.X(0), v.Y(0), sr * 2.4);
    grad.addColorStop(0, 'rgba(253,224,71,1)');
    grad.addColorStop(0.4, 'rgba(245,158,11,0.9)');
    grad.addColorStop(1, 'rgba(245,158,11,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(v.X(0), v.Y(0), sr * 2.4, 0, Math.PI * 2);
    ctx.fill();

    // planeta
    const px = v.X(st.x);
    const py = v.Y(st.y);
    ctx.strokeStyle = 'rgba(167,139,250,0.5)';
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(v.X(0), v.Y(0));
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#60A5FA';
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();
    if (showVel) {
      const k = 70 / (el.L / el.rPeri); // velocidade máxima (periélio) vira 70 px
      arrow(ctx, px, py, px + st.vx * k, py - st.vy * k, COLORS.green, 2.5);
      const ax = -st.x / rNow;
      const ay = -st.y / rNow;
      arrow(ctx, px, py, px + ax * 36, py - ay * 36, COLORS.rose, 2);
    }
    pill(ctx, `periélio ${fmt(el.rPeri, 2)} UA`, v.X(f < 1 ? -el.rPeri : el.rPeri), v.Y(0) + 22, COLORS.muted);
    pill(ctx, `afélio ${fmt(el.rApo, 2)} UA`, v.X(f < 1 ? el.rApo : -el.rApo), v.Y(0) - 22, COLORS.muted);
  };

  const exportar = () =>
    downloadJson(
      `orbitas_${stamp()}.json`,
      buildModuleExport({
        modulo: 'orbitas',
        titulo: 'Gravitação e Órbitas',
        metodo: 'RK4 em (x, y, vx, vy) com subpasso proporcional a r^1,5; unidades UA, ano e massa solar (GM☉ = 4π²)',
        unidades: { t: 'ano', x: 'UA', y: 'UA', r: 'UA', v: 'km/s', K: 'UA²/ano² (por massa)', U: 'UA²/ano² (por massa)', E: 'UA²/ano² (por massa)' },
        parametros: { massaEstrela: M, distanciaInicial: r0, fracaoVelocidadeCircular: f },
        resultados: { semiEixoMaior: el.a, excentricidade: el.e, periodoTeorico: el.T, periodoMedido: Tm, periElio: el.rPeri, afelio: el.rApo },
        verificacao: [
          ...(Tm !== null ? [{ grandeza: 'T² = a³/M (Kepler III)', teorico: el.T, simulado: Tm }] : []),
          ...(worstArea !== null ? [{ grandeza: 'Área por setor = (L/2)·T/12 (Kepler II)', teorico: sectorTheory, simulado: worstArea }] : []),
        ],
        serie: hist,
      }),
    );

  return (
    <ModuleShell
      title="Gravitação e Órbitas"
      tema="Leis de Kepler e Newton"
      status={sim.playing ? { text: 'Em órbita', tone: 'run' } : { text: sim.t > 0 ? 'Pausado' : 'Pronto', tone: sim.t > 0 ? 'pause' : 'idle' }}
      keys={{ toggle: sim.toggle, step: sim.stepFrame, reset: sim.reset }}
      stats={[
        { label: 'Tempo', value: fmt(sim.t, 2), unit: 'anos' },
        { label: 'Distância', value: fmt(rNow, 3), unit: 'UA' },
        { label: 'Velocidade', value: fmt(vNow * AU_PER_YEAR_KMS, 1), unit: 'km/s', accent: true },
        { label: 'Período medido', value: Tm !== null ? fmt(Tm, 3) : '—', unit: 'anos' },
      ]}
      scene={<Scene draw={draw} label="Planeta em órbita elíptica ao redor de uma estrela, com setores de áreas iguais" />}
      charts={
        <>
          <TimeChart title="Distância à estrela" unit="UA" data={hist} series={[{ key: 'r', label: 'r', color: COLORS.violet }]} window={null} tUnit="ano" />
          <TimeChart title="Velocidade orbital" unit="km/s" data={hist} series={[{ key: 'v', label: 'v', color: COLORS.green }]} window={null} tUnit="ano" />
          <TimeChart
            title="Energia por unidade de massa"
            unit="UA²/ano²"
            data={hist}
            series={[
              { key: 'K', label: 'Ec', color: COLORS.green },
              { key: 'U', label: 'Ep', color: COLORS.cyan },
              { key: 'E', label: 'Total', color: COLORS.amber },
            ]}
            window={null}
            tUnit="ano"
          />
        </>
      }
      panel={
        <>
          <Playback playing={sim.playing} onToggle={sim.toggle} onStep={sim.stepFrame} onReset={sim.reset} speed={sim.speed} setSpeed={sim.setSpeed} startLabel="Lançar" />
          <Section title="Exemplos">
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((pr) => (
                <Chip
                  key={pr.name}
                  active={M === pr.M && r0 === pr.r0 && f === pr.f}
                  onClick={() => {
                    setM(pr.M);
                    setR0(pr.r0);
                    setF(pr.f);
                  }}
                >
                  {pr.name}
                </Chip>
              ))}
            </div>
          </Section>
          <Section title="Sistema">
            <Slider label="Massa da estrela" symbol="M" value={M} min={0.2} max={3} step={0.05} unit="M☉" digits={2} onChange={setM} />
            <Slider label="Distância inicial" symbol="r₀" value={r0} min={0.3} max={6} step={0.01} unit="UA" digits={2} onChange={setR0} />
            <Slider
              label="Velocidade inicial"
              symbol="v₀/v_c"
              value={f}
              min={0.5}
              max={1.35}
              step={0.01}
              unit="× circular"
              digits={2}
              accent="#34D399"
              hint={`v₀ = ${fmt(f * Math.sqrt((4 * Math.PI ** 2 * M) / r0) * AU_PER_YEAR_KMS, 1)} km/s. Em 1 o círculo é perfeito; abaixo, r₀ vira o afélio; acima, o periélio.`}
              onChange={setF}
            />
            <Toggle label="Setores de áreas iguais (T/12)" checked={showSectors} onChange={setShowSectors} />
            <Toggle label="Vetores velocidade e aceleração" checked={showVel} onChange={setShowVel} color="#34D399" />
          </Section>
          <VerifyTable
            empty="Lance o planeta e espere uma volta completa."
            rows={[
              { formula: 'T² = a³/M (3ª lei de Kepler)', theory: el.T, sim: Tm, digits: 4, tol: 1e-3 },
              { formula: 'e = (r_máx − r_mín)/(r_máx + r_mín)', theory: el.e, sim: Tm !== null ? eMeas : null, digits: 4, tol: 2e-3 },
              { formula: 'Área de cada setor = (L/2)·T/12 (2ª lei)', theory: sectorTheory, sim: sectors.length === SECTORS ? worstArea : null, digits: 4, tol: 5e-3, note: 'Preenchendo os 12 setores…' },
            ]}
          />
          <Section title="Dados" right={<ExportButton onClick={exportar} />}>
            <Note>
              Semieixo maior a = {fmt(el.a, 3)} UA, excentricidade e = {fmt(el.e, 3)}, período previsto T = {fmt(el.T, 3)} anos. O planeta varre áreas iguais em tempos iguais: rápido no periélio, lento no afélio.
            </Note>
          </Section>
        </>
      }
    />
  );
}
