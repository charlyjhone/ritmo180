import { useState } from 'react';
import ModuleShell from '../../shell/ModuleShell';
import Scene from '../../core/Scene';
import TimeChart from '../../core/TimeChart';
import { useStepper } from '../../core/stepper';
import { COLORS, arrow, barGroup, clear, niceStep, pill } from '../../core/canvas';
import { fmt } from '../../core/format';
import { buildModuleExport, downloadJson, stamp } from '../../core/export';
import { Chip, ExportButton, Note, Playback, Section, Slider, VerifyTable } from '../../ui/controls';
import { cartWidth, collide, energyLoss, stepCarts, type CollisionState } from './physics';
import { param } from '../../core/params';

const X0 = -6;
const X1 = 6;

export default function ColisoesModule() {
  const [m1, setM1] = useState(() => param('m1', 2));
  const [m2, setM2] = useState(() => param('m2', 1));
  const [v1, setV1] = useState(() => param('v1', 2));
  const [v2, setV2] = useState(() => param('v2', -1));
  const [e, setE] = useState(() => param('e', 1));

  const sim = useStepper<CollisionState>({
    create: () => ({ a: { m: m1, v: v1, x: -2.5 }, b: { m: m2, v: v2, x: 2.5 }, collided: false, tCollision: null }),
    step: (s, h, t) => stepCarts(s, h, e, t),
    sample: (s) => ({
      v1: s.a.v,
      v2: s.b.v,
      p1: s.a.m * s.a.v,
      p2: s.b.m * s.b.v,
      p: s.a.m * s.a.v + s.b.m * s.b.v,
      Ec: 0.5 * s.a.m * s.a.v ** 2 + 0.5 * s.b.m * s.b.v ** 2,
    }),
    tEnd: 8,
    dt: 1 / 240,
    resetKey: [m1, m2, v1, v2, e],
  });

  const st = sim.state;
  const p0 = m1 * v1 + m2 * v2;
  const Ec0 = 0.5 * m1 * v1 * v1 + 0.5 * m2 * v2 * v2;
  const after = collide(m1, v1, m2, v2, e);
  const willCollide = v1 > v2;
  const pNow = st.a.m * st.a.v + st.b.m * st.b.v;
  const EcNow = 0.5 * st.a.m * st.a.v ** 2 + 0.5 * st.b.m * st.b.v ** 2;

  const draw = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    clear(ctx, W, H);
    const s = (W - 60) / (X1 - X0);
    const X = (x: number) => 30 + (x - X0) * s;
    const trackY = Math.max(220, H * 0.62);
    // trilho
    ctx.fillStyle = '#131B2C';
    ctx.fillRect(X(X0), trackY, (X1 - X0) * s, 12);
    ctx.strokeStyle = '#475569';
    ctx.strokeRect(X(X0) + 0.5, trackY + 0.5, (X1 - X0) * s, 12);
    const step = niceStep(70 / s);
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = COLORS.label;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let x = Math.ceil(X0 / step) * step; x <= X1; x += step) {
      ctx.fillRect(X(x), trackY + 12, 1, 6);
      ctx.fillText(fmt(x, 0), X(x), trackY + 22);
    }
    ctx.textAlign = 'right';
    ctx.fillText('x (m)', W - 12, trackY + 38);

    const cart = (c: { m: number; v: number; x: number }, color: string, label: string) => {
      const w = cartWidth(c.m) * s;
      const hgt = Math.min(70, 26 + Math.cbrt(c.m) * 18);
      const x = X(c.x);
      ctx.fillStyle = '#1E293B';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x - w / 2, trackY - hgt - 6, w, hgt, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#0B0F19';
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 1.5;
      for (const dx of [-w / 3, w / 3]) {
        ctx.beginPath();
        ctx.arc(x + dx, trackY - 4, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = color;
      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, trackY - hgt / 2 - 6);
      const k = 26;
      arrow(ctx, x, trackY - hgt - 22, x + c.v * k, trackY - hgt - 22, color, 2.5);
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.fillText(`${fmt(c.v)} m/s`, x, trackY - hgt - 40);
    };
    cart(st.a, COLORS.cyan, `A · ${fmt(st.a.m, 1)} kg`);
    cart(st.b, COLORS.amber, `B · ${fmt(st.b.m, 1)} kg`);

    if (st.tCollision !== null) pill(ctx, `colisão em t = ${fmt(st.tCollision)} s`, X(0), trackY + 64, COLORS.violet);

    // momento antes × agora
    const pMax = Math.max(Math.abs(m1 * v1), Math.abs(m2 * v2), Math.abs(m1 * after.v1), Math.abs(m2 * after.v2), Math.abs(p0), 0.1);
    barGroup(
      ctx,
      16,
      106,
      Math.max(60, Math.min(120, trackY - 260)),
      [
        { label: 'pA', value: st.a.m * st.a.v, color: COLORS.cyan },
        { label: 'pB', value: st.b.m * st.b.v, color: COLORS.amber },
        { label: 'total', value: pNow, color: COLORS.green },
      ],
      pMax,
      'kg·m/s',
    );
    barGroup(
      ctx,
      W - 16 - (3 * 48 + 14),
      106,
      Math.max(60, Math.min(120, trackY - 260)),
      [
        { label: 'EcA', value: 0.5 * st.a.m * st.a.v ** 2, color: COLORS.cyan },
        { label: 'EcB', value: 0.5 * st.b.m * st.b.v ** 2, color: COLORS.amber },
        { label: 'total', value: EcNow, color: COLORS.rose },
      ],
      Math.max(Ec0, 0.1),
      'J',
    );
  };

  const exportar = () =>
    downloadJson(
      `colisoes_${stamp()}.json`,
      buildModuleExport({
        modulo: 'colisoes',
        titulo: 'Colisões',
        metodo: 'Movimento uniforme entre eventos; colisão aplicada no instante exato do contato',
        unidades: { t: 's', v1: 'm/s', v2: 'm/s', p1: 'kg·m/s', p2: 'kg·m/s', p: 'kg·m/s', Ec: 'J' },
        parametros: { mA: m1, mB: m2, vA: v1, vB: v2, coefRestituicao: e },
        resultados: { vAdepois: willCollide ? after.v1 : v1, vBdepois: willCollide ? after.v2 : v2, energiaDissipada: willCollide ? energyLoss(m1, v1, m2, v2, e) : 0, instanteColisao: st.tCollision },
        verificacao: st.collided
          ? [
              { grandeza: 'p antes = p depois', teorico: p0, simulado: pNow },
              { grandeza: 'Ec depois = Ec antes − ½μ(1−e²)Δv²', teorico: Ec0 - energyLoss(m1, v1, m2, v2, e), simulado: EcNow },
            ]
          : [],
        serie: sim.history,
      }),
    );

  const typeName = e === 1 ? 'elástica' : e === 0 ? 'perfeitamente inelástica' : 'parcialmente elástica';

  return (
    <ModuleShell
      title="Colisões"
      tema="Quantidade de movimento"
      status={
        sim.playing
          ? { text: st.collided ? 'Depois da colisão' : 'Aproximando', tone: 'run' }
          : sim.finished
            ? { text: 'Fim', tone: 'done' }
            : { text: sim.t > 0 ? 'Pausado' : 'Pronto', tone: sim.t > 0 ? 'pause' : 'idle' }
      }
      keys={{ toggle: sim.toggle, step: sim.stepFrame, reset: sim.reset }}
      stats={[
        { label: 'Velocidade A', value: fmt(st.a.v), unit: 'm/s' },
        { label: 'Velocidade B', value: fmt(st.b.v), unit: 'm/s' },
        { label: 'Momento total', value: fmt(pNow), unit: 'kg·m/s', accent: true },
        { label: 'Ec total', value: fmt(EcNow), unit: 'J' },
      ]}
      scene={<Scene draw={draw} label="Dois carrinhos em trilho com setas de velocidade e barras de quantidade de movimento e energia" />}
      charts={
        <>
          <TimeChart title="Velocidades" unit="m/s" data={sim.history} series={[{ key: 'v1', label: 'A', color: COLORS.cyan }, { key: 'v2', label: 'B', color: COLORS.amber }]} window={null} />
          <TimeChart
            title="Quantidade de movimento"
            unit="kg·m/s"
            data={sim.history}
            series={[
              { key: 'p1', label: 'A', color: COLORS.cyan },
              { key: 'p2', label: 'B', color: COLORS.amber },
              { key: 'p', label: 'total', color: COLORS.green },
            ]}
            window={null}
          />
          <TimeChart title="Energia cinética total" unit="J" data={sim.history} series={[{ key: 'Ec', label: 'Ec', color: COLORS.rose }]} window={null} />
        </>
      }
      panel={
        <>
          <Playback playing={sim.playing} finished={sim.finished} onToggle={sim.toggle} onStep={sim.stepFrame} onReset={sim.reset} speed={sim.speed} setSpeed={sim.setSpeed} />
          <Section title="Carrinho A">
            <Slider label="Massa" symbol="mA" value={m1} min={0.5} max={10} step={0.1} unit="kg" onChange={setM1} />
            <Slider label="Velocidade" symbol="vA" value={v1} min={-4} max={4} step={0.1} unit="m/s" onChange={setV1} />
          </Section>
          <Section title="Carrinho B">
            <Slider label="Massa" symbol="mB" value={m2} min={0.5} max={10} step={0.1} unit="kg" accent="#F59E0B" onChange={setM2} />
            <Slider label="Velocidade" symbol="vB" value={v2} min={-4} max={4} step={0.1} unit="m/s" accent="#F59E0B" onChange={setV2} />
          </Section>
          <Section title="Tipo de colisão">
            <Slider label="Coeficiente de restituição" symbol="e" value={e} min={0} max={1} step={0.01} unit="" digits={2} accent="#A78BFA" hint={`Colisão ${typeName}.`} onChange={setE} />
            <div className="flex flex-wrap gap-1.5">
              <Chip active={e === 1} onClick={() => setE(1)}>Elástica</Chip>
              <Chip active={e === 0.5} onClick={() => setE(0.5)}>Parcial</Chip>
              <Chip active={e === 0} onClick={() => setE(0)}>Inelástica</Chip>
            </div>
          </Section>
          <VerifyTable
            empty={willCollide ? 'Inicie: a verificação aparece depois da colisão.' : 'Com essas velocidades os carrinhos se afastam e não colidem.'}
            rows={
              st.collided
                ? [
                    { formula: 'p antes = p depois', theory: p0, sim: pNow, tol: 1e-9 },
                    { formula: 'Ec depois = Ec antes − ½μ(1−e²)Δv²', theory: Ec0 - energyLoss(m1, v1, m2, v2, e), sim: EcNow, tol: 1e-9 },
                    { formula: "e = −(vB' − vA')/(vB − vA)", theory: e, sim: (st.b.v - st.a.v) / (v1 - v2), tol: 1e-9 },
                  ]
                : []
            }
          />
          <Section title="Dados" right={<ExportButton onClick={exportar} />}>
            <Note>
              Previsão: depois do choque, vA = {fmt(willCollide ? after.v1 : v1)} m/s e vB = {fmt(willCollide ? after.v2 : v2)} m/s.{' '}
              {willCollide ? `Energia dissipada: ${fmt(energyLoss(m1, v1, m2, v2, e))} J.` : ''}
            </Note>
          </Section>
        </>
      }
    />
  );
}
