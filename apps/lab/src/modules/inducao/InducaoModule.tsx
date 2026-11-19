import { useState } from 'react';
import ModuleShell from '../../shell/ModuleShell';
import Scene from '../../core/Scene';
import TimeChart from '../../core/TimeChart';
import { measuredPeriod, useStepper, type Sample } from '../../core/stepper';
import { COLORS, arrow, clear, fitView, pill } from '../../core/canvas';
import { fmt } from '../../core/format';
import { buildModuleExport, downloadJson, stamp } from '../../core/export';
import { Chip, ExportButton, Note, Playback, Section, Slider, VerifyTable } from '../../ui/controls';
import { dipoleFlux, fluxRate, genFlux, genPeak, magnetPeak, magnetPeakZ, type GenParams, type MagnetParams } from './physics';
import { param, choice } from '../../core/params';

type Mode = 'gerador' | 'ima';
const ZMAX = 0.25; // o ímã vai de −25 cm a +25 cm

interface St {
  theta: number;
  z: number;
  zm: number; // posição no meio do último passo (onde −ΔΦ/Δt é medida)
  phi: number;
  emf: number;
}

/** Máximo de |série| com interpolação parabólica (posição e valor). */
function parabolicPeak(hist: Sample[], key: string, xKey: string) {
  let k = -1;
  let best = 0;
  for (let i = 1; i < hist.length - 1; i++) {
    const v = Math.abs(hist[i][key]);
    if (v > best && v >= Math.abs(hist[i - 1][key]) && v >= Math.abs(hist[i + 1][key])) {
      best = v;
      k = i;
    }
  }
  if (k < 0) return null;
  const y0 = Math.abs(hist[k - 1][key]);
  const y1 = Math.abs(hist[k][key]);
  const y2 = Math.abs(hist[k + 1][key]);
  const den = y0 - 2 * y1 + y2;
  const d = den === 0 ? 0 : (0.5 * (y0 - y2)) / den;
  const x = hist[k][xKey] + d * (hist[k + 1][xKey] - hist[k][xKey]);
  return { x, value: y1 - 0.25 * (y0 - y2) * d, k };
}

