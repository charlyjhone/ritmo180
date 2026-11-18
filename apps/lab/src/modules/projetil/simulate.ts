/**
 * Núcleo físico do simulador — funções puras, sem dependência de UI.
 *
 * Modelo: partícula pontual sob gravidade uniforme e arrasto quadrático
 *   F_arrasto = -½ · ρ · Cd · A · |v| · v,   A = π d² / 4
 *   a = (-k|v|vx, -g - k|v|vy),   k = ρ Cd A / (2m)
 *
 * Integração: Runge–Kutta de 4ª ordem com passo fixo. Os eventos (ápice e
 * impacto no solo) são localizados por bisseção sobre o próprio passo RK4.
 * No vácuo a trajetória é um polinômio de grau 2 no tempo, que o RK4 integra
 * sem erro de truncamento, então R, H e T coincidem com as fórmulas fechadas
 * até a precisão de ponto flutuante.
 */

export const DEG = Math.PI / 180;
export const AIR_DENSITY_SEA_LEVEL = 1.225; // kg/m³ (atmosfera padrão, nível do mar)

export interface LaunchParams {
  /** Velocidade inicial (m/s) */
  v0: number;
  /** Ângulo de lançamento (°) */
  angleDeg: number;
  /** Aceleração da gravidade (m/s²) */
  g: number;
  /** Coeficiente de arrasto (adimensional) */
  cd: number;
  /** Massa do projétil (kg) */
  mass: number;
  /** Diâmetro do projétil (m) */
  diameter: number;
  /** Densidade do ar (kg/m³) */
  airDensity: number;
}

