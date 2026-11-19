import { useState } from 'react';
import ModuleShell from '../../shell/ModuleShell';
import Scene from '../../core/Scene';
import TimeChart from '../../core/TimeChart';
import { useStepper, type Sample } from '../../core/stepper';
import { COLORS, clear, fitView, type View } from '../../core/canvas';
import { fmt } from '../../core/format';
import { buildModuleExport, downloadJson, stamp } from '../../core/export';
import { Chip, ExportButton, Note, Playback, Section, Slider, VerifyTable } from '../../ui/controls';
import { equivalent, rcCurrent, rcExactVc, rcTau, solveDC, stepRC, type RCState, type Topology } from './physics';
import { param, choice } from '../../core/params';

type Mode = Topology | 'rc';
type Pt = [number, number];
type Seg = { pts: Pt[]; cur: number };

const MODES: { id: Mode; label: string }[] = [
  { id: 'serie', label: 'Série' },
  { id: 'paralelo', label: 'Paralelo' },
  { id: 'misto', label: 'Misto' },
  { id: 'rc', label: 'Capacitor (RC)' },
];

const SPACING = 0.5; // distância entre cargas desenhadas (unidades do esquema)

function pathLength(pts: Pt[]) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

function pointAt(pts: Pt[], s: number): Pt {
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (s <= l) return [pts[i - 1][0] + ((pts[i][0] - pts[i - 1][0]) * s) / l, pts[i - 1][1] + ((pts[i][1] - pts[i - 1][1]) * s) / l];
    s -= l;
  }
  return pts[pts.length - 1];
}

