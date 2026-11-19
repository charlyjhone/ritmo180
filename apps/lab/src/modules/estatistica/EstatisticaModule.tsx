import { useRef, useState } from 'react';
import ModuleShell from '../../shell/ModuleShell';
import Scene from '../../core/Scene';
import TimeChart from '../../core/TimeChart';
import { useStepper } from '../../core/stepper';
import { COLORS, clear } from '../../core/canvas';
import { fmt } from '../../core/format';
import { buildModuleExport, downloadJson, stamp } from '../../core/export';
import { crossings, mulberry32, type Rand } from '../../core/random';
import { Chip, ExportButton, Note, Playback, Section, Slider, Toggle, VerifyTable } from '../../ui/controls';
import { type Ball, binomialMoments, newBall, normalPdf, pmf, summary, varianceSE } from './physics';
import { param } from '../../core/params';

const ROW_T = 0.09; // s por fileira de pinos

interface Board {
  flying: Ball[];
  counts: number[];
  released: number;
}

export default function EstatisticaModule() {
  const [n, setN] = useState(() => param('n', 12));
  const [p, setP] = useState(() => param('p', 0.5));
  const [rate, setRate] = useState(() => param('rate', 40));
  const [total, setTotal] = useState(() => param('total', 1000));
  const [showBin, setShowBin] = useState(true);
  const [showNormal, setShowNormal] = useState(false);
  const [seed, setSeed] = useState(() => param('seed', 1));
  const rand = useRef<Rand>(mulberry32(1));

  const sim = useStepper<Board>({
    create: () => {
      rand.current = mulberry32(seed * 65537 + n);
      return { flying: [], counts: new Array(n + 1).fill(0), released: 0 };
    },
    step: (b, h, t) => {
      const k = Math.min(crossings(t * rate, h * rate), total - b.released);
      for (let i = 0; i < k; i++) b.flying.push(newBall(n, p, t + h, rand.current));
      b.released += Math.max(0, k);
      const tl = t + h;
      b.flying = b.flying.filter((ball) => {
        if (tl - ball.born >= (n + 1) * ROW_T) {
          b.counts[ball.k]++;
          return false;
        }
        return true;
      });
      return b;
    },
    sample: (b) => {
      const s = summary(b.counts);
      return s ? { media: s.mean, np: n * p, dp: s.sd, dpT: Math.sqrt(n * p * (1 - p)) } : { media: n * p, np: n * p, dp: 0, dpT: Math.sqrt(n * p * (1 - p)) };
    },
    until: (b) => b.released >= total && b.flying.length === 0,
    dt: 1 / 240,
    sampleEvery: 0.1,
    timeScale: 1,
    resetKey: [n, p, rate, total, seed],
  });

  const b = sim.state;
  const st = summary(b.counts);
  const landed = st?.N ?? 0;
  const mom = binomialMoments(n, p);
  const npq = n * p * (1 - p);

  const draw = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    clear(ctx, W, H);
    const top = 110;
    const binH = Math.max(90, (H - top) * 0.38);
    const pegTop = top + 16;
    const pegBot = H - binH - 24;
    const dy = (pegBot - pegTop) / n;
    const dx = Math.min(dy * 1.15, (W - 60) / (n + 1));
    const cx = W / 2;
    const px = (row: number, rights: number) => cx + (rights - row / 2) * dx;
    // pinos
    ctx.fillStyle = '#475569';
    for (let r = 0; r < n; r++)
      for (let i = 0; i <= r; i++) {
        ctx.beginPath();
        ctx.arc(px(r, i), pegTop + r * dy, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    // bolinhas em voo
    const tNow = sim.t;
    ctx.fillStyle = '#FDE047';
    for (const ball of b.flying) {
      const u = (tNow - ball.born) / ROW_T; // fileiras percorridas
      const r = Math.min(n, Math.floor(u));
      const f = u - r;
      let rights = 0;
      for (let i = 0; i < r; i++) rights += ball.path[i];
      const x0 = px(r, rights);
      const x1 = r < n ? px(r + 1, rights + ball.path[r]) : x0;
      const x = x0 + (x1 - x0) * f;
      const y = pegTop - 8 + r * dy + dy * f - Math.sin(Math.PI * f) * dy * 0.35;
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // caixas e histograma
    const by = H - 22;
    const maxC = Math.max(1, ...b.counts, ...b.counts.map((_, k) => (showBin ? landed * pmf(n, p, k) : 0)));
    const scale = (binH - 20) / maxC;
    for (let k = 0; k <= n; k++) {
      const x = px(n, k);
      ctx.fillStyle = 'rgba(56,189,248,0.75)';
      const h = b.counts[k] * scale;
      ctx.fillRect(x - dx * 0.42, by - h, dx * 0.84, h);
      ctx.strokeStyle = '#1F2937';
      ctx.beginPath();
      ctx.moveTo(x + dx / 2, by);
      ctx.lineTo(x + dx / 2, by - binH + 10);
      ctx.stroke();
      if (showBin && landed > 0) {
        const e = landed * pmf(n, p, k) * scale;
        ctx.strokeStyle = '#F8FAFC';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - dx * 0.42, by - e);
        ctx.lineTo(x + dx * 0.42, by - e);
        ctx.stroke();
        ctx.lineWidth = 1;
      }
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = COLORS.label;
      ctx.textAlign = 'center';
      ctx.fillText(String(k), x, by + 13);
    }
    if (showNormal && landed > 0 && npq > 0) {
      ctx.strokeStyle = COLORS.rose;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 300; i++) {
        const k = -0.5 + ((n + 1) * i) / 300;
        const y = by - landed * normalPdf(k, n * p, npq) * scale;
        if (i) ctx.lineTo(px(n, k), y);
        else ctx.moveTo(px(n, k), y);
      }
      ctx.stroke();
    }
    if (st) {
      const mx = px(n, st.mean);
      ctx.strokeStyle = COLORS.amber;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(mx, by);
      ctx.lineTo(mx, by - binH + 6);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.amber;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText(`média ${fmt(st.mean, 3)}`, mx, by - binH + 2);
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(`${landed} de ${total} bolinhas · p(direita) = ${fmt(p, 2)}`, 14, top + 8);
  };

  const sdMean = landed ? Math.sqrt(npq / landed) : 0;
  const seVar = landed > 3 ? varianceSE(n, p, landed) : 0;

  const exportar = () =>
    downloadJson(
      `estatistica_${stamp()}.json`,
      buildModuleExport({
        modulo: 'estatistica',
        titulo: `Tabuleiro de Galton: n = ${n}, p = ${p}`,
        metodo: 'Cada bolinha decide n vezes (direita com probabilidade p); contagem por caixa comparada com a binomial',
        unidades: { t: 's', k: 'número de desvios para a direita' },
        parametros: { n, p, bolinhas: total, semente: seed },
        resultados: { contagens: b.counts.join(" "), ...(st ?? {}) },
        verificacao: [
          { grandeza: 'média', teorico: n * p, simulado: st?.mean ?? NaN },
          { grandeza: 'variância', teorico: npq, simulado: st?.variance ?? NaN },
        ],
        serie: sim.history,
      }),
    );

  return (
    <ModuleShell
      title="Estatística e Probabilidade"
      tema="Tabuleiro de Galton, binomial, média, mediana, moda, desvio padrão"
      status={sim.playing ? { text: 'Bolinhas caindo', tone: 'run' } : sim.finished ? { text: `${landed} bolinhas`, tone: 'done' } : { text: landed ? 'Pausado' : 'Pronto', tone: landed ? 'pause' : 'idle' }}
      keys={{ toggle: sim.toggle, step: sim.stepFrame, reset: sim.reset }}
      stats={[
        { label: `Média (np = ${fmt(n * p, 2)})`, value: st ? fmt(st.mean, 2) : '—', unit: '', accent: true },
        { label: 'Mediana · Moda', value: st ? `${fmt(st.median, 1)} · ${st.mode}` : '—', unit: '' },
        { label: `Desvio (√npq = ${fmt(Math.sqrt(npq), 2)})`, value: st ? fmt(st.sd, 2) : '—', unit: '' },
        { label: 'Bolinhas', value: String(landed), unit: '' },
      ]}
      scene={<Scene draw={draw} label="Tabuleiro de Galton: bolinhas desviando em pinos e formando um histograma binomial nas caixas" />}
      charts={
        <>
          <TimeChart title="Média acumulada" unit="" data={sim.history} series={[{ key: 'media', label: 'média', color: COLORS.amber }, { key: 'np', label: 'np', color: COLORS.text }]} window={null} zero={false} />
          <TimeChart title="Desvio padrão" unit="" data={sim.history} series={[{ key: 'dp', label: 'amostral', color: COLORS.cyan }, { key: 'dpT', label: '√npq', color: COLORS.text }]} window={null} />
        </>
      }
      panel={
        <>
          <Playback playing={sim.playing} finished={sim.finished} onToggle={sim.toggle} onStep={sim.stepFrame} onReset={sim.reset} speed={sim.speed} setSpeed={sim.setSpeed} startLabel="Soltar" />
          <Section title="Tabuleiro">
            <Slider label="Fileiras de pinos" symbol="n" value={n} min={1} max={24} step={1} unit="" digits={0} onChange={setN} />
            <Slider label="Probabilidade de ir à direita" symbol="p" value={p} min={0.05} max={0.95} step={0.05} unit="" digits={2} accent={COLORS.amber} onChange={setP} />
          </Section>
          <Section title="Bolinhas" right={<Chip active={false} onClick={() => setSeed((x) => x + 1)}>Nova semente</Chip>}>
            <Slider label="Total" symbol="N" value={total} min={10} max={5000} step={10} unit="" digits={0} onChange={setTotal} />
            <Slider label="Ritmo" symbol="r" value={rate} min={2} max={250} step={1} unit="/s" digits={0} onChange={setRate} />
            <Toggle label="Binomial esperada" checked={showBin} onChange={setShowBin} color="#F8FAFC" />
            <Toggle label="Curva normal N(np, npq)" checked={showNormal} onChange={setShowNormal} color={COLORS.rose} />
          </Section>
          <VerifyTable
            empty="Solte bolinhas para comparar."
            rows={[
              { formula: 'Σ k·C(n,k)pᵏqⁿ⁻ᵏ = np', theory: n * p, sim: mom.mean, digits: 6, tol: 1e-12 },
              { formula: 'Σ (k−np)²·P(k) = npq', theory: npq, sim: mom.variance, digits: 6, tol: 1e-10 },
              { formula: `média amostral ≈ np${landed ? ` (aceita ±${fmt((300 * sdMean) / (n * p), 2)}%)` : ''}`, theory: landed ? n * p : null, sim: st?.mean ?? null, digits: 4, tol: Math.max(1e-12, (3 * sdMean) / (n * p)), note: 'Aguardando bolinhas…' },
              { formula: `variância amostral ≈ npq${landed > 3 ? ` (aceita ±${fmt((300 * seVar) / npq, 1)}%)` : ''}`, theory: landed > 3 ? npq : null, sim: landed > 3 ? st!.variance : null, digits: 4, tol: Math.max(1e-12, (3 * seVar) / npq), note: 'Aguardando bolinhas…' },
            ]}
          />
          <Section title="Dados" right={<ExportButton onClick={exportar} />}>
            <Note>
              Cada pino é uma moeda: direita com probabilidade p. A caixa final conta quantas vezes a bolinha foi para a direita, então segue a binomial C(n,k)·pᵏ·(1−p)ⁿ⁻ᵏ. Com muitas fileiras o histograma se aproxima da curva normal (teorema central do limite).
            </Note>
          </Section>
        </>
      }
    />
  );
}
