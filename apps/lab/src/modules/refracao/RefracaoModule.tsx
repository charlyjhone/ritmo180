import { useState } from 'react';
import ModuleShell from '../../shell/ModuleShell';
import Scene from '../../core/Scene';
import { useStepper } from '../../core/stepper';
import { COLORS, clear, fitView, pill } from '../../core/canvas';
import { fmt } from '../../core/format';
import { buildModuleExport, downloadJson, stamp } from '../../core/export';
import { Chip, ExportButton, Note, Section, Slider, Toggle, VerifyTable } from '../../ui/controls';
import { C_LIGHT, brewster, criticalAngle, fermatCrossing, fresnel, snell, wavelengthColor } from './physics';
import { param } from '../../core/params';

const DEG = Math.PI / 180;
const MEDIA = [
  { name: 'Ar', n: 1.0 },
  { name: 'Água', n: 1.333 },
  { name: 'Óleo', n: 1.47 },
  { name: 'Vidro', n: 1.52 },
  { name: 'Diamante', n: 2.42 },
];

type V2 = [number, number];

export default function RefracaoModule() {
  const [th1d, setTh1] = useState(() => param('th1d', 40));
  const [n1, setN1] = useState(() => param('n1', 1.0));
  const [n2, setN2] = useState(() => param('n2', 1.333));
  const [nm, setNm] = useState(() => param('nm', 532));
  const [wave, setWave] = useState(false);
  const [showRefl, setShowRefl] = useState(true);

  const th1 = th1d * DEG;
  const th2 = snell(n1, n2, th1);
  const tir = th2 === null;
  const fr = fresnel(n1, n2, th1);
  const thc = criticalAngle(n1, n2);
  const thB = brewster(n1, n2);
  const color = wavelengthColor(nm);

  const fermat = th2 !== null ? fermatCrossing(n1, n2, [-Math.sin(th1), Math.cos(th1)], [Math.sin(th2), -Math.cos(th2)]) : null;

  const sim = useStepper<{ ph: number }>({
    create: () => ({ ph: 0 }),
    step: (s, h) => ({ ph: s.ph + h }),
    sample: () => ({}),
    sampleEvery: 1,
    maxSamples: 2,
    resetKey: [],
    autoplay: true,
  });

  const draw = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    clear(ctx, W, H);
    const v = fitView(W, H, { x0: -1.25, x1: 1.25, y0: -1.05, y1: 1.05 }, { l: 20, r: 20, t: 110, b: 20 });
    const P = (p: V2) => [v.X(p[0]), v.Y(p[1])] as const;
    // meios (mais denso → mais escuro/azulado)
    const tint = (n: number) => `rgba(56,189,248,${Math.min(0.28, (n - 1) * 0.16)})`;
    ctx.fillStyle = tint(n1);
    ctx.fillRect(0, 0, W, v.Y(0));
    ctx.fillStyle = tint(n2);
    ctx.fillRect(0, v.Y(0), W, H - v.Y(0));
    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, v.Y(0));
    ctx.lineTo(W, v.Y(0));
    ctx.stroke();
    ctx.font = '600 12px Inter, sans-serif';
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const name = (n: number) => MEDIA.find((m) => Math.abs(m.n - n) < 1e-9)?.name ?? 'meio';
    ctx.fillText(`${name(n1)} · n₁ = ${fmt(n1, 3)}`, 16, v.Y(0) - 26);
    ctx.fillText(`${name(n2)} · n₂ = ${fmt(n2, 3)}`, 16, v.Y(0) + 10);

    // transferidor e normal
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = 'rgba(148,163,184,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(v.X(0), v.Y(0), 0.92 * v.s, 0, Math.PI * 2);
    ctx.moveTo(v.X(0), v.Y(1));
    ctx.lineTo(v.X(0), v.Y(-1));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillStyle = COLORS.label;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let a = 0; a < 360; a += 10) {
      const r0 = 0.92 * v.s;
      const r1 = r0 + (a % 30 === 0 ? 8 : 4);
      const ang = (a - 90) * DEG;
      ctx.strokeStyle = 'rgba(148,163,184,0.45)';
      ctx.beginPath();
      ctx.moveTo(v.X(0) + Math.cos(ang) * r0, v.Y(0) + Math.sin(ang) * r0);
      ctx.lineTo(v.X(0) + Math.cos(ang) * r1, v.Y(0) + Math.sin(ang) * r1);
      ctx.stroke();
    }

    const d1: V2 = [Math.sin(th1), -Math.cos(th1)];
    const dr: V2 = [Math.sin(th1), Math.cos(th1)];
    const d2: V2 | null = th2 !== null ? [Math.sin(th2), -Math.cos(th2)] : null;
    const A: V2 = [-d1[0] * 1.15, -d1[1] * 1.15];
    const Rint = fr.R;
    const Tint = fr.T;

    if (wave) {
      const lam0 = 0.16 * (nm / 550); // escala visual do comprimento de onda no vácuo
      const fvis = 0.6; // frentes por segundo (câmera lenta)
      const w = 0.32;
      const beam = (dir: V2, lam: number, width: number, alpha: number, side: 1 | -1, s0: number, s1: number) => {
        const perp: V2 = [-dir[1], dir[0]];
        ctx.save();
        ctx.beginPath();
        if (side > 0) ctx.rect(0, 0, W, v.Y(0));
        else ctx.rect(0, v.Y(0), W, H - v.Y(0));
        ctx.clip();
        // faixa do feixe
        ctx.fillStyle = wavelengthColor(nm, 0.08 * alpha);
        ctx.beginPath();
        ctx.moveTo(...P([dir[0] * s0 + perp[0] * width / 2, dir[1] * s0 + perp[1] * width / 2]));
        ctx.lineTo(...P([dir[0] * s1 + perp[0] * width / 2, dir[1] * s1 + perp[1] * width / 2]));
        ctx.lineTo(...P([dir[0] * s1 - perp[0] * width / 2, dir[1] * s1 - perp[1] * width / 2]));
        ctx.lineTo(...P([dir[0] * s0 - perp[0] * width / 2, dir[1] * s0 - perp[1] * width / 2]));
        ctx.fill();
        ctx.strokeStyle = wavelengthColor(nm, 0.85 * alpha);
        ctx.lineWidth = 2;
        const shift = ((sim.state.ph * fvis) % 1) * lam;
        for (let s = Math.floor(s0 / lam) * lam + shift - lam; s <= s1; s += lam) {
          if (s < s0) continue;
          const c: V2 = [dir[0] * s, dir[1] * s];
          ctx.beginPath();
          ctx.moveTo(...P([c[0] + perp[0] * width / 2, c[1] + perp[1] * width / 2]));
          ctx.lineTo(...P([c[0] - perp[0] * width / 2, c[1] - perp[1] * width / 2]));
          ctx.stroke();
        }
        ctx.restore();
      };
      const wf = w / Math.cos(th1); // pegada do feixe na interface
      beam(d1, lam0 / n1, w, 1, 1, -1.12, 0.3);
      if (showRefl) beam(dr, lam0 / n1, w, Math.max(Rint, 0.15), 1, -0.3, 1.6);
      if (d2 && th2 !== null) beam(d2, lam0 / n2, wf * Math.cos(th2), Math.max(Tint, 0.15), -1, -0.3, 1.6);
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = COLORS.label;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`λ₁ = ${fmt(nm / n1, 0)} nm   λ₂ = ${fmt(nm / n2, 0)} nm (frentes em câmera lenta, fora de escala)`, W - 16, H - 8);
    } else {
      const ray = (from: V2, to: V2, alpha: number, wdt: number) => {
        ctx.strokeStyle = wavelengthColor(nm, alpha);
        ctx.lineWidth = wdt;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10 * alpha;
        ctx.beginPath();
        ctx.moveTo(...P(from));
        ctx.lineTo(...P(to));
        ctx.stroke();
        ctx.shadowBlur = 0;
      };
      ray(A, [0, 0], 1, 3);
      if (showRefl || tir) ray([0, 0], [dr[0] * 1.3, dr[1] * 1.3], Math.max(Rint, 0.08), 3);
      if (d2) ray([0, 0], [d2[0] * 1.3, d2[1] * 1.3], Math.max(Tint, 0.08), 3);
    }

    // laser
    const [lx, ly] = P(A);
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(Math.atan2(-d1[1], d1[0]));
    ctx.fillStyle = '#334155';
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 1.5;
    ctx.fillRect(-46, -9, 46, 18);
    ctx.strokeRect(-46, -9, 46, 18);
    ctx.fillStyle = color;
    ctx.fillRect(-4, -4, 4, 8);
    ctx.restore();

    // ângulos
    const arcAt = (from: number, to: number, r: number, col: string, label: string) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(v.X(0), v.Y(0), r, Math.min(from, to), Math.max(from, to));
      ctx.stroke();
      const mid = (from + to) / 2;
      ctx.fillStyle = col;
      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, v.X(0) + Math.cos(mid) * (r + 22), v.Y(0) + Math.sin(mid) * (r + 22));
    };
    arcAt(-Math.PI / 2, -Math.PI / 2 - th1, 52, COLORS.amber, `θ₁ ${fmt(th1d, 1)}°`);
    if (th2 !== null) arcAt(Math.PI / 2, Math.PI / 2 - th2, 52, COLORS.cyan, `θ₂ ${fmt(th2 / DEG, 1)}°`);
    if (tir) pill(ctx, 'reflexão total', v.X(0.55), v.Y(-0.35), COLORS.rose);
    if (!wave && showRefl && !tir) pill(ctx, `R = ${fmt(Rint * 100, 1)}%`, v.X(dr[0] * 0.95), v.Y(dr[1] * 0.95) - 18, COLORS.muted);
    if (!wave && d2) pill(ctx, `T = ${fmt(Tint * 100, 1)}%`, v.X(d2[0] * 0.95) + 34, v.Y(d2[1] * 0.95), COLORS.muted);
  };

  const exportar = () =>
    downloadJson(
      `refracao_${stamp()}.json`,
      buildModuleExport({
        modulo: 'refracao',
        titulo: 'Refração e Reflexão',
        metodo: 'Snell e Fresnel; refração conferida pelo princípio de Fermat (mínimo do caminho óptico por busca da razão áurea)',
        unidades: { angulos: '°', comprimentoDeOnda: 'nm', velocidade: 'm/s' },
        parametros: { theta1: th1d, n1, n2, lambda_nm: nm },
        resultados: {
          theta2: th2 !== null ? th2 / DEG : null,
          theta2Fermat: fermat ? fermat.theta2 / DEG : null,
          reflexaoTotal: tir ? 'sim' : 'não',
          anguloCritico: thc !== null ? thc / DEG : null,
          anguloBrewster: thB / DEG,
          refletancia: fr.R,
          transmitancia: fr.T,
          v2: C_LIGHT / n2,
          lambda2_nm: nm / n2,
        },
        verificacao: fermat && th2 !== null ? [{ grandeza: 'θ2 Snell = θ2 Fermat (°)', teorico: th2 / DEG, simulado: fermat.theta2 / DEG }] : [],
        serie: [],
      }),
    );

  const pick = (set: (n: number) => void, cur: number) => (
    <div className="flex flex-wrap gap-1.5">
      {MEDIA.map((m) => (
        <Chip key={m.name} active={Math.abs(cur - m.n) < 1e-9} onClick={() => set(m.n)}>
          {m.name}
        </Chip>
      ))}
    </div>
  );

  return (
    <ModuleShell
      title="Refração e Reflexão"
      tema="Lei de Snell, reflexão total, princípio de Fermat"
      status={tir ? { text: 'Reflexão total', tone: 'pause' } : { text: 'Refração', tone: 'run' }}
      keys={{ toggle: sim.toggle }}
      stats={[
        { label: 'Ângulo de refração', value: th2 !== null ? fmt(th2 / DEG, 2) : '—', unit: '°', accent: true },
        { label: 'Ângulo crítico', value: thc !== null ? fmt(thc / DEG, 2) : '—', unit: '°' },
        { label: 'Velocidade no meio 2', value: fmt(C_LIGHT / n2 / 1e8, 3), unit: '×10⁸ m/s' },
        { label: 'Refletido', value: fmt(fr.R * 100, 1), unit: '%' },
      ]}
      scene={<Scene draw={draw} label="Raio laser atravessando a interface entre dois meios, com ângulos de incidência e refração" />}
      panel={
        <>
          <Section title="Laser">
            <Slider label="Ângulo de incidência" symbol="θ₁" value={th1d} min={0} max={89} step={0.5} unit="°" digits={1} accent="#F59E0B" onChange={setTh1} />
            <Slider label="Comprimento de onda" symbol="λ" value={nm} min={400} max={700} step={1} unit="nm" digits={0} accent={color} onChange={setNm} />
            <Toggle label="Ver como onda (frentes de onda)" checked={wave} onChange={setWave} />
            <Toggle label="Mostrar reflexão parcial" checked={showRefl} onChange={setShowRefl} color="#94A3B8" />
          </Section>
          <Section title="Meio 1 (de onde a luz vem)">
            {pick(setN1, n1)}
            <Slider label="Índice de refração" symbol="n₁" value={n1} min={1} max={2.5} step={0.001} unit="" digits={3} onChange={setN1} />
          </Section>
          <Section title="Meio 2">
            {pick(setN2, n2)}
            <Slider label="Índice de refração" symbol="n₂" value={n2} min={1} max={2.5} step={0.001} unit="" digits={3} onChange={setN2} />
          </Section>
          <VerifyTable
            rows={[
              {
                formula: 'n₁·sen θ₁ = n₂·sen θ₂ vs. Fermat (θ₂ em °)',
                theory: th2 !== null ? th2 / DEG : null,
                sim: fermat ? fermat.theta2 / DEG : null,
                digits: 4,
                tol: 1e-5,
                note: 'Reflexão total: não existe raio refratado.',
              },
              { formula: 'Energia: R + T = 1', theory: 1, sim: fr.R + fr.T, digits: 6, tol: 1e-12 },
            ]}
          />
          <Section title="Dados" right={<ExportButton onClick={exportar} />}>
            <Note>
              {thc !== null
                ? `Indo do meio mais refringente para o menos, acima de θc = ${fmt(thc / DEG, 1)}° a luz não sai: é o princípio da fibra óptica. `
                : 'Indo para um meio mais refringente, o raio se aproxima da normal e nunca há reflexão total. '}
              A frequência não muda na interface; a velocidade e o comprimento de onda caem por n. No ângulo de Brewster ({fmt(thB / DEG, 1)}°) a luz refletida sai polarizada.
            </Note>
          </Section>
        </>
      }
    />
  );
}
