import { useState } from 'react';
import ModuleShell from '../../shell/ModuleShell';
import Scene from '../../core/Scene';
import TimeChart from '../../core/TimeChart';
import { rk4, useStepper } from '../../core/stepper';
import { COLORS, clear } from '../../core/canvas';
import { fmt } from '../../core/format';
import { buildModuleExport, downloadJson, stamp } from '../../core/export';
import { Chip, ExportButton, Note, Playback, Section, Slider, VerifyTable } from '../../ui/controls';
import { REACTIONS, SPECIES, amounts, limiting, massBalance, masses, rate } from './physics';
import { hashParams, param } from '../../core/params';

const ATOM_COLORS: Record<string, string> = { H: '#F1F5F9', O: '#EF4444', N: '#3B82F6', C: '#475569', Fe: '#F59E0B' };
const SERIES_COLORS = [COLORS.cyan, COLORS.amber, COLORS.green, COLORS.rose, COLORS.violet];
const K = 1.5; // 1/s

export default function EstequiometriaModule() {
  const [rid, setRid] = useState(() => { const r = hashParams().get('reacao'); return REACTIONS.some((x) => x.id === r) ? r! : 'agua'; });
  const r = REACTIONS.find((x) => x.id === rid)!;
  const [gramsBy, setGramsBy] = useState<Record<string, number[]>>(() => Object.fromEntries(REACTIONS.map((x) => [x.id, x.id === rid ? x.defaults.map((d, i) => param(`g${i}`, d)) : [...x.defaults]])));
  const [yieldPct, setYield] = useState(() => param('yieldPct', 100));
  const grams = gramsBy[rid];
  const molesIn = r.reactants.map((t, i) => grams[i] / SPECIES[t.sp].M);
  const lim = limiting(r, molesIn);
  const xiFinal = lim.xiMax * (yieldPct / 100);
  const all = [...r.reactants, ...r.products];
  const m0 = masses(r, molesIn, 0).reduce((a, b) => a + b, 0);

  const sim = useStepper<{ xi: number }>({
    create: () => ({ xi: 0 }),
    step: (s, h) => ({ xi: rk4([s.xi], h, ([x]) => [rate(xiFinal, x, K)])[0] }),
    sample: (s) => Object.fromEntries(amounts(r, molesIn, s.xi).map((n, i) => [`n${i}`, n])),
    until: (s) => xiFinal - s.xi <= 1e-9 * Math.max(xiFinal, 1e-12),
    dt: 1 / 200,
    sampleEvery: 1 / 20,
    timeScale: 3,
    resetKey: [rid, ...grams, yieldPct],
  });

  const xi = sim.state.xi;
  const n = amounts(r, molesIn, xi);
  const mNow = masses(r, molesIn, xi);
  const mTot = mNow.reduce((a, b) => a + b, 0);
  const mb = massBalance(r);
  const unit = Math.max(...molesIn.map((x, i) => x / r.reactants[i].nu)) / 6; // mol por "molécula desenhada" (escala)

  const draw = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    clear(ctx, W, H);
    const top = 116;
    // equação
    const eqText = `${r.reactants.map((t) => `${t.nu > 1 ? t.nu : ''}${SPECIES[t.sp].label}`).join(' + ')}  →  ${r.products.map((t) => `${t.nu > 1 ? t.nu : ''}${SPECIES[t.sp].label}`).join(' + ')}`;
    ctx.font = '600 18px "JetBrains Mono", monospace';
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(eqText, W / 2, top);
    // colunas por espécie
    const cols = all.length;
    const gap = 16;
    const colW = Math.min(170, (W - 60 - gap * cols) / cols);
    const startX = (W - (cols * colW + (cols - 1) * gap) - 30) / 2;
    const y0 = top + 44;
    const colH = H - y0 - 24;
    all.forEach((t, i) => {
      const x = startX + i * (colW + gap) + (i >= r.reactants.length ? 30 : 0);
      const sp = SPECIES[t.sp];
      const isLim = i === lim.limiting && i < r.reactants.length;
      ctx.fillStyle = '#131B2C';
      ctx.strokeStyle = isLim ? COLORS.rose : '#1F2937';
      ctx.lineWidth = isLim ? 2 : 1;
      ctx.beginPath();
      ctx.roundRect(x, y0, colW, colH, 8);
      ctx.fill();
      ctx.stroke();
      ctx.font = '600 13px "JetBrains Mono", monospace';
      ctx.fillStyle = SERIES_COLORS[i % SERIES_COLORS.length];
      ctx.textAlign = 'center';
      ctx.fillText(sp.label, x + colW / 2, y0 + 8);
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(`${fmt(Math.max(0, n[i]), 3)} mol`, x + colW / 2, y0 + 28);
      ctx.fillText(`${fmt(Math.max(0, mNow[i]), 2)} g`, x + colW / 2, y0 + 42);
      if (isLim) {
        ctx.fillStyle = COLORS.rose;
        ctx.fillText('limitante', x + colW / 2, y0 + colH - 16);
      } else if (i < r.reactants.length) {
        ctx.fillStyle = COLORS.label;
        ctx.fillText('em excesso', x + colW / 2, y0 + colH - 16);
      }
      // moléculas
      const count = Math.round(Math.max(0, n[i]) / unit);
      const ar = Math.max(3, Math.min(6, colW / 26));
      const mw = (sp.atoms.length > 4 ? 3 : sp.atoms.length) * ar * 1.7 + 6;
      const mh = (sp.atoms.length > 4 ? Math.ceil(sp.atoms.length / 3) : 1) * ar * 1.7 + 8;
      const perRow = Math.max(1, Math.floor((colW - 12) / mw));
      for (let k = 0; k < Math.min(count, 200); k++) {
        const cx = x + 8 + (k % perRow) * mw + ar;
        const cy = y0 + 62 + Math.floor(k / perRow) * mh + ar;
        if (cy > y0 + colH - 28) break;
        sp.atoms.forEach((a, j) => {
          const col = sp.atoms.length > 4 ? j % 3 : j;
          const row = sp.atoms.length > 4 ? Math.floor(j / 3) : 0;
          ctx.fillStyle = ATOM_COLORS[a];
          ctx.beginPath();
          ctx.arc(cx + col * ar * 1.6, cy + row * ar * 1.6, a === 'H' ? ar * 0.75 : ar, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    });
    // seta
    const ax = startX + r.reactants.length * (colW + gap) - gap / 2 + 15;
    ctx.fillStyle = COLORS.amber;
    ctx.font = '700 22px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('→', ax, y0 + colH / 2);
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = COLORS.label;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`cada molécula desenhada ≈ ${fmt(unit, 3)} mol · massa total ${fmt(mTot, 3)} g`, 16, H - 8);
  };

  const exportar = () =>
    downloadJson(
      `estequiometria_${stamp()}.json`,
      buildModuleExport({
        modulo: 'estequiometria',
        titulo: r.name,
        metodo: "Grau de avanço ξ com dξ/dt = k(ξ_final − ξ) (RK4); ξ_final = rendimento × min(nᵢ/νᵢ)",
        unidades: { t: 's', n: 'mol (n0..n reagentes, depois produtos)' },
        parametros: { reacao: r.name, ...Object.fromEntries(r.reactants.map((t, i) => [`massa_${t.sp}_g`, grams[i]])), rendimento: yieldPct },
        resultados: {
          limitante: SPECIES[r.reactants[lim.limiting].sp].label,
          xiMax: lim.xiMax,
          ...Object.fromEntries(all.map((t, i) => [`massaFinal_${t.sp}_g`, mNow[i]])),
        },
        verificacao: [{ grandeza: 'massa total conservada (g)', teorico: m0, simulado: mTot }],
        serie: sim.history,
      }),
    );

  const setGram = (i: number, v: number) => setGramsBy((g) => ({ ...g, [rid]: g[rid].map((x, j) => (j === i ? v : x)) }));
  const prodIdx = r.reactants.length;
  const prod = r.products[0];

  return (
    <ModuleShell
      title="Estequiometria"
      tema="Reagente limitante, excesso, rendimento, Lavoisier"
      status={
        sim.playing
          ? { text: 'Reagindo', tone: 'run' }
          : sim.finished
            ? { text: 'Reação encerrada', tone: 'done' }
            : { text: xi > 0 ? 'Pausado' : 'Pronto', tone: xi > 0 ? 'pause' : 'idle' }
      }
      keys={{ toggle: sim.toggle, step: sim.stepFrame, reset: sim.reset }}
      stats={[
        { label: 'Reagente limitante', value: SPECIES[r.reactants[lim.limiting].sp].label, unit: '', accent: true },
        { label: 'Avanço ξ', value: fmt(xi, 4), unit: 'mol' },
        { label: `${SPECIES[prod.sp].label} formado`, value: fmt(mNow[prodIdx], 2), unit: 'g' },
        { label: 'Massa total', value: fmt(mTot, 3), unit: 'g' },
      ]}
      scene={<Scene draw={draw} label="Equação química e colunas de moléculas de cada espécie sendo consumidas e formadas" />}
      charts={
        <>
          <TimeChart title="Quantidade de matéria" unit="mol" data={sim.history} series={all.map((t, i) => ({ key: `n${i}`, label: SPECIES[t.sp].label, color: SERIES_COLORS[i % SERIES_COLORS.length] }))} window={null} />
        </>
      }
      panel={
        <>
          <Playback playing={sim.playing} finished={sim.finished} onToggle={sim.toggle} onStep={sim.stepFrame} onReset={sim.reset} speed={sim.speed} setSpeed={sim.setSpeed} startLabel="Reagir" />
          <Section title="Reação">
            <div className="flex flex-wrap gap-1.5">
              {REACTIONS.map((x) => (
                <Chip key={x.id} active={rid === x.id} onClick={() => setRid(x.id)}>
                  {x.name}
                </Chip>
              ))}
            </div>
          </Section>
          <Section title="Reagentes">
            {r.reactants.map((t, i) => (
              <Slider
                key={t.sp}
                label={`Massa de ${SPECIES[t.sp].label}`}
                symbol="m"
                value={grams[i]}
                min={0.5}
                max={Math.max(200, r.defaults[i] * 3)}
                step={0.5}
                unit="g"
                digits={1}
                accent={SERIES_COLORS[i]}
                hint={`${fmt(molesIn[i], 4)} mol (M = ${SPECIES[t.sp].M} g/mol)`}
                onChange={(v) => setGram(i, v)}
              />
            ))}
            <Slider label="Rendimento" symbol="η" value={yieldPct} min={10} max={100} step={1} unit="%" digits={0} accent="#FB7185" onChange={setYield} />
          </Section>
          <VerifyTable
            empty="Reaja para comparar."
            rows={[
              { formula: 'Lavoisier: massa total constante (g)', theory: m0, sim: mTot, digits: 4, tol: 1e-9 },
              { formula: 'Σν·M reagentes = Σν·M produtos (g/mol)', theory: mb.reactants, sim: mb.products, digits: 3, tol: 1e-9 },
              {
                formula: `m(${SPECIES[prod.sp].label}) = η·${prod.nu}·ξmax·M`,
                theory: (yieldPct / 100) * prod.nu * lim.xiMax * SPECIES[prod.sp].M,
                sim: sim.finished ? mNow[prodIdx] : null,
                digits: 4,
                tol: 1e-6,
                note: 'Aguardando o fim da reação…',
              },
            ]}
          />
          <Section title="Dados" right={<ExportButton onClick={exportar} />}>
            <Note>
              O limitante é o reagente com menor nᵢ/νᵢ: ele acaba primeiro e define quanto produto se forma. O excesso sobra sem reagir. Com rendimento menor que 100%, parte do limitante também sobra.
            </Note>
          </Section>
        </>
      }
    />
  );
}