export default function InducaoModule() {
  const [mode, setMode] = useState<Mode>(() => choice('mode', 'gerador', ['gerador', 'ima']));
  // gerador
  const [N, setN] = useState(() => param('N', 100));
  const [Acm, setAcm] = useState(() => param('Acm', 200)); // cm²
  const [B, setB] = useState(() => param('B', 0.2));
  const [f, setF] = useState(() => param('f', 1));
  const [Rl, setRl] = useState(() => param('Rl', 20));
  // ímã
  const [Nm, setNm] = useState(() => param('Nm', 300));
  const [acm, setAcm2] = useState(() => param('acm', 2)); // cm
  const [mMag, setMMag] = useState(() => param('mMag', 1.2));
  const [vMag, setVMag] = useState(() => param('vMag', 1));
  const [north, setNorth] = useState(true);

  const gp: GenParams = { N, A: Acm / 1e4, B, f, R: Rl };
  const mp: MagnetParams = { N: Nm, a: acm / 100, m: north ? mMag : -mMag, v: vMag };
  const isGen = mode === 'gerador';
  const tPass = (2 * ZMAX) / vMag;
  const omega = 2 * Math.PI * f;

  const sim = useStepper<St>({
    create: () => (isGen ? { theta: 0, z: 0, zm: 0, phi: genFlux(gp, 0), emf: 0 } : { theta: 0, z: -ZMAX, zm: -ZMAX, phi: dipoleFlux(mp, -ZMAX), emf: 0 }),
    step: (s, h) => {
      if (isGen) {
        const theta = s.theta + omega * h;
        const phi = genFlux(gp, theta);
        return { theta, z: 0, zm: 0, phi, emf: fluxRate(s.phi, phi, h) };
      }
      const z = s.z + vMag * h;
      const phi = dipoleFlux(mp, z);
      return { theta: 0, z, zm: s.z + (vMag * h) / 2, phi, emf: fluxRate(s.phi, phi, h) };
    },
    sample: (s): Record<string, number> => (isGen ? { phi: s.phi, emf: s.emf, i: s.emf / Rl, P: (s.emf * s.emf) / Rl } : { z: s.zm, phi: s.phi * 1e3, emf: s.emf * 1e3 }),
    dt: isGen ? 1 / (f * 4000) : tPass / 8000,
    sampleEvery: isGen ? 1 / (f * 200) : tPass / 2000,
    tEnd: isGen ? undefined : tPass,
    timeScale: isGen ? 1 : tPass / 3,
    maxSamples: 40000,
    resetKey: isGen ? [mode, N, Acm, B, f, Rl] : [mode, Nm, acm, mMag, vMag, north],
  });

  const st = sim.state;
  const hist = sim.history;
  const Tm = isGen ? measuredPeriod(hist, 'emf') : null;
  const peakSim = isGen ? (hist.length > 220 ? Math.max(...hist.map((q) => Math.abs(q.emf))) : null) : null;
  const passPeak = !isGen && sim.finished ? parabolicPeak(hist.filter((q) => q.z < 0), 'emf', 'z') : null;
  const emfPeakG = genPeak(gp);
  const emfPeakM = magnetPeak(mp);

  const draw = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    clear(ctx, W, H);
    if (isGen) {
      const v = fitView(W, H, { x0: -3.6, x1: 3.6, y0: -3.5, y1: 2 }, { l: 20, r: 20, t: 112, b: 20 });
      // polos
      const pole = (x0: number, x1: number, color: string, label: string) => {
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(v.X(x0), v.Y(1.6), (x1 - x0) * v.s, 3.2 * v.s);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#0B0F19';
        ctx.font = `700 ${Math.max(14, v.s * 0.45)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, v.X((x0 + x1) / 2), v.Y(0));
      };
      pole(-3.3, -2.4, COLORS.rose, 'N');
      pole(2.4, 3.3, COLORS.cyan, 'S');
      // linhas de campo
      for (const y of [-1.2, -0.6, 0, 0.6, 1.2]) arrow(ctx, v.X(-2.3), v.Y(y), v.X(2.3), v.Y(y), 'rgba(148,163,184,0.35)', 1.2, true);
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = COLORS.label;
      ctx.textAlign = 'left';
      ctx.fillText(`B = ${fmt(B, 2)} T`, v.X(-2.2), v.Y(1.45));

      // espira (vista em perspectiva: largura projetada ∝ cos θ)
      const half = 1.0;
      const hgt = 1.3;
      const c = Math.cos(st.theta);
      const s = Math.sin(st.theta);
      const xL = -half * c;
      const xR = half * c;
      const skew = 0.18 * s;
      ctx.lineWidth = 3;
      ctx.strokeStyle = COLORS.amber;
      ctx.beginPath();
      ctx.moveTo(v.X(xL), v.Y(hgt + skew));
      ctx.lineTo(v.X(xR), v.Y(hgt - skew));
      ctx.lineTo(v.X(xR), v.Y(-hgt - skew));
      ctx.lineTo(v.X(xL), v.Y(-hgt + skew));
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = `rgba(245,158,11,${0.08 + 0.12 * Math.abs(c)})`;
      ctx.fill();
      // eixo e vetor normal
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = 'rgba(148,163,184,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(v.X(0), v.Y(1.75));
      ctx.lineTo(v.X(0), v.Y(-2.1));
      ctx.stroke();
      ctx.setLineDash([]);
      arrow(ctx, v.X(0), v.Y(0), v.X(0) + 0.9 * v.s * c, v.Y(0) + 0.35 * v.s * s, COLORS.green, 2.2);
      ctx.fillStyle = COLORS.green;
      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.fillText('n̂', v.X(0) + 0.95 * v.s * c + 4, v.Y(0) + 0.35 * v.s * s);

      // fios e lâmpada
      const ly = -2.85;
      ctx.strokeStyle = '#64748B';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(v.X(-0.12), v.Y(-2.1));
      ctx.lineTo(v.X(-0.12), v.Y(-2.4));
      ctx.lineTo(v.X(-0.9), v.Y(-2.4));
      ctx.lineTo(v.X(-0.9), v.Y(ly));
      ctx.lineTo(v.X(-0.25), v.Y(ly));
      ctx.moveTo(v.X(0.12), v.Y(-2.1));
      ctx.lineTo(v.X(0.12), v.Y(-2.4));
      ctx.lineTo(v.X(0.9), v.Y(-2.4));
      ctx.lineTo(v.X(0.9), v.Y(ly));
      ctx.lineTo(v.X(0.25), v.Y(ly));
      ctx.stroke();
      const Pmax = (emfPeakG * emfPeakG) / Rl;
      const glow = Pmax > 0 ? (st.emf * st.emf) / Rl / Pmax : 0;
      const gr = ctx.createRadialGradient(v.X(0), v.Y(ly), 0, v.X(0), v.Y(ly), 0.9 * v.s);
      gr.addColorStop(0, `rgba(253,224,71,${0.9 * glow})`);
      gr.addColorStop(1, 'rgba(253,224,71,0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(v.X(0), v.Y(ly), 0.9 * v.s, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(v.X(0), v.Y(ly), 0.25 * v.s, 0, Math.PI * 2);
      ctx.stroke();
      pill(ctx, `ε = ${fmt(st.emf, 2)} V`, v.X(2.6), v.Y(ly), COLORS.amber);
      pill(ctx, `θ = ${fmt(((st.theta * 180) / Math.PI) % 360, 0)}°`, v.X(-2.6), v.Y(ly), COLORS.green);
      return;
    }

    // ---- ímã atravessando a bobina ----
    const v = fitView(W, H, { x0: -0.32, x1: 0.32, y0: -0.12, y1: 0.16 }, { l: 20, r: 20, t: 112, b: 20 });
    const a = mp.a;
    // bobina (espiras vistas de lado)
    const turnsDrawn = 12;
    const coilW = 0.05;
    ctx.lineWidth = 2;
    for (let k = 0; k < turnsDrawn; k++) {
      const x = -coilW / 2 + (k / (turnsDrawn - 1)) * coilW;
      ctx.strokeStyle = 'rgba(245,158,11,0.75)';
      ctx.beginPath();
      ctx.ellipse(v.X(x), v.Y(0), 0.006 * v.s, Math.max(a, 0.012) * v.s * 1.6, 0, Math.PI / 2, (3 * Math.PI) / 2);
      ctx.stroke();
    }
    // ímã
    const L = 0.08;
    const hgt = 0.022;
    const lead = north ? COLORS.rose : COLORS.cyan;
    const tail = north ? COLORS.cyan : COLORS.rose;
    const zx = st.z;
    ctx.fillStyle = tail;
    ctx.fillRect(v.X(zx - L / 2), v.Y(hgt / 2), (L / 2) * v.s, hgt * v.s);
    ctx.fillStyle = lead;
    ctx.fillRect(v.X(zx), v.Y(hgt / 2), (L / 2) * v.s, hgt * v.s);
    ctx.fillStyle = '#0B0F19';
    ctx.font = '700 12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(north ? 'S' : 'N', v.X(zx - L / 4), v.Y(0));
    ctx.fillText(north ? 'N' : 'S', v.X(zx + L / 4), v.Y(0));
    // frente da bobina por cima do ímã
    for (let k = 0; k < turnsDrawn; k++) {
      const x = -coilW / 2 + (k / (turnsDrawn - 1)) * coilW;
      ctx.strokeStyle = COLORS.amber;
      ctx.beginPath();
      ctx.ellipse(v.X(x), v.Y(0), 0.006 * v.s, Math.max(a, 0.012) * v.s * 1.6, 0, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
    }
    arrow(ctx, v.X(zx + L / 2) + 6, v.Y(0), v.X(zx + L / 2) + 6 + 40, v.Y(0), COLORS.green, 2.2);
    // régua
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = COLORS.label;
    ctx.textBaseline = 'top';
    for (let x = -0.3; x <= 0.3001; x += 0.05) {
      ctx.fillRect(v.X(x), v.Y(-0.09), 1, 6);
      ctx.fillText(`${fmt(x * 100, 0)}`, v.X(x), v.Y(-0.09) + 8);
    }
    ctx.textAlign = 'right';
    ctx.fillText('posição do centro do ímã (cm)', W - 20, v.Y(-0.09) + 22);
    // galvanômetro
    const gx = v.X(0);
    const gy = v.Y(0.115);
    const R = 46;
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(gx, gy, R, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.fillStyle = COLORS.label;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('0', gx, gy - R - 8);
    ctx.fillText('−', gx - R * 0.95, gy - R * 0.5);
    ctx.fillText('+', gx + R * 0.95, gy - R * 0.5);
    const ang = -Math.PI / 2 + Math.max(-1, Math.min(1, st.emf / (emfPeakM || 1))) * (Math.PI * 0.32);
    ctx.strokeStyle = COLORS.rose;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx + Math.cos(ang) * (R - 4), gy + Math.sin(ang) * (R - 4));
    ctx.stroke();
    pill(ctx, `ε = ${fmt(st.emf * 1000, 1)} mV`, gx + R + 70, gy - 16, COLORS.amber);
  };

  const exportar = () =>
    downloadJson(
      `inducao_${stamp()}.json`,
      buildModuleExport(
        isGen
          ? {
              modulo: 'inducao',
              titulo: 'Gerador elementar',
              metodo: 'fem medida como −ΔΦ/Δt entre passos (Δt = T/4000), com Φ = N·B·A·cos(ωt)',
              unidades: { t: 's', phi: 'Wb', emf: 'V', i: 'A', P: 'W' },
              parametros: { espiras: N, area_cm2: Acm, B, frequencia: f, cargaOhm: Rl },
              resultados: { femPicoTeorica: emfPeakG, femPicoMedida: peakSim, periodoMedido: Tm, femEficaz: emfPeakG / Math.SQRT2 },
              verificacao: [
                ...(peakSim !== null ? [{ grandeza: 'ε_máx = N·B·A·ω', teorico: emfPeakG, simulado: peakSim }] : []),
                ...(Tm !== null ? [{ grandeza: 'f', teorico: f, simulado: 1 / Tm }] : []),
              ],
              serie: hist,
            }
          : {
              modulo: 'inducao',
              titulo: 'Ímã atravessando a bobina',
              metodo: 'Fluxo de dipolo no eixo da espira; fem medida como −ΔΦ/Δt; pico localizado por interpolação parabólica',
              unidades: { t: 's', z: 'm', phi: 'mWb', emf: 'mV' },
              parametros: { espiras: Nm, raio_cm: acm, momentoMagnetico: mMag, velocidade: vMag, poloNaFrente: north ? 'N' : 'S' },
              resultados: { femPicoTeorica: emfPeakM, posicaoPicoTeorica: -magnetPeakZ(mp), femPicoMedida: passPeak ? passPeak.value / 1000 : null, posicaoPicoMedida: passPeak?.x ?? null },
              verificacao: passPeak ? [{ grandeza: '|ε| máx em z = −a/2', teorico: emfPeakM, simulado: passPeak.value / 1000 }] : [],
              serie: hist,
            },
      ),
    );

  return (
    <ModuleShell
      title="Indução Eletromagnética"
      tema="Lei de Faraday e lei de Lenz"
      status={
        sim.playing
          ? { text: isGen ? 'Gerando' : 'Ímã em movimento', tone: 'run' }
          : sim.finished
            ? { text: 'Passagem completa', tone: 'done' }
            : { text: sim.t > 0 ? 'Pausado' : 'Pronto', tone: sim.t > 0 ? 'pause' : 'idle' }
      }
      keys={{ toggle: sim.toggle, step: sim.stepFrame, reset: sim.reset }}
      stats={
        isGen
          ? [
              { label: 'fem', value: fmt(st.emf, 2), unit: 'V', accent: true },
              { label: 'Fluxo N·Φ', value: fmt(st.phi, 3), unit: 'Wb' },
              { label: 'Corrente', value: fmt(st.emf / Rl, 3), unit: 'A' },
              { label: 'fem eficaz', value: fmt(emfPeakG / Math.SQRT2, 2), unit: 'V' },
            ]
          : [
              { label: 'fem', value: fmt(st.emf * 1000, 1), unit: 'mV', accent: true },
              { label: 'Fluxo N·Φ', value: fmt(st.phi * 1000, 3), unit: 'mWb' },
              { label: 'Posição', value: fmt(st.z * 100, 1), unit: 'cm' },
              { label: 'Câmera lenta', value: fmt(3 / tPass, 1), unit: '×' },
            ]
      }
      scene={<Scene draw={draw} label={isGen ? 'Espira girando entre os polos de um ímã, ligada a uma lâmpada' : 'Ímã atravessando uma bobina ligada a um galvanômetro'} />}
      charts={
        isGen ? (
          <>
            <TimeChart title="Fluxo concatenado" unit="Wb" data={hist} series={[{ key: 'phi', label: 'N·Φ', color: COLORS.green }]} window={Math.max(2, 3 / f)} />
            <TimeChart title="fem induzida" unit="V" data={hist} series={[{ key: 'emf', label: 'ε', color: COLORS.amber }]} window={Math.max(2, 3 / f)} />
            <TimeChart title="Potência na lâmpada" unit="W" data={hist} series={[{ key: 'P', label: 'P', color: COLORS.rose }]} window={Math.max(2, 3 / f)} />
          </>
        ) : (
          <>
            <TimeChart title="Fluxo concatenado" unit="mWb" data={hist} series={[{ key: 'phi', label: 'N·Φ', color: COLORS.green }]} window={null} />
            <TimeChart title="fem induzida" unit="mV" data={hist} series={[{ key: 'emf', label: 'ε', color: COLORS.amber }]} window={null} />
            <TimeChart title="Posição do ímã" unit="m" data={hist} series={[{ key: 'z', label: 'z', color: COLORS.violet }]} window={null} />
          </>
        )
      }
      panel={
        <>
          <Section title="Experimento">
            <div className="flex flex-wrap gap-1.5">
              <Chip active={isGen} onClick={() => setMode('gerador')}>Gerador (espira girando)</Chip>
              <Chip active={!isGen} onClick={() => setMode('ima')}>Ímã e bobina</Chip>
            </div>
          </Section>
          <Playback playing={sim.playing} finished={sim.finished} onToggle={sim.toggle} onStep={sim.stepFrame} onReset={sim.reset} speed={sim.speed} setSpeed={sim.setSpeed} startLabel={isGen ? 'Girar' : 'Soltar o ímã'} />
          {isGen ? (
            <Section title="Gerador">
              <Slider label="Espiras" symbol="N" value={N} min={1} max={500} step={1} unit="" digits={0} onChange={setN} />
              <Slider label="Área da espira" symbol="A" value={Acm} min={10} max={500} step={10} unit="cm²" digits={0} onChange={setAcm} />
              <Slider label="Campo magnético" symbol="B" value={B} min={0.01} max={1} step={0.01} unit="T" digits={2} onChange={setB} />
              <Slider label="Rotação" symbol="f" value={f} min={0.2} max={5} step={0.1} unit="Hz" digits={1} accent="#34D399" onChange={setF} />
              <Slider label="Resistência da lâmpada" symbol="R" value={Rl} min={1} max={200} step={1} unit="Ω" digits={0} accent="#F59E0B" onChange={setRl} />
            </Section>
          ) : (
            <Section title="Ímã e bobina">
              <div className="flex gap-1.5">
                <Chip active={north} onClick={() => setNorth(true)}>Polo N na frente</Chip>
                <Chip active={!north} onClick={() => setNorth(false)}>Polo S na frente</Chip>
              </div>
              <Slider label="Velocidade do ímã" symbol="v" value={vMag} min={0.2} max={5} step={0.1} unit="m/s" digits={1} accent="#34D399" onChange={setVMag} />
              <Slider label="Espiras" symbol="N" value={Nm} min={10} max={1000} step={10} unit="" digits={0} onChange={setNm} />
              <Slider label="Raio da bobina" symbol="a" value={acm} min={1} max={5} step={0.1} unit="cm" digits={1} onChange={setAcm2} />
              <Slider label="Momento do ímã" symbol="m" value={mMag} min={0.1} max={3} step={0.1} unit="A·m²" digits={1} onChange={setMMag} />
            </Section>
          )}
          <VerifyTable
            empty={isGen ? 'Gire por pelo menos um período.' : 'Deixe o ímã atravessar a bobina.'}
            rows={
              isGen
                ? [
                    { formula: 'ε_máx = N·B·A·ω', theory: emfPeakG, sim: peakSim, digits: 4, tol: 1e-3 },
                    { formula: 'f medida pela fem', theory: f, sim: Tm ? 1 / Tm : null, digits: 4, tol: 1e-3 },
                  ]
                : [
                    { formula: '|ε|máx = (3/2)·N·μ0·m·a²·(a/2)·v/(5a²/4)^{5/2}', theory: emfPeakM * 1000, sim: passPeak ? passPeak.value : null, digits: 3, tol: 1e-3 },
                    { formula: 'Pico em z = −a/2 (cm)', theory: -magnetPeakZ(mp) * 100, sim: passPeak ? passPeak.x * 100 : null, digits: 3, tol: 2e-3 },
                  ]
            }
          />
          <Section title="Dados" right={<ExportButton onClick={exportar} />}>
            <Note>
              {isGen
                ? 'A fem é máxima quando o plano da espira fica paralelo ao campo (fluxo nulo, mas variando mais depressa) e nula quando o fluxo é máximo.'
                : 'Lei de Lenz: ao se aproximar, a corrente induzida cria um polo que repele o ímã; ao se afastar, um polo que o atrai. Por isso a fem troca de sinal no centro da bobina. Dobrar a velocidade dobra o pico.'}
            </Note>
          </Section>
        </>
      }
    />
  );
}