export default function CircuitosModule() {
  const [mode, setMode] = useState<Mode>(() => choice('mode', 'serie', MODES.map((m) => m.id)));
  const [emf, setEmf] = useState(() => param('emf', 12));
  const [r, setR] = useState(() => param('r', 0.5));
  const [R1, setR1] = useState(() => param('R1', 10));
  const [R2, setR2] = useState(() => param('R2', 20));
  const [R3, setR3] = useState(() => param('R3', 30));
  const [Rrc, setRrc] = useState(() => param('Rrc', 10));
  const [Cm, setCm] = useState(() => param('Cm', 200)); // mF
  const [charging, setCharging] = useState(true);
  const [hours, setHours] = useState(() => param('hours', 5));
  const [tarifa, setTarifa] = useState(() => param('tarifa', 0.85));

  const isRC = mode === 'rc';
  const topo: Topology = isRC ? 'serie' : mode;
  const dcp = { emf, r: Math.max(r, 1e-4), R1, R2, R3 };
  const dc = solveDC(topo, dcp);
  const Req = equivalent(topo, dcp);
  const rcp = { emf, r: Math.max(r, 1e-4), R: Rrc, C: Cm / 1000, charging };
  const tau = rcTau(rcp);

  // trechos de fio com a corrente de cada um (sentido convencional)
  const I = dc.I;
  const segs: Seg[] =
    mode === 'serie'
      ? [{ pts: [[1, 1], [1, 5], [9, 5], [9, 1], [1, 1]], cur: I.r }]
      : mode === 'paralelo'
        ? [
            { pts: [[1, 1], [1, 5], [4, 5]], cur: I.r },
            { pts: [[4, 5], [6, 5]], cur: I.R2 + I.R3 },
            { pts: [[6, 5], [8, 5]], cur: I.R3 },
            { pts: [[4, 5], [4, 1]], cur: I.R1 },
            { pts: [[6, 5], [6, 1]], cur: I.R2 },
            { pts: [[8, 5], [8, 1]], cur: I.R3 },
            { pts: [[8, 1], [6, 1]], cur: I.R3 },
            { pts: [[6, 1], [4, 1]], cur: I.R2 + I.R3 },
            { pts: [[4, 1], [1, 1]], cur: I.r },
          ]
        : mode === 'misto'
          ? [
              { pts: [[1, 1], [1, 5], [6, 5]], cur: I.r },
              { pts: [[6, 5], [8.5, 5]], cur: I.R3 },
              { pts: [[6, 5], [6, 1]], cur: I.R2 },
              { pts: [[8.5, 5], [8.5, 1]], cur: I.R3 },
              { pts: [[8.5, 1], [6, 1]], cur: I.R3 },
              { pts: [[6, 1], [1, 1]], cur: I.r },
            ]
          : [{ pts: [[1, 1], [1, 5], [9, 5], [9, 1], [1, 1]], cur: 0 }];

  const Iref = isRC ? Math.abs(rcCurrent(rcp, charging ? 0 : rcp.C * emf)) : Math.abs(I.r);
  const speedK = 1.6 / Math.max(Iref, 1e-9); // unidades/s por ampère: a maior corrente anda 1,6 un/s

  const sim = useStepper<{ phase: number[]; rc: RCState }>({
    create: () => ({ phase: [0, 0, 0, 0, 0, 0, 0, 0, 0], rc: { q: charging ? 0 : rcp.C * emf, Ebat: 0, Ediss: 0 } }),
    step: (s, h) => {
      if (isRC) {
        const rc = stepRC(rcp, s.rc, h);
        const i = rcCurrent(rcp, rc.q);
        return { phase: s.phase.map((ph) => ph + i * speedK * h * (1 / Math.max(tau / 1.5, 1e-9))), rc };
      }
      return { phase: s.phase.map((ph, k) => ph + (segs[k]?.cur ?? 0) * speedK * h), rc: s.rc };
    },
    sample: (s) => {
      const Vc = s.rc.q / rcp.C;
      const i = rcCurrent(rcp, s.rc.q);
      return { Vc, VR: i * Rrc, i, Ebat: s.rc.Ebat, Ec: 0.5 * rcp.C * Vc * Vc, Ed: s.rc.Ediss };
    },
    dt: isRC ? tau / 400 : 1 / 120,
    sampleEvery: isRC ? tau / 40 : 1 / 10,
    tEnd: isRC ? 6 * tau : undefined,
    timeScale: isRC ? tau / 1.5 : 1,
    resetKey: isRC ? [mode, emf, r, Rrc, Cm, charging] : [mode],
    autoplay: true,
  });

  const rcS = sim.state.rc;
  const Vc = rcS.q / rcp.C;
  const iNow = rcCurrent(rcp, rcS.q);
  const Ec = 0.5 * rcp.C * Vc * Vc;

  // τ medido: instante em que V_C cruza 63,2% (carga) ou 36,8% (descarga) de ε
  const target = emf * (charging ? 1 - Math.exp(-1) : Math.exp(-1));
  let tauMeas: number | null = null;
  const hist = sim.history as Sample[];
  for (let k = 1; k < hist.length && isRC; k++) {
    const a = hist[k - 1].Vc - target;
    const b = hist[k].Vc - target;
    if (a === 0 || a * b < 0) {
      tauMeas = hist[k - 1].t + (a / (a - b)) * (hist[k].t - hist[k - 1].t);
      break;
    }
  }

  const powerExt = isRC ? 0 : dc.power.R1 + dc.power.R2 + dc.power.R3;
  const kwhMes = (powerExt * hours * 30) / 1000;

  const draw = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    clear(ctx, W, H);
    const v: View = fitView(W, H, { x0: -1.4, x1: 11.4, y0: 0.2, y1: 6 }, { l: 20, r: 20, t: 120, b: 24 });
    const P = (p: Pt) => [v.X(p[0]), v.Y(p[1])] as const;

    // fios
    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    for (const sg of segs) {
      ctx.beginPath();
      sg.pts.forEach((p, i) => (i ? ctx.lineTo(...P(p)) : ctx.moveTo(...P(p))));
      ctx.stroke();
    }
    // nós
    ctx.fillStyle = '#94A3B8';
    const junctions: Pt[] = mode === 'paralelo' ? [[4, 5], [6, 5], [4, 1], [6, 1]] : mode === 'misto' ? [[6, 5], [6, 1]] : [];
    for (const j of junctions) {
      ctx.beginPath();
      ctx.arc(...P(j), 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // cargas em movimento (sentido convencional)
    ctx.fillStyle = COLORS.cyan;
    segs.forEach((sg, k) => {
      const L = pathLength(sg.pts);
      const ph = sim.state.phase[k] ?? 0;
      const off = ((ph % SPACING) + SPACING) % SPACING;
      for (let s = off; s < L; s += SPACING) {
        const [x, y] = P(pointAt(sg.pts, s));
        ctx.beginPath();
        ctx.arc(x, y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    const maxP = Math.max(dc.power.R1, dc.power.R2, dc.power.R3, 1e-9);
    const resistor = (c: Pt, vertical: boolean, name: string, R: number, Ii: number, Vv: number, Pw: number) => {
      const [cx, cy] = P(c);
      const len = 0.62 * v.s;
      const wd = 0.22 * v.s;
      const glow = isRC ? 0.25 : Pw / maxP;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, len * 1.3);
      g.addColorStop(0, `rgba(245,158,11,${0.55 * glow})`);
      g.addColorStop(1, 'rgba(245,158,11,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - len * 1.3, cy - len * 1.3, len * 2.6, len * 2.6);
      ctx.fillStyle = COLORS.bg;
      if (vertical) ctx.fillRect(cx - wd, cy - len, wd * 2, len * 2);
      else ctx.fillRect(cx - len, cy - wd, len * 2, wd * 2);
      ctx.strokeStyle = COLORS.amber;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      const n = 8;
      for (let i = 0; i <= n; i++) {
        const u = -len + (2 * len * i) / n;
        const w = i === 0 || i === n ? 0 : i % 2 ? wd * 0.8 : -wd * 0.8;
        if (vertical) i ? ctx.lineTo(cx + w, cy + u) : ctx.moveTo(cx + w, cy + u);
        else i ? ctx.lineTo(cx + u, cy + w) : ctx.moveTo(cx + u, cy + w);
      }
      ctx.stroke();
      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = vertical ? 'left' : 'center';
      ctx.textBaseline = vertical ? 'middle' : 'bottom';
      const tx = vertical ? cx + wd + 8 : cx;
      const ty = vertical ? cy - 8 : cy - wd - 18;
      ctx.fillText(`${name} = ${fmt(R, R < 10 ? 1 : 0)} Ω`, tx, ty);
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(`${fmt(Math.abs(Ii), 3)} A · ${fmt(Math.abs(Vv), 2)} V`, tx, ty + 14);
    };

    // bateria
    const [bx, by] = P([1, 3]);
    const off = !isRC || charging;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(bx - 22, by - 14, 44, 28);
    if (off) {
      ctx.strokeStyle = COLORS.text;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bx - 20, by - 8);
      ctx.lineTo(bx + 20, by - 8);
      ctx.stroke();
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(bx - 10, by + 8);
      ctx.lineTo(bx + 10, by + 8);
      ctx.stroke();
      ctx.font = '600 12px "JetBrains Mono", monospace';
      ctx.fillStyle = COLORS.rose;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('+', bx + 24, by - 10);
      ctx.fillStyle = COLORS.cyan;
      ctx.fillText('−', bx + 24, by + 10);
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = 'right';
      ctx.fillText(`ε = ${fmt(emf, 1)} V`, bx - 28, by - 6);
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(`r = ${fmt(r, 2)} Ω`, bx - 28, by + 10);
    } else {
      ctx.strokeStyle = '#64748B';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bx, by - 14);
      ctx.lineTo(bx, by + 14);
      ctx.stroke();
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText('bateria fora (curto)', bx - 10, by);
    }

    if (mode === 'serie') {
      resistor([3.5, 5], false, 'R1', R1, I.R1, dc.volt.R1, dc.power.R1);
      resistor([6.5, 5], false, 'R2', R2, I.R2, dc.volt.R2, dc.power.R2);
      resistor([9, 3], true, 'R3', R3, I.R3, dc.volt.R3, dc.power.R3);
    } else if (mode === 'paralelo') {
      resistor([4, 3], true, 'R1', R1, I.R1, dc.volt.R1, dc.power.R1);
      resistor([6, 3], true, 'R2', R2, I.R2, dc.volt.R2, dc.power.R2);
      resistor([8, 3], true, 'R3', R3, I.R3, dc.volt.R3, dc.power.R3);
    } else if (mode === 'misto') {
      resistor([3.5, 5], false, 'R1', R1, I.R1, dc.volt.R1, dc.power.R1);
      resistor([6, 3], true, 'R2', R2, I.R2, dc.volt.R2, dc.power.R2);
      resistor([8.5, 3], true, 'R3', R3, I.R3, dc.volt.R3, dc.power.R3);
    } else {
      resistor([5, 5], false, 'R', Rrc, iNow, iNow * Rrc, iNow * iNow * Rrc);
      // capacitor
      const [cx, cy] = P([9, 3]);
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(cx - 30, cy - 10, 60, 20);
      ctx.strokeStyle = COLORS.violet;
      ctx.lineWidth = 3;
      for (const dy of [-7, 7]) {
        ctx.beginPath();
        ctx.moveTo(cx - 26, cy + dy);
        ctx.lineTo(cx + 26, cy + dy);
        ctx.stroke();
      }
      const frac = Math.min(1, Math.abs(Vc) / emf);
      const nq = Math.round(frac * 6);
      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let k = 0; k < nq; k++) {
        const x = cx - 22 + (k * 44) / 5;
        ctx.fillStyle = COLORS.rose;
        ctx.fillText('+', x, cy - 17);
        ctx.fillStyle = COLORS.cyan;
        ctx.fillText('−', x, cy + 17);
      }
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = 'left';
      ctx.fillText(`C = ${fmt(Cm, 0)} mF`, cx + 34, cy - 8);
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(`V_C = ${fmt(Vc, 2)} V`, cx + 34, cy + 8);
    }

    // legenda
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = COLORS.label;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('● carga em movimento, sentido convencional da corrente', 16, H - 10);
  };

  const exportar = () =>
    downloadJson(
      `circuitos_${stamp()}.json`,
      buildModuleExport(
        isRC
          ? {
              modulo: 'circuitos',
              titulo: 'Circuito RC',
              metodo: "RK4 em q'(t) = (ε − q/C)/(R + r), integrando também a energia da bateria e a dissipada",
              unidades: { t: 's', Vc: 'V', VR: 'V', i: 'A', Ebat: 'J', Ec: 'J', Ed: 'J' },
              parametros: { emf, r, R: Rrc, C_mF: Cm, carregando: charging },
              resultados: { tau, tauMedido: tauMeas, VcFinal: Vc },
              verificacao: tauMeas !== null ? [{ grandeza: 'τ = (R + r)·C', teorico: tau, simulado: tauMeas }] : [],
              serie: hist,
            }
          : {
              modulo: 'circuitos',
              titulo: `Associação ${mode}`,
              metodo: 'Análise nodal modificada (MNA) resolvida por eliminação de Gauss',
              unidades: { corrente: 'A', tensao: 'V', potencia: 'W', resistencia: 'Ω' },
              parametros: { associacao: mode, emf, r, R1, R2, R3 },
              resultados: {
                Req,
                correnteTotal: I.r,
                tensaoTerminais: dc.terminal,
                I1: I.R1,
                I2: I.R2,
                I3: I.R3,
                U1: dc.volt.R1,
                U2: dc.volt.R2,
                U3: dc.volt.R3,
                potenciaUtil: powerExt,
                consumoMensal_kWh: kwhMes,
              },
              verificacao: [
                { grandeza: 'i = ε/(Req + r)', teorico: emf / (Req + dcp.r), simulado: I.r },
                { grandeza: 'ε·i = Σ R·i² (potência)', teorico: emf * I.r, simulado: powerExt + dc.power.r },
              ],
              serie: [],
            },
      ),
    );

  const reqFormula = mode === 'serie' ? 'Req = R1 + R2 + R3' : mode === 'paralelo' ? '1/Req = 1/R1 + 1/R2 + 1/R3' : 'Req = R1 + R2·R3/(R2 + R3)';
  const junctionSum = mode === 'paralelo' ? I.R1 + I.R2 + I.R3 : mode === 'misto' ? I.R2 + I.R3 : I.R1;

  return (
    <ModuleShell
      title="Circuitos Elétricos"
      tema="Ohm, associações, potência e capacitor"
      status={
        isRC
          ? sim.playing
            ? { text: charging ? 'Carregando o capacitor' : 'Descarregando', tone: 'run' }
            : sim.finished
              ? { text: 'Regime permanente (6τ)', tone: 'done' }
              : { text: sim.t > 0 ? 'Pausado' : 'Pronto', tone: sim.t > 0 ? 'pause' : 'idle' }
          : { text: 'Corrente contínua', tone: 'run' }
      }
      keys={{ toggle: sim.toggle, step: sim.stepFrame, reset: sim.reset }}
      stats={
        isRC
          ? [
              { label: 'Tempo', value: fmt(sim.t, 2), unit: 's' },
              { label: 'Tensão no capacitor', value: fmt(Vc, 2), unit: 'V', accent: true },
              { label: 'Corrente', value: fmt(iNow * 1000, 0), unit: 'mA' },
              { label: 'Constante de tempo', value: fmt(tau, 2), unit: 's' },
            ]
          : [
              { label: 'Corrente total', value: fmt(I.r, 3), unit: 'A', accent: true },
              { label: 'Req', value: fmt(Req, 2), unit: 'Ω' },
              { label: 'Tensão nos terminais', value: fmt(dc.terminal, 2), unit: 'V' },
              { label: 'Potência útil', value: fmt(powerExt, 1), unit: 'W' },
            ]
      }
      scene={<Scene draw={draw} label="Esquema do circuito com bateria, resistores, cargas em movimento e leituras de corrente e tensão" />}
      charts={
        isRC ? (
          <>
            <TimeChart title="Tensões" unit="V" data={hist} series={[{ key: 'Vc', label: 'V_C', color: COLORS.violet }, { key: 'VR', label: 'V_R', color: COLORS.amber }]} window={null} />
            <TimeChart title="Corrente" unit="A" data={hist} series={[{ key: 'i', label: 'i', color: COLORS.cyan }]} window={null} />
            <TimeChart
              title="Energia"
              unit="J"
              data={hist}
              series={[
                { key: 'Ebat', label: 'bateria', color: COLORS.green },
                { key: 'Ec', label: 'capacitor', color: COLORS.violet },
                { key: 'Ed', label: 'dissipada', color: COLORS.rose },
              ]}
              window={null}
            />
          </>
        ) : undefined
      }
      panel={
        <>
          <Section title="Circuito">
            <div className="flex flex-wrap gap-1.5">
              {MODES.map((m) => (
                <Chip key={m.id} active={mode === m.id} onClick={() => setMode(m.id)}>
                  {m.label}
                </Chip>
              ))}
            </div>
          </Section>
          {isRC && <Playback playing={sim.playing} finished={sim.finished} onToggle={sim.toggle} onStep={sim.stepFrame} onReset={sim.reset} speed={sim.speed} setSpeed={sim.setSpeed} />}
          <Section title="Bateria">
            <Slider label="Força eletromotriz" symbol="ε" value={emf} min={1} max={24} step={0.5} unit="V" onChange={setEmf} />
            <Slider label="Resistência interna" symbol="r" value={r} min={0} max={5} step={0.1} unit="Ω" digits={1} accent="#FB7185" onChange={setR} />
          </Section>
          {isRC ? (
            <Section title="Resistor e capacitor">
              <div className="flex gap-1.5">
                <Chip active={charging} onClick={() => setCharging(true)}>Carregar</Chip>
                <Chip active={!charging} onClick={() => setCharging(false)}>Descarregar</Chip>
              </div>
              <Slider label="Resistência" symbol="R" value={Rrc} min={1} max={50} step={1} unit="Ω" digits={0} accent="#F59E0B" onChange={setRrc} />
              <Slider label="Capacitância" symbol="C" value={Cm} min={10} max={1000} step={10} unit="mF" digits={0} accent="#A78BFA" onChange={setCm} />
            </Section>
          ) : (
            <Section title="Resistores">
              <Slider label="Resistor 1" symbol="R1" value={R1} min={1} max={100} step={1} unit="Ω" digits={0} accent="#F59E0B" onChange={setR1} />
              <Slider label="Resistor 2" symbol="R2" value={R2} min={1} max={100} step={1} unit="Ω" digits={0} accent="#F59E0B" onChange={setR2} />
              <Slider label="Resistor 3" symbol="R3" value={R3} min={1} max={100} step={1} unit="Ω" digits={0} accent="#F59E0B" onChange={setR3} />
            </Section>
          )}
          <VerifyTable
            empty="Inicie a carga e espere V_C passar de 63%."
            rows={
              isRC
                ? [
                    { formula: 'τ = (R + r)·C  (V_C a 63,2% de ε)', theory: tau, sim: tauMeas, digits: 4, tol: 1e-3 },
                    { formula: 'V_C(t) = ε(1 − e^(−t/τ))', theory: rcExactVc(rcp, sim.t), sim: Vc, digits: 4, tol: 1e-6 },
                    ...(charging
                      ? [{ formula: 'E_bateria = E_capacitor + E_dissipada', theory: rcS.Ebat, sim: Ec + rcS.Ediss, digits: 4, tol: 1e-6 }]
                      : [{ formula: 'E_dissipada = ½Cε² − E_capacitor', theory: 0.5 * rcp.C * emf * emf - Ec, sim: rcS.Ediss, digits: 4, tol: 1e-6 }]),
                  ]
                : [
                    { formula: `i = ε/(Req + r), ${reqFormula}`, theory: emf / (Req + dcp.r), sim: I.r, digits: 4, tol: 1e-9 },
                    { formula: mode === 'serie' ? 'Série: mesma corrente em todos' : 'Nó: corrente que entra = que sai', theory: I.r, sim: junctionSum, digits: 4, tol: 1e-9 },
                    { formula: 'ε·i = Σ R·i² (inclui r)', theory: emf * I.r, sim: powerExt + dc.power.r, digits: 4, tol: 1e-9 },
                  ]
            }
          />
          {!isRC && (
            <Section title="Consumo de energia">
              <Slider label="Uso por dia" symbol="h" value={hours} min={0} max={24} step={0.5} unit="h" accent="#34D399" onChange={setHours} />
              <Slider label="Tarifa" symbol="R$" value={tarifa} min={0.3} max={1.5} step={0.01} unit="/kWh" digits={2} accent="#34D399" onChange={setTarifa} />
              <Note>
                E = P·Δt = {fmt(powerExt, 1)} W × {fmt(hours, 1)} h × 30 dias = <span className="font-mono text-slate-200">{fmt(kwhMes, 2)} kWh/mês</span>, cerca de{' '}
                <span className="font-mono text-slate-200">R$ {fmt(kwhMes * tarifa, 2)}</span>.
              </Note>
            </Section>
          )}
          <Section title="Dados" right={<ExportButton onClick={exportar} />}>
            <Note>
              {isRC
                ? 'Na carga, metade da energia fornecida pela bateria fica no capacitor (½Cε²) e a outra metade vira calor nos resistores, qualquer que seja R.'
                : 'As correntes são calculadas por análise nodal (leis de Kirchhoff resolvidas como sistema linear). Os resistores brilham proporcionalmente à potência dissipada.'}
            </Note>
          </Section>
        </>
      }
    />
  );
}
