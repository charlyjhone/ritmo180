export interface Species {
  id: string;
  label: string; // fórmula com subscritos
  M: number; // g/mol
  atoms: string[];
}

export const SPECIES: Record<string, Species> = {
  H2: { id: 'H2', label: 'H₂', M: 2.016, atoms: ['H', 'H'] },
  O2: { id: 'O2', label: 'O₂', M: 31.998, atoms: ['O', 'O'] },
  H2O: { id: 'H2O', label: 'H₂O', M: 18.015, atoms: ['H', 'O', 'H'] },
  N2: { id: 'N2', label: 'N₂', M: 28.014, atoms: ['N', 'N'] },
  NH3: { id: 'NH3', label: 'NH₃', M: 17.031, atoms: ['H', 'N', 'H', 'H'] },
  CH4: { id: 'CH4', label: 'CH₄', M: 16.043, atoms: ['H', 'C', 'H', 'H', 'H'] },
  CO2: { id: 'CO2', label: 'CO₂', M: 44.009, atoms: ['O', 'C', 'O'] },
  C2H5OH: { id: 'C2H5OH', label: 'C₂H₅OH', M: 46.069, atoms: ['C', 'C', 'O', 'H', 'H', 'H', 'H', 'H', 'H'] },
  Fe: { id: 'Fe', label: 'Fe', M: 55.845, atoms: ['Fe'] },
  Fe2O3: { id: 'Fe2O3', label: 'Fe₂O₃', M: 159.687, atoms: ['Fe', 'O', 'Fe', 'O', 'O'] },
};

export interface Term {
  sp: string;
  nu: number;
}

export interface Reaction {
  id: string;
  name: string;
  reactants: Term[];
  products: Term[];
  defaults: number[]; // massas iniciais (g) dos reagentes
}

export const REACTIONS: Reaction[] = [
  { id: 'agua', name: 'Formação da água', reactants: [{ sp: 'H2', nu: 2 }, { sp: 'O2', nu: 1 }], products: [{ sp: 'H2O', nu: 2 }], defaults: [4, 16] },
  { id: 'amonia', name: 'Síntese da amônia (Haber)', reactants: [{ sp: 'N2', nu: 1 }, { sp: 'H2', nu: 3 }], products: [{ sp: 'NH3', nu: 2 }], defaults: [28, 10] },
  { id: 'metano', name: 'Combustão do metano', reactants: [{ sp: 'CH4', nu: 1 }, { sp: 'O2', nu: 2 }], products: [{ sp: 'CO2', nu: 1 }, { sp: 'H2O', nu: 2 }], defaults: [16, 48] },
  { id: 'etanol', name: 'Combustão do etanol', reactants: [{ sp: 'C2H5OH', nu: 1 }, { sp: 'O2', nu: 3 }], products: [{ sp: 'CO2', nu: 2 }, { sp: 'H2O', nu: 3 }], defaults: [46, 80] },
  { id: 'ferrugem', name: 'Oxidação do ferro', reactants: [{ sp: 'Fe', nu: 4 }, { sp: 'O2', nu: 3 }], products: [{ sp: 'Fe2O3', nu: 2 }], defaults: [112, 32] },
];

/** Grau de avanço máximo e reagente limitante. */
export function limiting(r: Reaction, molesIn: number[]) {
  let xi = Infinity;
  let idx = 0;
  r.reactants.forEach((t, i) => {
    const x = molesIn[i] / t.nu;
    if (x < xi) {
      xi = x;
      idx = i;
    }
  });
  return { xiMax: xi, limiting: idx };
}

/** Quantidades (mol) de todas as espécies para um grau de avanço ξ. Ordem: reagentes, depois produtos. */
export function amounts(r: Reaction, molesIn: number[], xi: number) {
  return [...r.reactants.map((t, i) => molesIn[i] - t.nu * xi), ...r.products.map((t) => t.nu * xi)];
}

export function masses(r: Reaction, molesIn: number[], xi: number) {
  const all = [...r.reactants, ...r.products];
  return amounts(r, molesIn, xi).map((n, i) => n * SPECIES[all[i].sp].M);
}

/** Lei de Lavoisier aplicada à equação: Σν·M dos reagentes = Σν·M dos produtos. */
export function massBalance(r: Reaction) {
  const s = (ts: Term[]) => ts.reduce((a, t) => a + t.nu * SPECIES[t.sp].M, 0);
  return { reactants: s(r.reactants), products: s(r.products) };
}

/** Cinética simples para animar: dξ/dt = k·(ξ_final − ξ). */
export const rate = (xiFinal: number, xi: number, k: number) => k * (xiFinal - xi);
