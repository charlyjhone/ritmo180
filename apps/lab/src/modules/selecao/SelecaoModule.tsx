import { useMemo, useRef, useState } from 'react';
import ModuleShell from '../../shell/ModuleShell';
import Scene from '../../core/Scene';
import TimeChart from '../../core/TimeChart';
import { useStepper } from '../../core/stepper';
import { COLORS, clear, pill } from '../../core/canvas';
import { fmt } from '../../core/format';
import { buildModuleExport, downloadJson, stamp } from '../../core/export';
import { crossings, mulberry32, type Rand } from '../../core/random';
import { Chip, ExportButton, Note, Playback, Section, Slider, VerifyTable } from '../../ui/controls';
import { type Env, type Population, alleleQ, createPopulation, haldane, nextGeneration } from './physics';
import { param, choice } from '../../core/params';

const GENS = 150;
const SHOWN = 240;

export default function SelecaoModule() {
  const [env, setEnv] = useState<Env>(() => choice('env', 'escura', ['escura', 'clara']));
  const [s, setS] = useState(() => param('s', 0.3));
  const [mu, setMu] = useState(() => param('mu', 0));
  const [N, setN] = useState(() => param('N', 500));
  const [pC0, setPC0] = useState(() => param('pC0', 0.05));
  const [seed, setSeed] = useState(() => param('seed', 1));
  const rand = useRef<Rand>(mulberry32(seed));

  const sim = useStepper<Population>({
    create: () => {
      rand.current = mulberry32(seed * 7919 + 13);
      return createPopulation(N, pC0, rand.current);
    },
    step: (pop, h, t) => (crossings(t, h) > 0 && !pop.extinct ? nextGeneration(pop, env, s, mu, rand.current) : pop),
    sample: (pop) => {
      const q = alleleQ(pop.counts);
      return { pC: 1 - q, pCdet: 1 - pop.qDet, escuras: (100 * (pop.counts[0] + pop.counts[1])) / pop.g.length, sobrev: (100 * pop.survivors) / pop.g.length };
    },
    until: (pop) => pop.extinct,
    tEnd: GENS,
    dt: 1,
    sampleEvery: 1,
    timeScale: 4,
    resetKey: [N, pC0, seed],
  });

  const pop = sim.state;
  const q = alleleQ(pop.counts);
  const dark = pop.counts[0] + pop.counts[1];
  const sd = Math.sqrt(pop.varDrift);
  const het = pop.counts[1] / pop.g.length;
  const hetTheory = 2 * pop.qPool * (1 - pop.qPool);
  const hetSd = Math.sqrt((hetTheory * (1 - hetTheory)) / pop.g.length);

  const bark = useMemo(() => {
    const r = mulberry32(99);
    return Array.from({ length: 260 }, () => ({ x: r(), y: r(), rx: 6 + r() * 30, ry: 2 + r() * 8, a: r() * 0.6 - 0.3, k: r() }));
  }, []);
  const spots = useMemo(() => {
    const r = mulberry32(7);
    return Array.from({ length: SHOWN }, () => ({ x: 0.04 + r() * 0.92, y: 0.08 + r() * 0.86, a: r() * Math.PI * 2 }));
  }, []);

  const draw = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    clear(ctx, W, H);
    const top = 104;
    const h = H - top - 10;
    const light = env === 'clara';
    ctx.fillStyle = light ? '#B9B2A0' : '#2B2724';
    ctx.fillRect(10, top, W - 20, h);
    bark.forEach((b) => {
      ctx.fillStyle = light ? (b.k < 0.5 ? 'rgba(232,228,214,0.55)' : 'rgba(150,160,130,0.45)') : b.k < 0.5 ? 'rgba(15,13,12,0.6)' : 'rgba(70,64,58,0.5)';
      ctx.beginPath();
      ctx.ellipse(10 + b.x * (W - 20), top + b.y * h, b.rx, b.ry, b.a, 0, Math.PI * 2);
      ctx.fill();
    });
    const n = Math.min(SHOWN, pop.g.length);
    for (let i = 0; i < n; i++) {
      const sp = spots[i];
      const x = 10 + sp.x * (W - 20);
      const y = top + sp.y * h;
      const isDark = pop.g[i] < 2;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(sp.a);
      ctx.fillStyle = isDark ? '#1C1917' : '#EAE6DA';
      ctx.beginPath();
      ctx.ellipse(-5, 0, 6, 4, -0.5, 0, Math.PI * 2);
      ctx.ellipse(5, 0, 6, 4, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = isDark ? 'rgba(229,231,235,0.28)' : 'rgba(41,37,36,0.35)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.fillStyle = isDark ? '#44403C' : '#57534E';
      ctx.fillRect(-1, -4, 2, 8);
      if (!isDark) {
        ctx.fillStyle = 'rgba(60,55,50,0.6)';
        ctx.fillRect(-6, -1, 1.5, 1.5);
        ctx.fillRect(5, 1, 1.5, 1.5);
      }
      ctx.restore();
    }
    pill(ctx, `${light ? 'Casca clara (líquens)' : 'Casca escura (fuligem)'} · predação s = ${fmt(s, 2)}`, 20, top + 18, COLORS.amber, 'left');
    pill(ctx, `geração ${pop.gen} · sobreviveram ${pop.survivors}/${pop.g.length}`, W - 20, top + 18, COLORS.cyan, 'right');
    if (pop.extinct) pill(ctx, 'população extinta', W / 2, top + h / 2, COLORS.rose);
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = light ? '#1F2937' : COLORS.muted;
    ctx.textAlign = 'left';
    ctx.fillText(`mostrando ${n} de ${pop.g.length} mariposas`, 20, top + h - 8);
  };

  const exportar = () =>
    downloadJson(
      `selecao_${stamp()}.json`,
      buildModuleExport({
        modulo: 'selecao',
        titulo: 'Seleção natural em mariposas (Biston betularia)',
        metodo: 'Indivíduos: predação com aptidão por fenótipo, acasalamento ao acaso entre sobreviventes (Wright–Fisher) e mutação; comparação com o modelo determinístico',
        unidades: { t: 'geração', pC: 'frequência do alelo C (escuro)', escuras: '%', sobrev: '%' },
        parametros: { N, pC0, ambiente: env, s, mu, semente: seed },
        resultados: { geracao: pop.gen, pC: 1 - q, pCdeterministico: 1 - pop.qDet, CC: pop.counts[0], Cc: pop.counts[1], cc: pop.counts[2] },
        verificacao: [{ grandeza: 'p(C) simulado × determinístico', teorico: 1 - pop.qDet, simulado: 1 - q }],
        serie: sim.history,
      }),
    );

  return (
    <ModuleShell
      title="Seleção Natural"
      tema="Mariposas, pressão seletiva, deriva e mutação"
      status={sim.playing ? { text: 'Gerações passando', tone: 'run' } : sim.finished ? { text: pop.extinct ? 'Extinção' : `${GENS} gerações`, tone: 'done' } : { text: pop.gen > 0 ? 'Pausado' : 'Pronto', tone: pop.gen > 0 ? 'pause' : 'idle' }}
      keys={{ toggle: sim.toggle, step: sim.stepFrame, reset: sim.reset }}
      stats={[
        { label: 'Mariposas escuras', value: fmt((100 * dark) / pop.g.length, 1), unit: '%', accent: true },
        { label: 'Alelo C (escuro)', value: fmt(1 - q, 3), unit: '' },
        { label: 'CC/Cc/cc', value: `${pop.counts[0]}/${pop.counts[1]}/${pop.counts[2]}`, unit: '' },
        { label: 'Geração', value: String(pop.gen), unit: '' },
      ]}
      scene={<Scene draw={draw} label="Mariposas claras e escuras pousadas num tronco cuja cor depende do ambiente" />}
      charts={
        <>
          <TimeChart title="Frequência do alelo C" unit="" data={sim.history} series={[{ key: 'pC', label: 'simulado', color: COLORS.amber }, { key: 'pCdet', label: 'determinístico', color: COLORS.cyan }]} window={null} tUnit="ger." />
          <TimeChart title="Mariposas escuras" unit="%" data={sim.history} series={[{ key: 'escuras', label: 'escuras', color: COLORS.violet }]} window={null} tUnit="ger." />
          <TimeChart title="Sobrevivência à predação" unit="%" data={sim.history} series={[{ key: 'sobrev', label: 'sobreviventes', color: COLORS.green }]} window={null} tUnit="ger." />
        </>
      }
      panel={
        <>
          <Playback playing={sim.playing} finished={sim.finished} onToggle={sim.toggle} onStep={sim.stepFrame} onReset={sim.reset} speed={sim.speed} setSpeed={sim.setSpeed} startLabel="Iniciar" />
          <Section title="Ambiente (pode mudar durante a simulação)">
            <div className="flex flex-wrap gap-1.5">
              <Chip active={env === 'clara'} onClick={() => setEnv('clara')}>
                Casca clara (antes da indústria)
              </Chip>
              <Chip active={env === 'escura'} onClick={() => setEnv('escura')}>
                Casca escura (poluição)
              </Chip>
            </div>
            <Slider label="Intensidade da predação" symbol="s" value={s} min={0} max={0.8} step={0.01} unit="" digits={2} accent={COLORS.amber} hint="fração das mariposas destoantes comidas por geração" onChange={setS} />
            <Slider label="Taxa de mutação" symbol="μ" value={mu} min={0} max={0.01} step={0.0005} unit="" digits={4} accent={COLORS.violet} onChange={setMu} />
          </Section>
          <Section title="População inicial" right={<Chip active={false} onClick={() => setSeed((x) => x + 1)}>Nova semente</Chip>}>
            <Slider label="Tamanho" symbol="N" value={N} min={50} max={3000} step={50} unit="" digits={0} onChange={setN} />
            <Slider label="Frequência inicial de C" symbol="p₀" value={pC0} min={0.01} max={0.99} step={0.01} unit="" digits={2} accent="#1C1917" onChange={setPC0} />
          </Section>
          <VerifyTable
            empty="Inicie para comparar."
            rows={[
              pop.last && mu === 0
                ? { formula: pop.last.env === 'escura' ? "q' = q(1−sq)/(1−sq²)  (contra o recessivo)" : "q' = q(1−sp)/(1−s(1−q²))  (contra o dominante)", theory: haldane(pop.last.q, pop.last.env, pop.last.s), sim: pop.last.qNext, digits: 6, tol: 1e-12 }
                : { formula: "Fórmula clássica de q' (só com μ = 0)", theory: null, sim: null, note: mu > 0 ? 'Zere a mutação para comparar.' : 'Aguardando uma geração…' },
              {
                formula: `p(C) indivíduos ≈ determinístico (aceita ±${fmt(300 * sd / Math.max(1 - pop.qDet, 1e-6), 1)}% = 3σ de deriva)`,
                theory: pop.gen > 0 ? 1 - pop.qDet : null,
                sim: pop.gen > 0 ? 1 - q : null,
                digits: 4,
                tol: Math.max(1e-9, (3 * sd) / Math.max(1 - pop.qDet, 1e-6)),
                note: 'Aguardando uma geração…',
              },
              {
                formula: `Hardy–Weinberg: f(Cc) = 2pq ao nascer (aceita ±${fmt(300 * hetSd / Math.max(hetTheory, 1e-6), 1)}%)`,
                theory: pop.gen > 0 ? hetTheory : null,
                sim: pop.gen > 0 ? het : null,
                digits: 4,
                tol: Math.max(1e-9, (3 * hetSd) / Math.max(hetTheory, 1e-6)),
                note: 'Aguardando uma geração…',
              },
            ]}
          />
          <Section title="Dados" right={<ExportButton onClick={exportar} />}>
            <Note>
              Na Inglaterra industrial a fuligem escureceu os troncos e as mariposas escuras passaram a escapar dos pássaros: o alelo C se espalhou. O ambiente não cria a variação, só seleciona. Populações pequenas oscilam mais por acaso (deriva genética).
            </Note>
          </Section>
        </>
      }
    />
  );
}