export interface TrajectoryPoint {
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface TrajectorySummary {
  /** Alcance horizontal (m) */
  range: number;
  /** Altura máxima (m) */
  maxHeight: number;
  /** Tempo total de voo (s) */
  flightTime: number;
  /** Instante do ápice (s) */
  apexTime: number;
  /** Posição horizontal do ápice (m) */
  apexX: number;
  /** Módulo da velocidade no impacto (m/s) */
  impactSpeed: number;
  /** Ângulo de impacto abaixo da horizontal (°) */
  impactAngleDeg: number;
}

export interface AnalyticSummary {
  range: number;
  maxHeight: number;
  flightTime: number;
}

export interface TrajectoryResult {
  params: LaunchParams;
  points: TrajectoryPoint[];
  summary: TrajectorySummary;
  /** Passo de integração usado (s) */
  dt: number;
}

interface State {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Constante de arrasto por unidade de massa, k = ρ Cd A / (2m)  [1/m] */
export function dragFactor(p: LaunchParams): number {
  if (p.cd <= 0 || p.airDensity <= 0 || p.diameter <= 0) return 0;
  const area = (Math.PI * p.diameter * p.diameter) / 4;
  return (p.airDensity * p.cd * area) / (2 * p.mass);
}

/** Fórmulas fechadas do lançamento oblíquo no vácuo, com lançamento e pouso no mesmo nível. */
export function analyticVacuum(p: Pick<LaunchParams, 'v0' | 'angleDeg' | 'g'>): AnalyticSummary {
  const th = p.angleDeg * DEG;
  const s = Math.sin(th);
  return {
    range: (p.v0 * p.v0 * Math.sin(2 * th)) / p.g,
    maxHeight: (p.v0 * p.v0 * s * s) / (2 * p.g),
    flightTime: (2 * p.v0 * s) / p.g,
  };
}

function rk4(s: State, h: number, g: number, k: number): State {
  const f = (st: State): State => {
    const sp = Math.hypot(st.vx, st.vy);
    return { x: st.vx, y: st.vy, vx: -k * sp * st.vx, vy: -g - k * sp * st.vy };
  };
  const add = (a: State, b: State, m: number): State => ({
    x: a.x + b.x * m,
    y: a.y + b.y * m,
    vx: a.vx + b.vx * m,
    vy: a.vy + b.vy * m,
  });
  const k1 = f(s);
  const k2 = f(add(s, k1, h / 2));
  const k3 = f(add(s, k2, h / 2));
  const k4 = f(add(s, k3, h));
  return {
    x: s.x + (h / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x),
    y: s.y + (h / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y),
    vx: s.vx + (h / 6) * (k1.vx + 2 * k2.vx + 2 * k3.vx + k4.vx),
    vy: s.vy + (h / 6) * (k1.vy + 2 * k2.vy + 2 * k3.vy + k4.vy),
  };
}

/** Encontra h* ∈ [0, h] tal que sel(rk4(s, h*)) = 0, supondo troca de sinal no intervalo. */
function bisect(s: State, h: number, g: number, k: number, sel: (st: State) => number): number {
  let lo = 0;
  let hi = h;
  const sLo = sel(s);
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const v = sel(rk4(s, mid, g, k));
    if (v === 0) return mid;
    if (Math.sign(v) === Math.sign(sLo)) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Escolhe um passo que mantém ~1500–3000 pontos por trajetória. */
function chooseStep(p: LaunchParams): number {
  const tEst = Math.max(analyticVacuum(p).flightTime, 0.05);
  return Math.min(1 / 240, Math.max(tEst / 2000, 1 / 4000));
}

const MAX_TIME = 3600; // s — trava de segurança

export function simulate(p: LaunchParams): TrajectoryResult {
  const th = p.angleDeg * DEG;
  const k = dragFactor(p);
  const g = p.g;
  const h = chooseStep(p);

  let s: State = { x: 0, y: 0, vx: p.v0 * Math.cos(th), vy: p.v0 * Math.sin(th) };
  // Zera ruído numérico de cos(90°) ≈ 6e-17
  if (Math.abs(s.vx) < 1e-12) s.vx = 0;

  let t = 0;
  const points: TrajectoryPoint[] = [{ t, ...s }];
  let apex: TrajectoryPoint = points[0];
  let apexFound = s.vy <= 0;

  while (t < MAX_TIME) {
    const next = rk4(s, h, g, k);

    // Ápice: vy troca de sinal (+ → −)
    if (!apexFound && s.vy > 0 && next.vy <= 0) {
      const ha = bisect(s, h, g, k, (st) => st.vy);
      const a = rk4(s, ha, g, k);
      apex = { t: t + ha, x: a.x, y: a.y, vx: a.vx, vy: 0 };
      apexFound = true;
      if (ha > 1e-12 && h - ha > 1e-12) points.push(apex);
    }

    // Impacto: y cruza o solo
    if (next.y <= 0) {
      const hg = bisect(s, h, g, k, (st) => st.y);
      const land = rk4(s, hg, g, k);
      points.push({ t: t + hg, x: land.x, y: 0, vx: land.vx, vy: land.vy });
      break;
    }

    t += h;
    s = next;
    points.push({ t, ...s });
  }

  const last = points[points.length - 1];
  if (!apexFound) apex = points.reduce((m, q) => (q.y > m.y ? q : m), points[0]);

  return {
    params: { ...p },
    points,
    dt: h,
    summary: {
      range: last.x,
      maxHeight: apex.y,
      flightTime: last.t,
      apexTime: apex.t,
      apexX: apex.x,
      impactSpeed: Math.hypot(last.vx, last.vy),
      impactAngleDeg: Math.atan2(-last.vy, last.vx) / DEG,
    },
  };
}

/** Estado interpolado (Hermite cúbico na posição, linear na velocidade) no instante t. */
export function sampleAt(points: TrajectoryPoint[], t: number): TrajectoryPoint {
  const n = points.length;
  if (t <= points[0].t) return points[0];
  if (t >= points[n - 1].t) return points[n - 1];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  const dt = b.t - a.t;
  if (dt <= 0) return a;
  const u = (t - a.t) / dt;
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  return {
    t,
    x: h00 * a.x + h10 * dt * a.vx + h01 * b.x + h11 * dt * b.vx,
    y: h00 * a.y + h10 * dt * a.vy + h01 * b.y + h11 * dt * b.vy,
    vx: a.vx + (b.vx - a.vx) * u,
    vy: a.vy + (b.vy - a.vy) * u,
  };
}

/** Maior altura atingida até o instante t. */
export function maxHeightUntil(res: TrajectoryResult, t: number): number {
  if (t >= res.summary.apexTime) return res.summary.maxHeight;
  return sampleAt(res.points, t).y;
}
