import { type Rand } from '../../core/random';

/** Genótipo = lista de genes; cada gene é um par de alelos. */
export type Genotype = [string, string][];

export interface Phenotype {
  id: string;
  label: string;
  color: string;
}

export interface CrossMode {
  id: string;
  name: string;
  /** Genótipos disponíveis para cada genitor. */
  options: [string[], string[]];
  parse: (s: string) => Genotype;
  phenotypes: Phenotype[];
  phenotype: (g: Genotype) => string;
  defaults: [string, string];
  note: string;
}

const pairs = (s: string, n: number): Genotype => {
  const tok = s.match(/I\^?[AB]|X[a-zA-Z]|Y|[a-zA-Z]/g) ?? [];
  const g: Genotype = [];
  for (let i = 0; i < n; i++) g.push([tok[2 * i], tok[2 * i + 1]]);
  return g;
};

const has = (gene: [string, string], a: string) => gene[0] === a || gene[1] === a;

export const MODES: CrossMode[] = [
  {
    id: 'mono',
    name: 'Monoibridismo (dominância completa)',
    options: [['AA', 'Aa', 'aa'], ['AA', 'Aa', 'aa']],
    parse: (s) => pairs(s, 1),
    phenotypes: [
      { id: 'dom', label: 'amarela (A_)', color: '#FACC15' },
      { id: 'rec', label: 'verde (aa)', color: '#22C55E' },
    ],
    phenotype: (g) => (has(g[0], 'A') ? 'dom' : 'rec'),
    defaults: ['Aa', 'Aa'],
    note: 'Ervilhas de Mendel: o alelo A (amarela) domina a (verde). Aa × Aa dá 3 : 1.',
  },
  {
    id: 'incompleta',
    name: 'Dominância incompleta (maravilha)',
    options: [['VV', 'VB', 'BB'], ['VV', 'VB', 'BB']],
    parse: (s) => pairs(s, 1),
    phenotypes: [
      { id: 'verm', label: 'vermelha (VV)', color: '#EF4444' },
      { id: 'rosa', label: 'rosa (VB)', color: '#F472B6' },
      { id: 'branca', label: 'branca (BB)', color: '#F1F5F9' },
    ],
    phenotype: (g) => ['branca', 'rosa', 'verm'][(g[0][0] === 'V' ? 1 : 0) + (g[0][1] === 'V' ? 1 : 0)],
    defaults: ['VB', 'VB'],
    note: 'O heterozigoto tem fenótipo intermediário: genótipo e fenótipo seguem a mesma proporção 1 : 2 : 1.',
  },
  {
    id: 'di',
    name: 'Diibridismo (2ª lei de Mendel)',
    options: [['AABB', 'AaBb', 'Aabb', 'aaBb', 'aabb'], ['AABB', 'AaBb', 'Aabb', 'aaBb', 'aabb']],
    parse: (s) => pairs(s, 2),
    phenotypes: [
      { id: 'AB', label: 'amarela lisa', color: '#FACC15' },
      { id: 'Ab', label: 'amarela rugosa', color: '#CA8A04' },
      { id: 'aB', label: 'verde lisa', color: '#22C55E' },
      { id: 'ab', label: 'verde rugosa', color: '#15803D' },
    ],
    phenotype: (g) => (has(g[0], 'A') ? 'A' : 'a') + (has(g[1], 'B') ? 'B' : 'b'),
    defaults: ['AaBb', 'AaBb'],
    note: 'Genes em cromossomos diferentes segregam de forma independente: AaBb × AaBb dá 9 : 3 : 3 : 1 = (3 : 1)².',
  },
  {
    id: 'abo',
    name: 'Grupos sanguíneos ABO (alelos múltiplos)',
    options: [['IAIA', 'IAi', 'IBIB', 'IBi', 'IAIB', 'ii'], ['IAIA', 'IAi', 'IBIB', 'IBi', 'IAIB', 'ii']],
    parse: (s) => pairs(s, 1),
    phenotypes: [
      { id: 'A', label: 'tipo A', color: '#60A5FA' },
      { id: 'B', label: 'tipo B', color: '#F59E0B' },
      { id: 'AB', label: 'tipo AB', color: '#A78BFA' },
      { id: 'O', label: 'tipo O', color: '#94A3B8' },
    ],
    phenotype: (g) => {
      const a = has(g[0], 'IA');
      const b = has(g[0], 'IB');
      return a && b ? 'AB' : a ? 'A' : b ? 'B' : 'O';
    },
    defaults: ['IAi', 'IBi'],
    note: 'Iᴬ e Iᴮ são codominantes e ambos dominam i. Pais A e B heterozigotos podem ter filhos dos quatro tipos.',
  },
  {
    id: 'x',
    name: 'Herança ligada ao X (daltonismo)',
    options: [['XDXD', 'XDXd', 'XdXd'], ['XDY', 'XdY']],
    parse: (s) => pairs(s, 1),
    phenotypes: [
      { id: 'fn', label: 'menina normal', color: '#F9A8D4' },
      { id: 'fd', label: 'menina daltônica', color: '#BE185D' },
      { id: 'mn', label: 'menino normal', color: '#93C5FD' },
      { id: 'md', label: 'menino daltônico', color: '#1D4ED8' },
    ],
    phenotype: (g) => {
      const male = has(g[0], 'Y');
      const affected = male ? has(g[0], 'Xd') : g[0][0] === 'Xd' && g[0][1] === 'Xd';
      return (male ? 'm' : 'f') + (affected ? 'd' : 'n');
    },
    defaults: ['XDXd', 'XDY'],
    note: 'O pai passa o X só para as filhas e o Y para os filhos: mãe portadora (XᴰXᵈ) tem 50% de chance de ter um menino daltônico.',
  },
];

