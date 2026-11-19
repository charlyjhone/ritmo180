import { useState } from 'react';
import ModuleShell from '../../shell/ModuleShell';
import Scene from '../../core/Scene';
import TimeChart from '../../core/TimeChart';
import { useStepper } from '../../core/stepper';
import { COLORS, clear, niceStep } from '../../core/canvas';
import { fmt } from '../../core/format';
import { buildModuleExport, downloadJson, stamp } from '../../core/export';
import { crossings } from '../../core/random';
import { Chip, ExportButton, Note, Playback, Section, Slider, VerifyTable, type VerifyRow } from '../../ui/controls';
import { type Ledger, compoundFV, equivalentRate, month, newLedger, pricePMT, sacTotalInterest, simpleFV } from './physics';
import { param, choice } from '../../core/params';

type Mode = 'aplicacao' | 'financiamento';

export default function JurosModule() {
  const [mode, setMode] = useState<Mode>(() => choice('mode', 'aplicacao', ['aplicacao', 'financiamento']));
  const [C, setC] = useState(() => param('C', 1000));
  const [A, setA] = useState(() => param('A', 0));
  const [PV, setPV] = useState(() => param('PV', 30000));
  const [rate, setRate] = useState(() => param('rate', 1)); // % ao mês
  const [n, setN] = useState(() => param('n', 36));
  const i = rate / 100;

  const sim = useStepper<Ledger>({
    create: () => newLedger(C, PV),
    step: (l, h, t) => (crossings(t, h) > 0 ? month(l, C, i, A, PV, n) : l),
    sample: (l) => ({ simples: l.simple, compostos: l.compound, investido: C + l.deposits, saldoPrice: l.balP, saldoSAC: l.balS, parcelaPrice: l.lastP, parcelaSAC: l.lastS }),
    tEnd: n,
    dt: 1,
    sampleEvery: 1,
    timeScale: Math.max(3, n / 8),
    resetKey: [C, A, PV, rate, n],
  });
  const l = sim.state;
  const hist = sim.history;
  const pmt = pricePMT(PV, i, n);

  const draw = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    clear(ctx, W, H);
    const top = 112;
    const x0 = 70;
    const x1 = W - 20;
    const y0 = H - 34;
    const y1 = top + 26;
    const months = n;
    const bw = (x1 - x0) / (months + 1);
    const vals = mode === 'aplicacao' ? [compoundFV(C, i, n, A), simpleFV(C, i, n, A)] : [pricePMT(PV, i, n), PV / n + PV * i];
    const vmax = Math.max(...vals) * 1.08;
    const Y = (v: number) => y0 - ((y0 - y1) * v) / vmax;
    // eixos
    ctx.strokeStyle = COLORS.axis;
    ctx.beginPath();
    ctx.moveTo(x0, y1);
    ctx.lineTo(x0, y0);
    ctx.lineTo(x1, y0);
    ctx.stroke();
    const step = niceStep(vmax / 5);
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = COLORS.label;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let v = 0; v <= vmax; v += step) {
      ctx.fillText(fmt(v, 0), x0 - 6, Y(v));
      ctx.strokeStyle = COLORS.gridMinor;
      ctx.beginPath();
      ctx.moveTo(x0, Y(v));
      ctx.lineTo(x1, Y(v));
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const mStep = Math.max(1, Math.round(niceStep(months / 10)));
    for (let m = 0; m <= months; m += mStep) ctx.fillText(String(m), x0 + (m + 0.5) * bw, y0 + 4);
    ctx.fillText('mês', x1 - 10, y0 + 16);
    if (mode === 'aplicacao') {
      hist.forEach((s) => {
        const x = x0 + s.t * bw;
        const inv = s.investido;
        ctx.fillStyle = 'rgba(148,163,184,0.55)';
        ctx.fillRect(x + bw * 0.1, Y(inv), bw * 0.8, y0 - Y(inv));
        ctx.fillStyle = 'rgba(52,211,153,0.8)';
        ctx.fillRect(x + bw * 0.1, Y(s.compostos), bw * 0.8, Y(inv) - Y(s.compostos));
      });
      // juros simples: reta
      ctx.strokeStyle = COLORS.amber;
      ctx.lineWidth = 2;
      ctx.beginPath();
      hist.forEach((s, k) => (k ? ctx.lineTo(x0 + (s.t + 0.5) * bw, Y(s.simples)) : ctx.moveTo(x0 + (s.t + 0.5) * bw, Y(s.simples))));
      ctx.stroke();
      ctx.lineWidth = 1;
      legend(ctx, x0 + 10, y1 - 16, [
        ['#94A3B8', 'investido'],
        [COLORS.green, 'juros compostos (sobre juros)'],
        [COLORS.amber, 'montante a juros simples'],
      ]);
    } else {
      hist.forEach((s) => {
        if (s.t === 0) return;
        const x = x0 + s.t * bw;
        ctx.fillStyle = 'rgba(56,189,248,0.75)';
        ctx.fillRect(x + bw * 0.08, Y(s.parcelaPrice), bw * 0.4, y0 - Y(s.parcelaPrice));
        ctx.fillStyle = 'rgba(244,114,182,0.75)';
        ctx.fillRect(x + bw * 0.5, Y(s.parcelaSAC), bw * 0.4, y0 - Y(s.parcelaSAC));
      });
      // saldos devedores em escala própria (linha tracejada, eixo à direita)
      const Ys = (v: number) => y0 - ((y0 - y1) * v) / (PV * 1.08);
      const line = (key: string, c: string) => {
        ctx.strokeStyle = c;
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        hist.forEach((s, k) => (k ? ctx.lineTo(x0 + (s.t + 0.5) * bw, Ys(s[key])) : ctx.moveTo(x0 + (s.t + 0.5) * bw, Ys(s[key]))));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
      };
      ctx.fillStyle = COLORS.label;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const sStep = niceStep(PV / 4);
      for (let v = 0; v <= PV * 1.08; v += sStep) ctx.fillText(fmt(v, 0), x1 - 44, Ys(v) - 6);
      line('saldoPrice', COLORS.cyan);
      line('saldoSAC', COLORS.pink);
      legend(ctx, x0 + 10, y1 - 16, [
        [COLORS.cyan, 'parcela Price (fixa)'],
        [COLORS.pink, 'parcela SAC (decrescente)'],
        ['#E5E7EB', '- - saldo (eixo direito)'],
      ]);
    }
  };

  const rows: VerifyRow[] =
    mode === 'aplicacao'
      ? [
          { formula: 'M = C(1+i)ⁿ + A·((1+i)ⁿ−1)/i  (mês a mês)', theory: compoundFV(C, i, l.m, A), sim: l.compound, digits: 2, tol: 1e-10 },
          { formula: 'M = C(1 + i·n) + aportes  (juros simples)', theory: simpleFV(C, i, l.m, A), sim: l.simple, digits: 2, tol: 1e-10 },
          {
            formula: 'Taxa anual equivalente = (1+i)¹² − 1',
            theory: equivalentRate(i, 12),
            sim: A === 0 && C > 0 && l.m >= 12 ? hist[12].compostos / C - 1 : null,
            digits: 6,
            tol: 1e-10,
            note: A > 0 || C === 0 ? 'Use capital > 0 e aporte zero para medir a taxa.' : 'Aguardando 12 meses…',
          },
        ]
      : [
          { formula: 'Price: Σ amortizações = PV  (saldo zera)', theory: l.m === n ? PV : null, sim: l.m === n ? l.amortP : null, digits: 2, tol: 1e-10, note: 'Aguardando a última parcela…' },
          { formula: 'Price: total pago = n·PMT', theory: l.m * pmt, sim: l.paidP, digits: 2, tol: 1e-12 },
          { formula: 'SAC: juros totais = PV·i·(n+1)/2', theory: l.m === n ? sacTotalInterest(PV, i, n) : null, sim: l.m === n ? l.intS : null, digits: 2, tol: 1e-10, note: 'Aguardando a última parcela…' },
        ];

  const exportar = () =>
    downloadJson(
      `juros_${stamp()}.json`,
      buildModuleExport({
        modulo: 'juros',
        titulo: mode === 'aplicacao' ? 'Juros simples × compostos' : 'Financiamento Price × SAC',
        metodo: 'Saldos atualizados mês a mês e comparados com as fórmulas fechadas',
        unidades: { t: 'mês', valores: 'R$' },
        parametros: { capital: C, aporteMensal: A, financiado: PV, taxaMensal: i, meses: n },
        resultados: { simples: l.simple, compostos: l.compound, pmtPrice: pmt, totalPrice: l.paidP, totalSAC: l.paidS, jurosPrice: l.intP, jurosSAC: l.intS },
        verificacao: rows.filter((r) => r.theory !== null && r.sim !== null).map((r) => ({ grandeza: r.formula, teorico: r.theory!, simulado: r.sim! })),
        serie: hist,
      }),
    );

  return (
    <ModuleShell
      title="Matemática Financeira"
      tema="Juros simples e compostos, taxa equivalente, Price e SAC"
      status={sim.playing ? { text: 'Meses passando', tone: 'run' } : sim.finished ? { text: `${n} meses`, tone: 'done' } : { text: l.m ? 'Pausado' : 'Pronto', tone: l.m ? 'pause' : 'idle' }}
      keys={{ toggle: sim.toggle, step: sim.stepFrame, reset: sim.reset }}
      stats={
        mode === 'aplicacao'
          ? [
              { label: 'Juros compostos', value: fmt(l.compound, 2), unit: 'R$', accent: true },
              { label: 'Juros simples', value: fmt(l.simple, 2), unit: 'R$' },
              { label: 'Diferença', value: fmt(l.compound - l.simple, 2), unit: 'R$' },
              { label: 'Mês', value: String(l.m), unit: `de ${n}` },
            ]
          : [
              { label: 'Parcela Price', value: fmt(pmt, 2), unit: 'R$', accent: true },
              { label: 'Parcela SAC agora', value: fmt(l.m ? l.lastS : PV / n + PV * i, 2), unit: 'R$' },
              { label: 'Juros a mais na Price', value: fmt(l.intP - l.intS, 2), unit: 'R$' },
              { label: 'Mês', value: String(l.m), unit: `de ${n}` },
            ]
      }
      scene={<Scene draw={draw} label="Gráfico de barras mês a mês do montante ou das parcelas do financiamento" />}
      charts={
        mode === 'aplicacao' ? (
          <TimeChart title="Montante" unit="R$" data={hist} series={[{ key: 'compostos', label: 'compostos', color: COLORS.green }, { key: 'simples', label: 'simples', color: COLORS.amber }, { key: 'investido', label: 'investido', color: '#94A3B8' }]} window={null} tUnit="mês" />
        ) : (
          <TimeChart title="Saldo devedor" unit="R$" data={hist} series={[{ key: 'saldoPrice', label: 'Price', color: COLORS.cyan }, { key: 'saldoSAC', label: 'SAC', color: COLORS.pink }]} window={null} tUnit="mês" />
        )
      }
      panel={
        <>
          <Playback playing={sim.playing} finished={sim.finished} onToggle={sim.toggle} onStep={sim.stepFrame} onReset={sim.reset} speed={sim.speed} setSpeed={sim.setSpeed} startLabel="Passar os meses" />
          <Section title="Situação">
            <div className="flex flex-wrap gap-1.5">
              <Chip active={mode === 'aplicacao'} onClick={() => setMode('aplicacao')}>Aplicação</Chip>
              <Chip active={mode === 'financiamento'} onClick={() => setMode('financiamento')}>Financiamento</Chip>
            </div>
          </Section>
          <Section title={mode === 'aplicacao' ? 'Aplicação' : 'Financiamento'}>
            {mode === 'aplicacao' ? (
              <>
                <Slider label="Capital inicial" symbol="C" value={C} min={0} max={20000} step={100} unit="R$" digits={0} accent={COLORS.green} onChange={setC} />
                <Slider label="Aporte mensal" symbol="A" value={A} min={0} max={2000} step={50} unit="R$" digits={0} accent={COLORS.violet} onChange={setA} />
              </>
            ) : (
              <Slider label="Valor financiado" symbol="PV" value={PV} min={1000} max={300000} step={1000} unit="R$" digits={0} accent={COLORS.cyan} onChange={setPV} />
            )}
            <Slider label="Taxa de juros" symbol="i" value={rate} min={0.1} max={10} step={0.05} unit="% a.m." digits={2} accent={COLORS.amber} hint={`equivale a ${fmt(100 * equivalentRate(i, 12), 2)}% ao ano`} onChange={setRate} />
            <Slider label="Prazo" symbol="n" value={n} min={1} max={360} step={1} unit="meses" digits={0} onChange={setN} />
          </Section>
          <VerifyTable empty="Passe os meses para comparar." rows={rows} />
          <Section title="Dados" right={<ExportButton onClick={exportar} />}>
            <Note>
              {mode === 'aplicacao'
                ? 'Nos juros simples o rendimento mensal é sempre o mesmo (cresce em linha reta: progressão aritmética). Nos compostos os juros rendem juros (progressão geométrica): a diferença explode com o tempo.'
                : 'Na Price as parcelas são iguais, mas no começo quase tudo é juros. No SAC a amortização é fixa e as parcelas caem; o total de juros é menor porque o saldo devedor cai mais rápido.'}
            </Note>
          </Section>
        </>
      }
    />
  );
}

function legend(ctx: CanvasRenderingContext2D, x: number, y: number, items: [string, string][]) {
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let cx = x;
  items.forEach(([c, t]) => {
    ctx.fillStyle = c;
    ctx.fillRect(cx, y - 4, 10, 8);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(t, cx + 14, y);
    cx += ctx.measureText(t).width + 30;
  });
}
