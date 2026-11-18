export type Element = 'convergente' | 'divergente' | 'concavo' | 'convexo';

export const isMirror = (e: Element) => e === 'concavo' || e === 'convexo';
/** Distância focal com sinal: + para lente convergente e espelho côncavo. */
export const signedFocal = (e: Element, fAbs: number) => (e === 'convergente' || e === 'concavo' ? fAbs : -fAbs);

/** Equação de Gauss: 1/f = 1/p + 1/p'. p' > 0 indica imagem real. Infinito quando p = f. */
export function gauss(f: number, p: number) {
  if (Math.abs(p - f) < 1e-12) return Infinity;
  return (f * p) / (p - f);
}

export const magnification = (p: number, pi: number) => -pi / p;

type Pt = [number, number];

/** Interseção de duas retas (ponto + direção). null se paralelas. */
export function intersect(p1: Pt, d1: Pt, p2: Pt, d2: Pt): Pt | null {
  const den = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(den) < 1e-14) return null;
  const t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den;
  return [p1[0] + d1[0] * t, p1[1] + d1[1] * t];
}

/**
 * Traçado de raios notáveis (elemento em x = 0, objeto em x = −p com altura h).
 * Raio 1: paralelo ao eixo, depois passa (ou parece passar) pelo foco.
 * Raio 2: pelo centro óptico (lente) ou pelo vértice (espelho, reflexão simétrica).
 * Devolve a posição da imagem pela interseção dos raios emergentes (ou dos prolongamentos).
 */
export function traceImage(e: Element, fAbs: number, p: number, h: number) {
  const f = signedFocal(e, fAbs);
  const O: Pt = [-p, h];
  const hit1: Pt = [0, h];
  let d1: Pt;
  let d2: Pt;
  if (!isMirror(e)) {
    // lente: sai em direção a F' = (f, 0) (convergente) ou se afasta de F = (f, 0) com f < 0 (divergente)
    d1 = [f, -h];
    d2 = [p, -h];
  } else {
    // espelho: foco à esquerda em (−f, 0) para côncavo; prolongamento de (−f,0) para convexo (f < 0)
    d1 = [-f, -h];
    d2 = [-p, -h];
  }
  const img = intersect(hit1, d1, [0, 0], d2);
  if (!img) return { x: Infinity, y: 0, pi: Infinity, rays: { O, hit1, d1, d2 } };
  const pi = isMirror(e) ? -img[0] : img[0];
  return { x: img[0], y: img[1], pi, rays: { O, hit1, d1, d2 } };
}

/** Vergência em dioptrias ("graus"), com f em cm. */
export const vergence = (fCm: number) => 100 / fCm;
