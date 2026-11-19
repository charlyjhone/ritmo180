import { useState } from 'react';
import ModuleShell from '../../shell/ModuleShell';
import Scene from '../../core/Scene';
import TimeChart from '../../core/TimeChart';
import { rk4, useStepper } from '../../core/stepper';
import { COLORS, clear, pill } from '../../core/canvas';
import { fmt } from '../../core/format';
import { buildModuleExport, downloadJson, stamp } from '../../core/export';
import { Chip, ExportButton, Note, Playback, Section, Slider, VerifyTable } from '../../ui/controls';
import { F, METALS, type Cell, cellAt, chargeFromSeries, halfPotential, lcm, nernstCell } from './physics';
import { param, choice } from '../../core/params';

const M0 = 20; // g de cada eletrodo
const VOL = 0.1; // L de solução em cada béquer
const R_INT = 1; // Ω

export default function PilhasModule() {
  const [idA, setA] = useState(() => choice<string>('idA', 'Zn', METALS.map((m) => m.id)));
  const [idB, setB] = useState(() => choice<string>('idB', 'Cu', METALS.map((m) => m.id)));
  const [cA, setCA] = useState(() => param('cA', 1));
  const [cB, setCB] = useState(() => param('cB', 1));
  const [R, setR] = useState(() => param('R', 10));
  const [U, setU] = useState(() => param('U', 0));

  const mA = METALS.find((m) => m.id === idA)!;
  const mB = METALS.find((m) => m.id === idB)!;
  // à esquerda fica o metal de menor E° (ânodo da pilha)
  const swap = mB.E0 < mA.E0;
  const cell: Cell = {
    an: swap ? mB : mA,
    cat: swap ? mA : mB,
    cAn0: swap ? cB : cA,
    cCat0: swap ? cA : cB,
    V: VOL,
    R,
    r: R_INT,
    U,
  };
  const s0 = cellAt(cell, 0);
  const qLim = s0.I >= 0 ? Math.min(cell.cCat0 * cell.cat.n * F * VOL, (M0 / cell.an.M) * cell.an.n * F) : Math.min(cell.cAn0 * cell.an.n * F * VOL, (M0 / cell.cat.M) * cell.cat.n * F);
  const tDep = Math.abs(s0.I) > 1e-9 ? qLim / Math.abs(s0.I) / 3600 : 1; // horas
  const nEl = lcm(cell.an.n, cell.cat.n);

  const sim = useStepper<{ q: number }>({
    create: () => ({ q: 0 }),
    step: (s, h) => ({ q: rk4([s.q], h, ([q]) => [3600 * cellAt(cell, q).I])[0] }),
    sample: (s) => {
      const c = cellAt(cell, s.q);
      return { E: c.E, Ut: c.I * R, I: c.I, ImA: c.I * 1000, mAn: M0 + c.dmAn, mCat: M0 + c.dmCat, dmCat: c.dmCat, cAn: c.cAn, cCat: c.cCat, q: s.q };
    },
    until: (s) => {
      const c = cellAt(cell, s.q);
      return c.cCat <= 0.01 * cell.cCat0 || c.cAn <= 0.01 * cell.cAn0 || M0 + c.dmAn <= 0.01 || M0 + c.dmCat <= 0.01 || Math.abs(c.I) < 1e-7;
    },
    tEnd: tDep * 4,
    dt: tDep / 2000,
    sampleEvery: tDep / 200,
    timeScale: tDep / 12,
    resetKey: [idA, idB, cA, cB, R, U],
  });

  const st = cellAt(cell, sim.state.q);
  const discharging = st.I >= 0;
  const E0cell = cell.cat.E0 - cell.an.E0;
  const hist = sim.history;
  const qTrap = hist.length > 2 ? chargeFromSeries(hist.map((p) => p.t), hist.map((p) => p.I)) : null;
  const last = hist[hist.length - 1];

  const draw = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    clear(ctx, W, H);
    const top = 112;
    const bw = Math.min(230, W * 0.3);
    const bh = Math.min(200, (H - top) * 0.48);
    const by = H - bh - 30;
    const cx = [W * 0.27, W * 0.73];
    const liq = by + bh * 0.2;
    const metals = [cell.an, cell.cat];
    const conc = [st.cAn, st.cCat];
    const masses = [M0 + st.dmAn, M0 + st.dmCat];
    const wireY = top + 40;
    metals.forEach((m, i) => {
      const x0 = cx[i] - bw / 2;
      // solução
      const a = Math.min(0.75, 0.12 + 0.4 * conc[i]);
      const [r, g, b] = m.ionColor;
      ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(3)})`;
      ctx.fillRect(x0, liq, bw, by + bh - liq);
      // béquer
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x0, by);
      ctx.lineTo(x0, by + bh);
      ctx.lineTo(x0 + bw, by + bh);
      ctx.lineTo(x0 + bw, by);
      ctx.stroke();
      // eletrodo (largura ∝ massa)
      const ew = 10 + 26 * Math.sqrt(Math.max(0, masses[i]) / M0) * 0.75;
      const ex = cx[i] - (i === 0 ? bw * 0.18 : -bw * 0.18) - ew / 2;
      ctx.fillStyle = m.color;
      ctx.fillRect(ex, wireY, ew, by + bh - 18 - wireY);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(ex, wireY, ew, by + bh - 18 - wireY);
      // rótulos
      ctx.font = '600 12px "JetBrains Mono", monospace';
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = 'center';
      ctx.fillText(`${m.id} | ${m.ion} · ${fmt(masses[i], 2)} g`, cx[i], by + bh + 18);
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = COLORS.text;
      ctx.fillText(`[${m.ion}] = ${fmt(conc[i], 4)} mol/L`, cx[i], by + bh - 6);
      ctx.fillText(`E = ${fmt(halfPotential(m, conc[i]), 4)} V`, cx[i], by + bh - 20);
      const isAnode = (i === 0) === discharging;
      pill(ctx, `${isAnode ? 'ÂNODO · oxidação' : 'CÁTODO · redução'} (${i === 0 ? '−' : '+'})`, i === 0 ? x0 - 4 : x0 + bw + 4, by - 14, isAnode ? COLORS.rose : COLORS.cyan, i === 0 ? 'left' : 'right');
    });
    // fio
    const exL = cx[0] - bw * 0.18;
    const exR = cx[1] + bw * 0.18;
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(exL, wireY);
    ctx.lineTo(exL, wireY - 30);
    ctx.lineTo(exR, wireY - 30);
    ctx.lineTo(exR, wireY);
    ctx.stroke();
    const wy = wireY - 30;
    // resistor/voltímetro e fonte
    const boxText = U > 0 ? `fonte ${fmt(U, 2)} V · R ${R} Ω` : `R = ${R} Ω · ${fmt(st.I * R, 3)} V`;
    ctx.font = '600 12px "JetBrains Mono", monospace';
    const boxW = ctx.measureText(boxText).width + 24;
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.amber;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(W / 2 - boxW / 2, wy - 15, boxW, 30, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.amber;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(boxText, W / 2, wy);
    ctx.textBaseline = 'alphabetic';
    // elétrons no fio
    const pathLen = (exR - exL) + 60;
    const nDots = 14;
    const phase = ((sim.state.q / (qLim / 80)) % 1 + 1) % 1;
    for (let k = 0; k < nDots; k++) {
      let u = ((k + phase) / nDots) % 1;
      if (!discharging) u = 1 - u;
      let d = u * pathLen;
      let px: number;
      let py: number;
      if (d < 30) {
        px = exL;
        py = wireY - d;
      } else if (d < 30 + (exR - exL)) {
        d -= 30;
        px = exL + d;
        py = wy;
      } else {
        d -= 30 + (exR - exL);
        px = exR;
        py = wy + d;
      }
      if (Math.abs(px - W / 2) < boxW / 2 + 2 && Math.abs(py - wy) < 2) continue;
      ctx.fillStyle = '#FDE047';
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#FDE047';
    ctx.textAlign = 'center';
    ctx.fillText(Math.abs(st.I) > 1e-7 ? `e⁻ ${discharging ? '→' : '←'}` : 'sem corrente', W / 2, wy - 22);
    // ponte salina
    const bx0 = cx[0] + bw / 2 - 26;
    const bx1 = cx[1] - bw / 2 + 26;
    const byT = Math.max(wy + 30, by - 46);
    ctx.strokeStyle = 'rgba(226,232,240,0.55)';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx0, liq + 30);
    ctx.lineTo(bx0, byT);
    ctx.lineTo(bx1, byT);
    ctx.lineTo(bx1, liq + 30);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('ponte salina (KNO₃)', W / 2, byT + 22);
    ctx.fillText(discharging ? 'NO₃⁻ ←   → K⁺' : 'K⁺ ←   → NO₃⁻', W / 2, byT + 36);
  };

  const exportar = () =>
    downloadJson(
      `pilhas_${stamp()}.json`,
      buildModuleExport({
        modulo: 'pilhas',
        titulo: `${cell.an.id} | ${cell.an.ion} || ${cell.cat.ion} | ${cell.cat.id}`,
        metodo: 'Carga q(t) com dq/dt = (E_Nernst(q) − U)/(R + r) (RK4); concentrações e massas pela lei de Faraday',
        unidades: { t: 'h', E: 'V', I: 'A', m: 'g', c: 'mol/L', q: 'C' },
        parametros: { anodo: cell.an.id, catodo: cell.cat.id, cAnodo0: cell.cAn0, cCatodo0: cell.cCat0, volume_L: VOL, R, r: R_INT, fonte_V: U, T_K: 298.15 },
        resultados: { E0: E0cell, E_atual: st.E, I_atual: st.I, carga_C: sim.state.q, dm_catodo_g: st.dmCat, dm_anodo_g: st.dmAn },
        verificacao: [{ grandeza: 'E Nernst (V)', teorico: nernstCell(cell.an, cell.cat, st.cAn, st.cCat), simulado: st.E }],
        serie: hist,
      }),
    );

  const metalChips = (val: string, set: (v: string) => void) => (
    <div className="flex flex-wrap gap-1.5">
      {METALS.map((m) => (
        <Chip key={m.id} active={val === m.id} onClick={() => set(m.id)} title={`${m.name}: E° = ${m.E0} V`}>
          {m.id}
        </Chip>
      ))}
    </div>
  );

  return (
    <ModuleShell
      title="Pilhas e Eletrólise"
      tema="Potenciais de redução, Nernst, Faraday"
      status={
        sim.playing
          ? { text: discharging ? 'Pilha descarregando' : 'Eletrólise (forçada)', tone: 'run' }
          : sim.finished
            ? { text: 'Reação encerrada', tone: 'done' }
            : { text: sim.t > 0 ? 'Pausado' : 'Pronto', tone: sim.t > 0 ? 'pause' : 'idle' }
      }
      keys={{ toggle: sim.toggle, step: sim.stepFrame, reset: sim.reset }}
      stats={[
        { label: 'ddp E (Nernst)', value: fmt(st.E, 4), unit: 'V', accent: true },
        { label: 'E° da pilha', value: fmt(E0cell, 2), unit: 'V' },
        { label: 'Corrente', value: fmt(st.I * 1000, 2), unit: 'mA' },
        { label: 'Tempo', value: fmt(sim.t, 2), unit: 'h' },
      ]}
      scene={<Scene draw={draw} label="Pilha com dois béqueres, eletrodos, ponte salina e elétrons circulando pelo fio" />}
      charts={
        <>
          <TimeChart title="Tensão" unit="V" data={hist} series={[{ key: 'E', label: 'E (fem)', color: COLORS.amber }, { key: 'Ut', label: 'U no resistor', color: COLORS.cyan }]} window={null} tUnit="h" zero={false} />
          <TimeChart title="Corrente" unit="mA" data={hist} series={[{ key: 'ImA', label: 'I', color: '#FDE047' }]} window={null} tUnit="h" />
          <TimeChart title="Massa dos eletrodos" unit="g" data={hist} series={[{ key: 'mAn', label: cell.an.id, color: COLORS.rose }, { key: 'mCat', label: cell.cat.id, color: COLORS.green }]} window={null} tUnit="h" zero={false} />
        </>
      }
      panel={
        <>
          <Playback playing={sim.playing} finished={sim.finished} onToggle={sim.toggle} onStep={sim.stepFrame} onReset={sim.reset} speed={sim.speed} setSpeed={sim.setSpeed} startLabel="Ligar" />
          <Section title="Semicélula 1">
            {metalChips(idA, setA)}
            <Slider label={`Concentração de ${mA.ion}`} symbol="c" value={cA} min={0.01} max={2} step={0.01} unit="mol/L" digits={2} accent={COLORS.rose} hint={`E° = ${mA.E0.toFixed(2)} V`} onChange={setCA} />
          </Section>
          <Section title="Semicélula 2">
            {metalChips(idB, setB)}
            <Slider label={`Concentração de ${mB.ion}`} symbol="c" value={cB} min={0.01} max={2} step={0.01} unit="mol/L" digits={2} accent={COLORS.green} hint={`E° = ${mB.E0.toFixed(2)} V`} onChange={setCB} />
          </Section>
          <Section title="Circuito">
            <Slider label="Resistência externa" symbol="R" value={R} min={1} max={100} step={1} unit="Ω" digits={0} onChange={setR} />
            <Slider label="Fonte externa (oposta)" symbol="U" value={U} min={0} max={3.5} step={0.05} unit="V" digits={2} accent={COLORS.violet} hint="U > E força a eletrólise (recarga)" onChange={setU} />
          </Section>
          <VerifyTable
            empty="Ligue o circuito para comparar."
            rows={[
              { formula: `E = E° − (RT/${nEl}F)·ln Q  (V)`, theory: nernstCell(cell.an, cell.cat, st.cAn, st.cCat), sim: st.E, digits: 5, tol: 1e-9 },
              {
                formula: `Faraday: Δm(${cell.cat.id}) = M·∫I dt/(${cell.cat.n}F)  (g)`,
                theory: qTrap !== null ? (cell.cat.M * qTrap) / (cell.cat.n * F) : null,
                sim: last && hist.length > 2 ? last.dmCat : null,
                digits: 5,
                tol: 2e-3,
                note: 'Aguardando amostras…',
              },
              {
                formula: 'e⁻ cedidos = e⁻ recebidos (mol)',
                theory: (st.cAn - cell.cAn0) * VOL * cell.an.n,
                sim: (cell.cCat0 - st.cCat) * VOL * cell.cat.n,
                digits: 6,
                tol: 1e-9,
              },
            ]}
          />
          <Section title="Dados" right={<ExportButton onClick={exportar} />}>
            <Note>
              Quem tem menor potencial de redução oxida (ânodo, polo −) e perde massa; o outro reduz (cátodo, polo +) e ganha massa. A ddp cai conforme os íons do cátodo se esgotam (Nernst). Com a fonte acima de E o sentido se inverte: é a eletrólise. Escolha o mesmo metal nos dois lados com concentrações diferentes para uma pilha de concentração.
            </Note>
          </Section>
        </>
      }
    />
  );
}
