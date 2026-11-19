// Parâmetros na rota: #projetil?v0=20&angleDeg=30 abre o experimento já montado.
// O nome de cada parâmetro é o da variável de estado do módulo (o mesmo símbolo dos controles).

/** Id da rota, sem os parâmetros: "projetil?v0=20" → "projetil". */
export const routeId = (hash: string) => hash.split('?')[0]!;

export function hashParams(hash = window.location.hash.slice(1)): URLSearchParams {
  const i = hash.indexOf('?');
  return new URLSearchParams(i < 0 ? '' : hash.slice(i + 1));
}

/** Valor numérico da rota, ou o padrão. Aceita vírgula decimal. */
export function param(name: string, fallback: number, hash?: string): number {
  const raw = hashParams(hash).get(name);
  if (raw === null || raw.trim() === '') return fallback;
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

/** Aplica os parâmetros numéricos da rota sobre um objeto de padrões. */
export function params<T extends object>(defaults: T, hash?: string): T {
  const out = { ...defaults };
  for (const [k, v] of Object.entries(defaults)) if (typeof v === 'number') (out as Record<string, unknown>)[k] = param(k, v, hash);
  return out;
}

/** Escolha da rota (material, modo, gás…), só se for uma das opções válidas; senão, o padrão. */
export function choice<T extends string>(name: string, fallback: T, allowed: readonly string[], hash?: string): T {
  const raw = hashParams(hash).get(name);
  return raw !== null && allowed.includes(raw) ? (raw as T) : fallback;
}
