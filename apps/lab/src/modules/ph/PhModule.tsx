import { useState } from 'react';
import ModuleShell from '../../shell/ModuleShell';
import Scene from '../../core/Scene';
import TimeChart from '../../core/TimeChart';
import { useStepper } from '../../core/stepper';
import { COLORS, clear, pill } from '../../core/canvas';
import { fmt } from '../../core/format';
import { buildModuleExport, downloadJson, stamp } from '../../core/export';
import { Chip, ExportButton, Note, Playback, Section, Slider, VerifyTable } from '../../ui/controls';
import { ANALYTES, EVERYDAY, INDICATORS, equivalenceVolume, exactPH, halfEquivalencePH, indicatorColor, steepestPoint, textbookInitialPH } from './physics';
import { param, choice } from '../../core/params';

/** Cor da escala de pH (vermelho ácido → verde neutro → roxo básico). */
function scaleColor(pH: number) {
  const stops: [number, number[]][] = [
    [0, [220, 38, 38]],
    [3, [249, 115, 22]],
    [6, [234, 179, 8]],
    [7, [34, 197, 94]],
    [9, [6, 182, 212]],
    [11, [37, 99, 235]],
    [14, [126, 34, 206]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (pH <= stops[i][0]) {
      const [a, ca] = stops[i - 1];
      const [b, cb] = stops[i];
      const u = (pH - a) / (b - a);
      return `rgb(${ca.map((c, k) => Math.round(c + (cb[k] - c) * u)).join(',')})`;
    }
  }
  return 'rgb(126,34,206)';
}

export default function PhModule() {
  const [anId, setAnId] = useState(() => choice<string>('anId', 'CH3COOH', ANALYTES.map((a) => a.id)));
  const [Ca, setCa] = useState(() => param('Ca', 0.1));
  const [Va, setVa] = useState(() => param('Va', 25));
  const [Ct, setCt] = useState(() => param('Ct', 0.1));
  const [indId, setIndId] = useState(() => choice<string>('indId', 'fenol', INDICATORS.map((i) => i.id)));
  const an = ANALYTES.find((a) => a.id === anId)!;
  const ind = INDICATORS.find((i) => i.id === indId)!;
  const Veq = equivalenceVolume(Ca, Va, Ct);
  const Vend = 2 * Veq;

  // "tempo" da simulação = volume de titulante adicionado (mL)
  const sim = useStepper<{ V: number }>({
    create: () => ({ V: 0 }),
    step: (s, h) => ({ V: s.V + h }),
    sample: (s) => ({ pH: exactPH(an, Ca, Va, Ct, s.V) }),
    tEnd: Vend,
    dt: Veq / 400,
    sampleEvery: Veq / 400,
    timeScale: Vend / 14,
    resetKey: [anId, Ca, Va, Ct],
  });

  const Vt = sim.state.V;
  const pH = exactPH(an, Ca, Va, Ct, Vt);
  const hist = sim.history;
  const passed = Vt > Veq * 1.15;
  const VeqMeas = passed ? steepestPoint(hist.map((q) => q.t), hist.map((q) => q.pH)) : null;
  const pH0 = exactPH(an, Ca, Va, Ct, 0);
  const pH0book = textbookInitialPH(an, Ca);
  const pHalf = halfEquivalencePH(an);
  const pHhalfSim = Vt >= Veq / 2 ? exactPH(an, Ca, Va, Ct, Veq / 2) : null;
  const pHeqSim = Vt >= Veq ? exactPH(an, Ca, Va, Ct, Veq) : null;

  const draw = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    clear(ctx, W, H);
    const top = 112;
    const avail = H - top - 20;
    const cx = Math.min(W * 0.38, W - 260);
    // bureta
    const bTop = top + 6;
    const bH = Math.max(100, avail * 0.48);
    const bW = 22;
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - bW / 2, bTop, bW, bH);
    const frac = Math.max(0, 1 - Vt / Vend);
    ctx.fillStyle = 'rgba(203,213,225,0.35)';
    ctx.fillRect(cx - bW / 2 + 2, bTop + (1 - frac) * bH, bW - 4, frac * bH);
    for (let k = 0; k <= 10; k++) {
      ctx.fillStyle = COLORS.label;
      ctx.fillRect(cx + bW / 2 - 7, bTop + (k / 10) * bH, 6, 1);
    }
    ctx.fillStyle = '#64748B';
    ctx.fillRect(cx - 3, bTop + bH, 6, 18);
    ctx.fillRect(cx - 14, bTop + bH + 6, 28, 5);
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${an.titrant} ${fmt(Ct, 2)} mol/L`, cx - bW / 2 - 8, bTop + 12);
    ctx.fillText(`adicionado ${fmt(Vt, 2)} mL`, cx - bW / 2 - 8, bTop + 28);
    // gota
    const dropY0 = bTop + bH + 22;
    const bkTop = dropY0 + Math.max(40, avail * 0.12);
    if (sim.playing) {
      const ph = (Vt / (Veq / 25)) % 1;
      ctx.fillStyle = 'rgba(203,213,225,0.8)';
      ctx.beginPath();
      ctx.arc(cx, dropY0 + ph * (bkTop - dropY0 + 10), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // béquer
    const bkW = 150;
    const bkH = Math.max(90, Math.min(160, H - bkTop - 30));
    const level = Math.min(0.92, 0.35 + ((Va + Vt) / (Va + Vend)) * 0.55);
    ctx.fillStyle = indicatorColor(ind, pH);
    ctx.fillRect(cx - bkW / 2 + 3, bkTop + bkH * (1 - level), bkW - 6, bkH * level - 3);
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - bkW / 2, bkTop);
    ctx.lineTo(cx - bkW / 2, bkTop + bkH);
    ctx.lineTo(cx + bkW / 2, bkTop + bkH);
    ctx.lineTo(cx + bkW / 2, bkTop);
    ctx.stroke();
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`${an.name} · ${fmt(Va, 0)} mL de ${fmt(Ca, 2)} mol/L + ${ind.name}`, cx, bkTop + bkH + 8);
    // pHmetro
    pill(ctx, `pH ${fmt(pH, 2)}`, cx + bkW / 2 + 60, bkTop + bkH * 0.4, scaleColor(pH));

    // escala de pH do cotidiano
    const sx = W - 200;
    const sy0 = top + 10;
    const sy1 = H - 26;
    const Y = (p: number) => sy0 + ((14 - p) / 14) * (sy1 - sy0);
    for (let p = 0; p < 14; p += 0.25) {
      ctx.fillStyle = scaleColor(p + 0.125);
      ctx.fillRect(sx, Y(p + 0.25), 14, Y(p) - Y(p + 0.25) + 0.5);
    }
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.label;
    for (let p = 0; p <= 14; p += 2) ctx.fillText(`${p}`, sx - 4, Y(p));
    ctx.textAlign = 'left';
    let lastY = -100;
    for (const e of [...EVERYDAY].sort((a, b) => b.pH - a.pH)) {
      const yy = Math.max(Y(e.pH), lastY + 11);
      if (yy > sy1 + 4) break;
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(`${e.name} ${fmt(e.pH, 1)}`, sx + 20, yy);
      lastY = yy;
    }
    ctx.strokeStyle = COLORS.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx - 8, Y(pH));
    ctx.lineTo(sx + 22, Y(pH));
    ctx.stroke();
  };

  const exportar = () =>
    downloadJson(
      `titulacao_${stamp()}.json`,
      buildModuleExport({
        modulo: 'ph',
        titulo: 'pH e titulação',
        metodo: 'pH exato pelo balanço de cargas (bissecção em log[H⁺]); ponto de equivalência pela máxima inclinação da curva',
        unidades: { t: 'mL de titulante', pH: '—' },
        parametros: { analito: an.name, Ca, Va_mL: Va, titulante: an.titrant, Ct, indicador: ind.name },
        resultados: { Veq_formula: Veq, Veq_curva: VeqMeas, pHinicialExato: pH0, pHinicialFormula: pH0book, pHmeiaEquivalencia: pHhalfSim, pHequivalencia: pHeqSim },
        verificacao: VeqMeas !== null ? [{ grandeza: 'V_eq = Ca·Va/Ct (mL)', teorico: Veq, simulado: VeqMeas }] : [],
        serie: hist,
      }),
    );

  return (
    <ModuleShell
      title="pH e Titulação"
      tema="Ácidos, bases, indicadores, ponto de equivalência"
      status={
        sim.playing
          ? { text: Vt < Veq ? 'Gotejando' : 'Após a equivalência', tone: 'run' }
          : sim.finished
            ? { text: 'Titulação concluída', tone: 'done' }
            : { text: Vt > 0 ? 'Pausado' : 'Pronto', tone: Vt > 0 ? 'pause' : 'idle' }
      }
      keys={{ toggle: sim.toggle, step: sim.stepFrame, reset: sim.reset }}
      stats={[
        { label: 'pH', value: fmt(pH, 2), unit: '', accent: true },
        { label: 'pOH', value: fmt(14 - pH, 2), unit: '' },
        { label: 'Volume adicionado', value: fmt(Vt, 2), unit: 'mL' },
        { label: 'Equivalência prevista', value: fmt(Veq, 2), unit: 'mL' },
      ]}
      scene={<Scene draw={draw} label="Bureta gotejando titulante num béquer com indicador e escala de pH do cotidiano" />}
      charts={
        <>
          <TimeChart title="Curva de titulação" unit="pH" data={hist} series={[{ key: 'pH', label: 'pH', color: COLORS.cyan }]} window={null} tUnit="mL" />
        </>
      }
      panel={
        <>
          <Playback playing={sim.playing} finished={sim.finished} onToggle={sim.toggle} onStep={sim.stepFrame} onReset={sim.reset} speed={sim.speed} setSpeed={sim.setSpeed} startLabel="Abrir a torneira" />
          <Section title="Solução no béquer">
            <div className="flex flex-wrap gap-1.5">
              {ANALYTES.map((a) => (
                <Chip key={a.id} active={anId === a.id} onClick={() => setAnId(a.id)}>
                  {a.name}
                </Chip>
              ))}
            </div>
            <Slider label="Concentração" symbol="C" value={Ca} min={0.01} max={0.5} step={0.01} unit="mol/L" digits={2} onChange={setCa} />
            <Slider label="Volume" symbol="V" value={Va} min={10} max={50} step={1} unit="mL" digits={0} onChange={setVa} />
          </Section>
          <Section title={`Titulante (${an.titrant})`}>
            <Slider label="Concentração" symbol="C_t" value={Ct} min={0.05} max={0.5} step={0.01} unit="mol/L" digits={2} accent="#A78BFA" onChange={setCt} />
            <div className="flex flex-wrap gap-1.5">
              {INDICATORS.map((i) => (
                <Chip key={i.id} active={indId === i.id} onClick={() => setIndId(i.id)} title={`viragem ${i.low}–${i.high}`}>
                  {i.name}
                </Chip>
              ))}
            </div>
            <Note>
              Viragem da {ind.name.toLowerCase()}: pH {fmt(ind.low, 1)} a {fmt(ind.high, 1)}.
            </Note>
          </Section>
          <VerifyTable
            empty="Titule até passar do ponto de equivalência."
            rows={[
              { formula: 'V_eq = Ca·Va/Ct  (máxima inclinação da curva)', theory: Veq, sim: VeqMeas, digits: 3, tol: 2e-3, note: 'Passe do ponto de equivalência…' },
              {
                formula: an.K === Infinity ? (an.kind === 'acido' ? 'pH inicial = −log C' : 'pH inicial = 14 + log C') : 'pH inicial ≈ ½(pK − log C)',
                theory: pH0book,
                sim: pH0,
                digits: 3,
                tol: 1e-2,
              },
              ...(pHalf !== null
                ? [{ formula: an.kind === 'acido' ? 'pH(V_eq/2) ≈ pKa (Henderson)' : 'pH(V_eq/2) ≈ pKa do NH₄⁺', theory: pHalf, sim: pHhalfSim, digits: 3, tol: 1e-2, note: 'Chegue à meia-equivalência…' }]
                : [{ formula: 'pH na equivalência = 7 (forte + forte)', theory: 7, sim: pHeqSim, digits: 4, tol: 1e-6, note: 'Chegue à equivalência…' }]),
            ]}
          />
          <Section title="Dados" right={<ExportButton onClick={exportar} />}>
            <Note>
              O pH é calculado sem aproximações (balanço de cargas com Kw = 10⁻¹⁴); as fórmulas do ensino médio aparecem como comparação. Com ácido fraco, a equivalência fica em pH básico, por isso a fenolftaleína é o indicador
              adequado.
            </Note>
          </Section>
        </>
      }
    />
  );
}
