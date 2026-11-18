import { useRef, useState } from 'react';
import ModuleShell from '../../shell/ModuleShell';
import Scene from '../../core/Scene';
import TimeChart from '../../core/TimeChart';
import { useStepper } from '../../core/stepper';
import { COLORS, clear } from '../../core/canvas';
import { fmt } from '../../core/format';
import { buildModuleExport, downloadJson, stamp } from '../../core/export';
import { crossings, mulberry32, type Rand } from '../../core/random';
import { Chip, ExportButton, Note, Playback, Section, Slider, VerifyTable, type VerifyRow } from '../../ui/controls';
import { CHI2_CRIT, MODES, chiSquare, genotypeLabel, offspring, pretty, productRule, punnett } from './physics';
import { param, choice } from '../../core/params';

interface Brood {
  n: number;
  counts: number[];
  recent: number[];
}

export default function GeneticaModule() {
  const [mid, setMid] = useState(() => choice<string>('mid', 'mono', MODES.map((x) => x.id)));
  const m = MODES.find((x) => x.id === mid)!;
  const [parentsBy, setParentsBy] = useState<Record<string, [string, string]>>(() => Object.fromEntries(MODES.map((x) => [x.id, [choice('p1', x.defaults[0], x.options[0]), choice('p2', x.defaults[1], x.options[1])] as [string, string]])));
  const [total, setTotal] = useState(() => param('total', 400));
  const [seed, setSeed] = useState(() => param('seed', 1));
  const [p1, p2] = parentsBy[mid];
  const G1 = m.parse(p1);
  const G2 = m.parse(p2);
  const pq = punnett(m, p1, p2);
  const expected = m.phenotypes.map((p) => pq.probs[p.id]);
  const rand = useRef<Rand>(mulberry32(1));

  const sim = useStepper<Brood>({
    create: () => {
      rand.current = mulberry32(seed * 104729 + mid.length);
      return { n: 0, counts: m.phenotypes.map(() => 0), recent: [] };
    },
    step: (b, h, t) => {
      const k = crossings(t, h);
      for (let i = 0; i < k; i++) {
        const ph = offspring(m, G1, G2, rand.current);
        const idx = m.phenotypes.findIndex((p) => p.id === ph);
        b.counts[idx]++;
        b.n++;
        b.recent.push(idx);
        if (b.recent.length > 120) b.recent.shift();
      }
      return b;
    },
    sample: (b) => Object.fromEntries(m.phenotypes.map((_, i) => [`f${i}`, b.n ? (100 * b.counts[i]) / b.n : 0])),
    tEnd: total,
    dt: 1,
    sampleEvery: Math.max(1, Math.round(total / 400)),
    timeScale: Math.max(20, total / 12),
    resetKey: [mid, p1, p2, total, seed],
  });

  const b = sim.state;
  const obs = b.counts.map((c) => (b.n ? c / b.n : 0));
  const chi = b.n ? chiSquare(b.counts, expected, b.n) : 0;
  const df = expected.filter((e) => e > 0).length - 1;

  const draw = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    clear(ctx, W, H);
    const top = 108;
    // quadro de Punnett
    const nR = pq.G1.length;
    const nC = pq.G2.length;
    const avail = Math.min(W * 0.5, H - top - 40);
    const cs = Math.min(64, (avail - 50) / Math.max(nR, nC));
    const gx = 20 + 50;
    const gy = top + 40;
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(`${pretty(p1)} × ${pretty(p2)}`, gx + (nC * cs) / 2, top + 8);
    pq.G2.forEach((g, j) => {
      ctx.fillStyle = COLORS.cyan;
      ctx.fillText(pretty(g.alleles.join('')), gx + j * cs + cs / 2, gy - 10);
    });
    pq.G1.forEach((g, i) => {
      ctx.fillStyle = COLORS.rose;
      ctx.textAlign = 'right';
      ctx.fillText(pretty(g.alleles.join('')), gx - 8, gy + i * cs + cs / 2);
      ctx.textAlign = 'center';
      pq.cells[i].forEach((c, j) => {
        const ph = m.phenotypes.find((p) => p.id === c.ph)!;
        ctx.fillStyle = ph.color + '55';
        ctx.fillRect(gx + j * cs + 1, gy + i * cs + 1, cs - 2, cs - 2);
        ctx.strokeStyle = ph.color;
        ctx.strokeRect(gx + j * cs + 1.5, gy + i * cs + 1.5, cs - 3, cs - 3);
        ctx.fillStyle = COLORS.text;
        ctx.font = `600 ${cs < 40 ? 9 : 11}px "JetBrains Mono", monospace`;
        ctx.fillText(pretty(genotypeLabel(c.g)), gx + j * cs + cs / 2, gy + i * cs + cs / 2);
      });
    });
    // barras observado × esperado
    const bx0 = Math.max(gx + nC * cs + 40, W * 0.52);
    const bw = W - bx0 - 20;
    const rowH = Math.min(46, (H - top - 120) / m.phenotypes.length);
    m.phenotypes.forEach((p, i) => {
      const y = top + 20 + i * rowH;
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = p.color;
      ctx.fillText(p.label, bx0, y);
      ctx.fillStyle = '#1F2937';
      ctx.fillRect(bx0, y + 5, bw, 14);
      ctx.fillStyle = p.color;
      ctx.fillRect(bx0, y + 5, bw * obs[i], 14);
      ctx.strokeStyle = COLORS.text;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bx0 + bw * expected[i], y + 2);
      ctx.lineTo(bx0 + bw * expected[i], y + 22);
      ctx.stroke();
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = 'right';
      ctx.fillText(`${b.counts[i]} · ${fmt(100 * obs[i], 1)}% (esperado ${fmt(100 * expected[i], 2)}%)`, bx0 + bw, y);
    });
    // filhotes recentes
    const dy = top + 30 + m.phenotypes.length * rowH;
    const per = Math.max(1, Math.floor(bw / 14));
    b.recent.forEach((idx, k) => {
      const x = bx0 + (k % per) * 14 + 6;
      const y = dy + Math.floor(k / per) * 14;
      if (y > H - 14) return;
      ctx.fillStyle = m.phenotypes[idx].color;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = COLORS.label;
    ctx.textAlign = 'left';
    ctx.fillText(`descendentes: ${b.n} · χ² = ${fmt(chi, 3)} (crítico 5%: ${df > 0 ? CHI2_CRIT[df] : '—'})`, 20, H - 10);
  };

  const rows: VerifyRow[] = m.phenotypes.flatMap((p, i) => {
    const e = expected[i];
    if (e <= 0) return [];
    const sd = b.n ? Math.sqrt((e * (1 - e)) / b.n) : 0;
    return [
      {
        formula: `P(${p.label}) observada ≈ Punnett${b.n ? ` (aceita ±${fmt((300 * sd) / e, 1)}%)` : ''}`,
        theory: b.n ? e : null,
        sim: b.n ? obs[i] : null,
        digits: 4,
        tol: Math.max(1e-12, (3 * sd) / e),
        note: 'Gere descendentes…',
      },
    ];
  });
  if (mid === 'di') rows.unshift({ formula: 'Regra do produto: P(amarela lisa) = P(A_)·P(B_)', theory: productRule(G1, G2, 'AB'), sim: pq.probs.AB, digits: 6, tol: 1e-12 });

  const exportar = () =>
    downloadJson(
      `genetica_${stamp()}.json`,
      buildModuleExport({
        modulo: 'genetica',
        titulo: `${m.name}: ${p1} × ${p2}`,
        metodo: 'Quadro de Punnett exato e sorteio de descendentes (um alelo ao acaso de cada gene de cada genitor)',
        unidades: { t: 'descendentes', f: '% de cada fenótipo' },
        parametros: { cruzamento: m.name, genitor1: p1, genitor2: p2, descendentes: total, semente: seed },
        resultados: { ...Object.fromEntries(m.phenotypes.map((p, i) => [p.label, b.counts[i]])), chi2: chi },
        verificacao: m.phenotypes.map((p, i) => ({ grandeza: p.label, teorico: expected[i], simulado: obs[i] })),
        serie: sim.history,
      }),
    );

  const setParent = (k: 0 | 1, v: string) => setParentsBy((x) => ({ ...x, [mid]: (k === 0 ? [v, x[mid][1]] : [x[mid][0], v]) as [string, string] }));

  return (
    <ModuleShell
      title="Genética Mendeliana"
      tema="Punnett, proporções, ABO, herança ligada ao X"
      status={sim.playing ? { text: 'Gerando descendentes', tone: 'run' } : sim.finished ? { text: `${b.n} descendentes`, tone: 'done' } : { text: b.n ? 'Pausado' : 'Pronto', tone: b.n ? 'pause' : 'idle' }}
      keys={{ toggle: sim.toggle, step: sim.stepFrame, reset: sim.reset }}
      stats={[
        { label: 'Descendentes', value: String(b.n), unit: '', accent: true },
        { label: 'Proporção esperada', value: ratio(expected), unit: '' },
        { label: 'χ²', value: fmt(chi, 2), unit: df > 0 ? `gl ${df}` : '' },
        { label: 'Hipótese de Mendel', value: b.n < 20 || df <= 0 ? '—' : chi < CHI2_CRIT[df] ? 'aceita' : 'rejeitada', unit: '' },
      ]}
      scene={<Scene draw={draw} label="Quadro de Punnett com gametas dos genitores e barras de proporção observada contra a esperada" />}
      charts={<TimeChart title="Proporção observada" unit="%" data={sim.history} series={m.phenotypes.map((p, i) => ({ key: `f${i}`, label: p.label, color: p.color }))} window={null} tUnit="filhos" />}
      panel={
        <>
          <Playback playing={sim.playing} finished={sim.finished} onToggle={sim.toggle} onStep={sim.stepFrame} onReset={sim.reset} speed={sim.speed} setSpeed={sim.setSpeed} startLabel="Cruzar" />
          <Section title="Tipo de herança">
            <div className="flex flex-wrap gap-1.5">
              {MODES.map((x) => (
                <Chip key={x.id} active={mid === x.id} onClick={() => setMid(x.id)}>
                  {x.name}
                </Chip>
              ))}
            </div>
          </Section>
          <Section title={mid === 'x' ? 'Mãe' : 'Genitor 1'}>
            <div className="flex flex-wrap gap-1.5">
              {m.options[0].map((o) => (
                <Chip key={o} active={p1 === o} onClick={() => setParent(0, o)}>
                  {pretty(o)}
                </Chip>
              ))}
            </div>
          </Section>
          <Section title={mid === 'x' ? 'Pai' : 'Genitor 2'}>
            <div className="flex flex-wrap gap-1.5">
              {m.options[1].map((o) => (
                <Chip key={o} active={p2 === o} onClick={() => setParent(1, o)}>
                  {pretty(o)}
                </Chip>
              ))}
            </div>
          </Section>
          <Section title="Descendentes" right={<Chip active={false} onClick={() => setSeed((x) => x + 1)}>Nova semente</Chip>}>
            <Slider label="Quantidade" symbol="n" value={total} min={20} max={10000} step={20} unit="" digits={0} onChange={setTotal} />
          </Section>
          <VerifyTable empty="Cruze para comparar." rows={rows} />
          <Section title="Dados" right={<ExportButton onClick={exportar} />}>
            <Note>{m.note} Com poucos descendentes a proporção oscila; com muitos ela se aproxima da prevista (lei dos grandes números). O χ² mede se a diferença é só acaso.</Note>
          </Section>
        </>
      }
    />
  );
}

/** Proporção em inteiros pequenos (ex.: 9 : 3 : 3 : 1). */
function ratio(p: number[]) {
  const nz = p.filter((x) => x > 0);
  const min = Math.min(...nz);
  for (let d = 1; d <= 16; d++) {
    const r = p.map((x) => (x / min) * d);
    if (r.every((x) => Math.abs(x - Math.round(x)) < 1e-9)) return r.filter((x) => x > 0).map((x) => Math.round(x)).join(' : ');
  }
  return p.map((x) => fmt(x, 3)).join(' : ');
}
