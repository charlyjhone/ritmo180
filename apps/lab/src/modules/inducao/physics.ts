export const MU0 = 4 * Math.PI * 1e-7; // T·m/A

// ---------- Gerador (espira girando em campo uniforme) ----------

export interface GenParams {
  N: number; // espiras
  A: number; // área (m²)
  B: number; // campo (T)
  f: number; // rotações por segundo (Hz)
  R: number; // resistência da carga (Ω)
}

/** Fluxo concatenado N·B·A·cos(θ). */
export const genFlux = (p: GenParams, theta: number) => p.N * p.B * p.A * Math.cos(theta);
/** fem analítica ε = N·B·A·ω·sen(ωt). */
export const genEmf = (p: GenParams, theta: number) => p.N * p.B * p.A * 2 * Math.PI * p.f * Math.sin(theta);
export const genPeak = (p: GenParams) => p.N * p.B * p.A * 2 * Math.PI * p.f;

// ---------- Ímã atravessando uma bobina ----------

export interface MagnetParams {
  N: number; // espiras
  a: number; // raio da bobina (m)
  m: number; // momento magnético do ímã (A·m²), sinal = polo que vem na frente
  v: number; // velocidade do ímã (m/s)
}

/** Fluxo de um dipolo no eixo de uma espira de raio a, à distância z: Φ = μ0·m·a² / (2(a² + z²)^{3/2}). */
export const dipoleFlux = (p: MagnetParams, z: number) => (p.N * MU0 * p.m * p.a * p.a) / (2 * (p.a * p.a + z * z) ** 1.5);

/** ε = −dΦ/dt = −(dΦ/dz)·v. */
export const magnetEmf = (p: MagnetParams, z: number) => p.v * ((p.N * 1.5 * MU0 * p.m * p.a * p.a * z) / (p.a * p.a + z * z) ** 2.5);

/** Pico de fem: ocorre em z = ±a/2. */
export const magnetPeakZ = (p: MagnetParams) => p.a / 2;
export const magnetPeak = (p: MagnetParams) => Math.abs(magnetEmf(p, p.a / 2));

/**
 * Fem "medida" pelo voltímetro: −ΔΦ/Δt entre dois instantes, como faria um instrumento digital.
 * Integrada no tempo, deve reproduzir −N·ΔΦ (lei de Faraday na forma integral).
 */
export const fluxRate = (phi0: number, phi1: number, h: number) => -(phi1 - phi0) / h;