/** Gametas de um genitor (um alelo de cada gene, todos equiprováveis — segregação independente). */
export function gametes(g: Genotype): { alleles: string[]; p: number }[] {
  let out: { alleles: string[]; p: number }[] = [{ alleles: [], p: 1 }];
  for (const gene of g) out = out.flatMap((x) => gene.map((a) => ({ alleles: [...x.alleles, a], p: x.p / 2 })));
  // junta gametas iguais
  const map = new Map<string, { alleles: string[]; p: number }>();
  for (const x of out) {
    const k = x.alleles.join('');
    const e = map.get(k);
    if (e) e.p += x.p;
    else map.set(k, { ...x });
  }
  return [...map.values()];
}

const ORDER = ['A', 'V', 'B', 'IA', 'IB', 'XD', 'a', 'b', 'i', 'Xd', 'Y'];
const rank = (a: string) => ORDER.indexOf(a);

export function combine(g1: string[], g2: string[]): Genotype {
  return g1.map((a, i) => {
    const b = g2[i];
    return (rank(a) <= rank(b) ? [a, b] : [b, a]) as [string, string];
  });
}

/** Regra do produto (diibridismo): P(fenótipo) = P(gene A) × P(gene B), cada gene tratado como um monoibridismo. */
export function productRule(p1: Genotype, p2: Genotype, phId: string) {
  const pRec = (gene: [string, string], rec: string) => gene.filter((x) => x === rec).length / 2;
  const PaA = pRec(p1[0], 'a') * pRec(p2[0], 'a');
  const PbB = pRec(p1[1], 'b') * pRec(p2[1], 'b');
  return (phId[0] === 'A' ? 1 - PaA : PaA) * (phId[1] === 'B' ? 1 - PbB : PbB);
}

export const genotypeLabel = (g: Genotype) => g.map(([a, b]) => a + b).join('');

/** Quadro de Punnett: probabilidades exatas de cada fenótipo. */
export function punnett(m: CrossMode, p1: string, p2: string) {
  const G1 = gametes(m.parse(p1));
  const G2 = gametes(m.parse(p2));
  const probs: Record<string, number> = Object.fromEntries(m.phenotypes.map((p) => [p.id, 0]));
  const cells = G1.map((a) =>
    G2.map((b) => {
      const g = combine(a.alleles, b.alleles);
      const ph = m.phenotype(g);
      probs[ph] += a.p * b.p;
      return { g, ph, p: a.p * b.p };
    }),
  );
  return { G1, G2, cells, probs };
}

/** Sorteia um descendente: cada genitor contribui um alelo ao acaso de cada gene. */
export function offspring(m: CrossMode, p1: Genotype, p2: Genotype, rand: Rand) {
  const a = p1.map((gene) => gene[rand() < 0.5 ? 0 : 1]);
  const b = p2.map((gene) => gene[rand() < 0.5 ? 0 : 1]);
  return m.phenotype(combine(a, b));
}

/** Estatística χ² e valores críticos (α = 5%) por graus de liberdade. */
export const CHI2_CRIT = [NaN, 3.841, 5.991, 7.815, 9.488];
export function chiSquare(observed: number[], expectedP: number[], n: number) {
  let x = 0;
  observed.forEach((o, i) => {
    const e = expectedP[i] * n;
    if (e > 0) x += ((o - e) * (o - e)) / e;
  });
  return x;
}

/** Display bonito: IA → Iᴬ, Xd → Xᵈ. */
export const pretty = (s: string) => s.replace(/IA/g, 'Iᴬ').replace(/IB/g, 'Iᴮ').replace(/XD/g, 'Xᴰ').replace(/Xd/g, 'Xᵈ');
