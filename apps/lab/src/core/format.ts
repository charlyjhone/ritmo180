const nf = (d: number) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

const cache = new Map<number, Intl.NumberFormat>();

/** Formata número em pt-BR (vírgula decimal). */
export function fmt(v: number, digits = 2): string {
  let f = cache.get(digits);
  if (!f) {
    f = nf(digits);
    cache.set(digits, f);
  }
  const n = Math.abs(v) < 0.5 * 10 ** -digits ? 0 : v; // evita "-0,00"
  return f.format(n);
}

export const SHOT_COLORS = ['#38BDF8', '#F59E0B', '#A78BFA', '#34D399', '#F472B6', '#FB7185', '#60A5FA', '#FACC15'];
