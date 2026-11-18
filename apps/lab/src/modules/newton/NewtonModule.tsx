import { useState } from 'react';
import ModuleShell from '../../shell/ModuleShell';
import Scene from '../../core/Scene';
import TimeChart from '../../core/TimeChart';
import { useStepper } from '../../core/stepper';
import { COLORS, arrow, clear, drawGrid, fitView, pill } from '../../core/canvas';
import { fmt } from '../../core/format';
import { buildModuleExport, downloadJson, stamp } from '../../core/export';
import { Chip, ExportButton, Note, Playback, Section, Slider, Toggle, VerifyTable } from '../../ui/controls';
import { DEG, forces, stepIncline, type InclineParams } from './physics';
import { params } from '../../core/params';

const L = 12; // comprimento da rampa (m)
const BLOCK = 1; // lado do bloco (m)

const REGIME_PT = { repouso: 'em repouso (atrito estático)', subindo: 'subindo a rampa', descendo: 'descendo a rampa' };

export default function NewtonModule() {
  const [p, setP] = useState<InclineParams>(() => params({ m: 10, thetaDeg: 25, muS: 0.5, muK: 0.3, F: 0, g: 9.81 }));
  const [s0v0, setS0v0] = useState(() => params({ s0: 6, v0: 0 }));
  const [decomp, setDecomp] = useState(true);
  const set = (k: keyof InclineParams) => (v: number) =>
    setP((o) => {
      const n = { ...o, [k]: v };
      if (n.muK > n.muS) n.muK = n.muS;
      return n;
    });

  const sim = useStepper({
    create: () => ({ s: s0v0.s0, v: s0v0.v0 }),
    step: (st, h) => {
      const r = stepIncline(p, st.s, st.v, h);
      if (r.s < BLOCK / 2) return { s: BLOCK / 2, v: 0 };
      if (r.s > L - BLOCK / 2) return { s: L - BLOCK / 2, v: 0 };
      return r;
    },
    sample: (st) => {
      const f = forces(p, st.v);
      return { s: st.s, v: st.v, a: f.a, fat: f.fric };
    },
    until: (st, t) => t > 0.05 && (st.s <= BLOCK / 2 + 1e-9 || st.s >= L - BLOCK / 2 - 1e-9),
    resetKey: [s0v0.s0, s0v0.v0],
  });

  const f = forces(p, sim.state.v);
  const th = p.thetaDeg * DEG;

  const draw = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    clear(ctx, W, H);
    const v = fitView(W, H, { x0: -1, x1: L * Math.cos(th) + 1, y0: -1, y1: Math.max(L * Math.sin(th), 3) + 2.5 }, { l: 50, r: 30, t: 110, b: 40 });
    drawGrid(ctx, v, W, H, { unit: 'm', labels: true });

    // rampa
    const xr = L * Math.cos(th);
    const yr = L * Math.sin(th);
    ctx.fillStyle = '#131B2C';
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(v.X(0), v.Y(0));
    ctx.lineTo(v.X(xr), v.Y(yr));
    ctx.lineTo(v.X(xr), v.Y(0));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // ângulo
    ctx.strokeStyle = 'rgba(245,158,11,0.6)';
    ctx.beginPath();
    ctx.arc(v.X(0), v.Y(0), 46, -th, 0);
    ctx.stroke();
    ctx.fillStyle = COLORS.amber;
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`θ = ${fmt(p.thetaDeg, 0)}°`, v.X(0) + 52, v.Y(0) - 12);

    // bloco
    const s = sim.state.s;
    const bx = s * Math.cos(th);
    const by = s * Math.sin(th);
    const px = v.X(bx);
    const py = v.Y(by);
    const side = BLOCK * v.s;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-th);
    ctx.fillStyle = '#1E293B';
    ctx.strokeStyle = COLORS.cyan;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-side / 2, -side, side, side, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (side > 34) ctx.fillText(`${fmt(p.m, 0)} kg`, 0, -side / 2);
    ctx.restore();

    // diagrama de corpo livre (centro do bloco)
    const cx = px - Math.sin(th) * (side / 2) * 1;
    const cy = py - Math.cos(th) * (side / 2);
    const fmax = Math.max(f.P, Math.abs(p.F), f.N, Math.abs(f.fric), 1);
    const k = 110 / fmax;
    const up = { x: Math.cos(th), y: -Math.sin(th) }; // direção "para cima da rampa" em tela
    const nrm = { x: -Math.sin(th), y: -Math.cos(th) }; // normal saindo da rampa em tela
    const lab = (x: number, y: number, t: string, c: string) => {
      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.fillStyle = c;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t, x, y);
    };
    // peso
    arrow(ctx, cx, cy, cx, cy + f.P * k, COLORS.rose, 2.5);
    lab(cx + 20, cy + f.P * k + 8, `P ${fmt(f.P, 0)} N`, COLORS.rose);
    if (decomp) {
      arrow(ctx, cx, cy, cx + up.x * f.Pt * k, cy + up.y * f.Pt * k, 'rgba(251,113,133,0.7)', 1.5, true);
      arrow(ctx, cx, cy, cx - nrm.x * f.N * k, cy - nrm.y * f.N * k, 'rgba(251,113,133,0.7)', 1.5, true);
    }
    // normal
    arrow(ctx, cx, cy, cx + nrm.x * f.N * k, cy + nrm.y * f.N * k, COLORS.green, 2.5);
    lab(cx + nrm.x * (f.N * k + 18), cy + nrm.y * (f.N * k + 18), `N ${fmt(f.N, 0)} N`, COLORS.green);
    // força aplicada
    if (Math.abs(p.F) > 1e-9) {
      arrow(ctx, cx, cy, cx + up.x * p.F * k, cy + up.y * p.F * k, COLORS.cyan, 2.5);
      lab(cx + up.x * (p.F * k + Math.sign(p.F) * 26), cy + up.y * (p.F * k + Math.sign(p.F) * 26) - 10, `F ${fmt(p.F, 0)} N`, COLORS.cyan);
    }
    // atrito (desenhado na base do bloco)
    if (Math.abs(f.fric) > 1e-9) {
      const fx = px;
      const fy = py;
      arrow(ctx, fx, fy, fx + up.x * f.fric * k, fy + up.y * f.fric * k, COLORS.amber, 2.5);
      lab(fx + up.x * (f.fric * k + Math.sign(f.fric) * 30), fy + up.y * (f.fric * k + Math.sign(f.fric) * 30) + 12, `Fat ${fmt(Math.abs(f.fric), 0)} N`, COLORS.amber);
    }
    pill(ctx, REGIME_PT[f.regime], W - 16, H - 20, f.regime === 'repouso' ? COLORS.muted : COLORS.cyan, 'right');
  };

  // aceleração medida a partir do histórico (diferença finita da velocidade)
  const hs = sim.history;
  let aMeas: number | null = null;
  if (hs.length > 6) {
    const a = hs[hs.length - 6];
    const b = hs[hs.length - 1];
    if (b.t - a.t > 1e-6) aMeas = (b.v - a.v) / (b.t - a.t);
  }
  const theoryA = f.regime === 'repouso' ? 0 : (p.F + f.Pt + f.fric) / p.m;

  const exportar = () =>
    downloadJson(
      `newton_${stamp()}.json`,
      buildModuleExport({
        modulo: 'newton',
        titulo: 'Leis de Newton e Atrito',
        metodo: 'Aceleração constante por trechos (integração exata) com tratamento de parada e atrito estático',
        unidades: { t: 's', s: 'm (ao longo da rampa)', v: 'm/s', a: 'm/s²', fat: 'N' },
        parametros: { ...p, s0: s0v0.s0, v0: s0v0.v0 },
        resultados: { regime: f.regime, normal: f.N, atrito: f.fric, aceleracao: f.a, atritoEstaticoMaximo: f.maxStatic },
        verificacao: aMeas !== null ? [{ grandeza: 'a = ΣF/m', teorico: theoryA, simulado: aMeas }] : [],
        serie: sim.history,
      }),
    );

  const status = sim.playing
    ? { text: `Rodando · ${REGIME_PT[f.regime]}`, tone: 'run' as const }
    : sim.finished
      ? { text: 'O bloco chegou ao fim da rampa', tone: 'done' as const }
      : { text: sim.t > 0 ? 'Pausado' : 'Pronto', tone: sim.t > 0 ? ('pause' as const) : ('idle' as const) };

  return (
    <ModuleShell
      title="Leis de Newton e Atrito"
      tema="Dinâmica no plano inclinado"
      status={status}
      keys={{ toggle: sim.toggle, step: sim.stepFrame, reset: sim.reset }}
      stats={[
        { label: 'Aceleração', value: fmt(f.a), unit: 'm/s²', accent: true },
        { label: 'Velocidade', value: fmt(sim.state.v), unit: 'm/s' },
        { label: 'Atrito', value: fmt(Math.abs(f.fric)), unit: 'N' },
        { label: 'Normal', value: fmt(f.N), unit: 'N' },
      ]}
      scene={<Scene draw={draw} label="Bloco em plano inclinado com diagrama de forças: peso, normal, força aplicada e atrito" />}
      charts={
        <>
          <TimeChart title="Velocidade" unit="m/s" data={sim.history} series={[{ key: 'v', label: 'v', color: COLORS.cyan }]} />
          <TimeChart title="Posição na rampa" unit="m" data={sim.history} series={[{ key: 's', label: 's', color: COLORS.green }]} zero={false} />
          <TimeChart title="Atrito" unit="N" data={sim.history} series={[{ key: 'fat', label: 'Fat', color: COLORS.amber }]} />
        </>
      }
      panel={
        <>
          <Playback playing={sim.playing} finished={sim.finished} onToggle={sim.toggle} onStep={sim.stepFrame} onReset={sim.reset} speed={sim.speed} setSpeed={sim.setSpeed} />
          <Section title="Forças (valem na hora)">
            <Slider label="Força aplicada" symbol="F" value={p.F} min={-200} max={200} step={1} unit="N" digits={0} hint="Positiva empurra para cima da rampa." onChange={set('F')} />
            <Slider label="Massa" symbol="m" value={p.m} min={1} max={50} step={0.5} unit="kg" onChange={set('m')} />
            <Slider label="Inclinação" symbol="θ" value={p.thetaDeg} min={0} max={60} step={1} unit="°" digits={0} accent="#F59E0B" onChange={set('thetaDeg')} />
            <Slider label="Atrito estático" symbol="μe" value={p.muS} min={0} max={1} step={0.01} unit="" digits={2} onChange={set('muS')} />
            <Slider label="Atrito cinético" symbol="μc" value={p.muK} min={0} max={p.muS} step={0.01} unit="" digits={2} hint="Sempre menor ou igual a μe." onChange={set('muK')} />
            <div className="flex flex-wrap gap-1.5">
              <Chip active={p.muS === 0 && p.muK === 0} onClick={() => setP((o) => ({ ...o, muS: 0, muK: 0 }))}>Sem atrito</Chip>
              <Chip active={p.muS === 0.5 && p.muK === 0.3} onClick={() => setP((o) => ({ ...o, muS: 0.5, muK: 0.3 }))}>Madeira</Chip>
              <Chip active={p.muS === 0.74 && p.muK === 0.57} onClick={() => setP((o) => ({ ...o, muS: 0.74, muK: 0.57 }))}>Aço–aço</Chip>
              <Chip active={p.muS === 0.1 && p.muK === 0.03} onClick={() => setP((o) => ({ ...o, muS: 0.1, muK: 0.03 }))}>Gelo</Chip>
            </div>
          </Section>
          <Section title="Condições iniciais">
            <Slider label="Posição na rampa" symbol="s₀" value={s0v0.s0} min={1} max={11} step={0.5} unit="m" onChange={(v) => setS0v0((o) => ({ ...o, s0: v }))} />
            <Slider label="Velocidade inicial" symbol="v₀" value={s0v0.v0} min={-8} max={8} step={0.5} unit="m/s" onChange={(v) => setS0v0((o) => ({ ...o, v0: v }))} />
            <Toggle label="Decompor o peso" color="#FB7185" checked={decomp} onChange={setDecomp} />
          </Section>
          <VerifyTable
            rows={[
              { formula: 'N = m·g·cos θ', theory: p.m * p.g * Math.cos(p.thetaDeg * DEG), sim: f.N, tol: 1e-9 },
              { formula: 'a = (F − m·g·sen θ ∓ μc·N)/m', theory: theoryA, sim: aMeas, tol: 1e-3, note: 'Inicie a simulação para medir a aceleração.' },
            ]}
          />
          <Section title="Dados" right={<ExportButton onClick={exportar} />}>
            <Note>
              Parado, o bloco só começa a deslizar quando |F − m·g·sen θ| passa de μe·N = {fmt(f.maxStatic, 1)} N. Em movimento, o atrito cai para μc·N = {fmt(p.muK * f.N, 1)} N.
            </Note>
          </Section>
        </>
      }
    />
  );
}
