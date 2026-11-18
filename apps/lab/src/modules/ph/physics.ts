export const KW = 1e-14; // 25 °C

export interface Analyte {
  id: string;
  name: string;
  kind: 'acido' | 'base';
  K: number; // Ka (ácido) ou Kb (base); Infinity = forte
  titrant: string;
}

export const ANALYTES: Analyte[] = [
  { id: 'HCl', name: 'HCl (ácido forte)', kind: 'acido', K: Infinity, titrant: 'NaOH' },
  { id: 'CH3COOH', name: 'Ácido acético', kind: 'acido', K: 1.8e-5, titrant: 'NaOH' },
  { id: 'NaOH', name: 'NaOH (base forte)', kind: 'base', K: Infinity, titrant: 'HCl' },
  { id: 'NH3', name: 'Amônia', kind: 'base', K: 1.8e-5, titrant: 'HCl' },
];

/**
 * pH exato pelo balanço de cargas (sem aproximações), por bissecção em log[H⁺].
 * Ca, Va: concentração (mol/L) e volume (mL) do analito; Ct, Vt: do titulante forte.
 */
export function exactPH(an: Analyte, Ca: number, Va: number, Ct: number, Vt: number) {
  const V = Va + Vt;
  const cA = (Ca * Va) / V; // analito total
  const cT = (Ct * Vt) / V; // íon do titulante (Na⁺ ou Cl⁻)
  const g = (h: number) => {
    const oh = KW / h;
    if (an.kind === 'acido') {
      const aMinus = an.K === Infinity ? cA : (cA * an.K) / (an.K + h);
      return h + cT - oh - aMinus; // [H⁺] + [Na⁺] = [OH⁻] + [A⁻]
    }
    const Ka = an.K === Infinity ? 0 : KW / an.K; // Ka do ácido conjugado BH⁺
    const bh = an.K === Infinity ? cA : (cA * h) / (h + Ka);
    return h + bh - oh - cT; // [H⁺] + [BH⁺ ou Na⁺] = [OH⁻] + [Cl⁻]
  };
  let lo = -16;
  let hi = 2;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (g(10 ** mid) > 0) hi = mid;
    else lo = mid;
  }
  return -(lo + hi) / 2;
}

export const equivalenceVolume = (Ca: number, Va: number, Ct: number) => (Ca * Va) / Ct;

/** Fórmulas aproximadas do ensino médio para o pH inicial. */
export function textbookInitialPH(an: Analyte, Ca: number) {
  if (an.kind === 'acido') return an.K === Infinity ? -Math.log10(Ca) : 0.5 * (-Math.log10(an.K) - Math.log10(Ca));
  const pOH = an.K === Infinity ? -Math.log10(Ca) : 0.5 * (-Math.log10(an.K) - Math.log10(Ca));
  return 14 - pOH;
}

/** pKa do par ácido/base que tampona na meia-equivalência (Henderson–Hasselbalch: pH = pKa). */
export function halfEquivalencePH(an: Analyte) {
  if (an.K === Infinity) return null;
  return an.kind === 'acido' ? -Math.log10(an.K) : 14 + Math.log10(an.K);
}

/** Volume de máxima inclinação dpH/dV em uma série (V, pH), com interpolação parabólica. */
export function steepestPoint(V: number[], pH: number[]) {
  let k = -1;
  let best = 0;
  const slope: number[] = [];
  for (let i = 1; i < V.length; i++) slope.push((pH[i] - pH[i - 1]) / (V[i] - V[i - 1]));
  for (let i = 1; i < slope.length - 1; i++) {
    const s = Math.abs(slope[i]);
    if (s > best && s >= Math.abs(slope[i - 1]) && s >= Math.abs(slope[i + 1])) {
      best = s;
      k = i;
    }
  }
  if (k < 0) return null;
  const y0 = Math.abs(slope[k - 1]);
  const y1 = Math.abs(slope[k]);
  const y2 = Math.abs(slope[k + 1]);
  const den = y0 - 2 * y1 + y2;
  const d = den === 0 ? 0 : (0.5 * (y0 - y2)) / den;
  const mid = (i: number) => (V[i] + V[i + 1]) / 2;
  return mid(k) + d * (mid(k + 1) - mid(k));
}

export interface Indicator {
  id: string;
  name: string;
  low: number;
  high: number;
  cLow: [number, number, number, number];
  cHigh: [number, number, number, number];
}

export const INDICATORS: Indicator[] = [
  { id: 'fenol', name: 'Fenolftaleína', low: 8.2, high: 10, cLow: [235, 240, 255, 0.12], cHigh: [236, 72, 153, 0.75] },
  { id: 'bromo', name: 'Azul de bromotimol', low: 6, high: 7.6, cLow: [234, 179, 8, 0.65], cHigh: [37, 99, 235, 0.7] },
  { id: 'metila', name: 'Alaranjado de metila', low: 3.1, high: 4.4, cLow: [220, 38, 38, 0.7], cHigh: [250, 204, 21, 0.65] },
];

export function indicatorColor(ind: Indicator, pH: number) {
  const u = Math.max(0, Math.min(1, (pH - ind.low) / (ind.high - ind.low)));
  const c = ind.cLow.map((a, i) => a + (ind.cHigh[i] - a) * u);
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${c[3].toFixed(3)})`;
}

export const EVERYDAY = [
  { name: 'suco gástrico', pH: 1.5 },
  { name: 'limão', pH: 2.3 },
  { name: 'vinagre', pH: 2.9 },
  { name: 'refrigerante', pH: 3.2 },
  { name: 'café', pH: 5 },
  { name: 'chuva ácida', pH: 4.3 },
  { name: 'leite', pH: 6.6 },
  { name: 'água pura', pH: 7 },
  { name: 'sangue', pH: 7.4 },
  { name: 'água do mar', pH: 8.1 },
  { name: 'bicarbonato', pH: 8.3 },
  { name: 'sabão', pH: 10 },
  { name: 'amônia doméstica', pH: 11.6 },
  { name: 'alvejante', pH: 12.5 },
];
