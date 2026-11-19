// Montagem de cada "Confira no simulador": o botão abre o módulo já com estes valores.
// Os nomes são os parâmetros de rota de cada módulo (param/params/choice no *Module.tsx);
// links.test.ts confere que cada nome existe no módulo da questão.

import type { Questao } from './tipos';

type Montagem = Record<string, number | string>;

export const LINKS: Record<string, Montagem> = {
  // Lançamento oblíquo (cd = 0: sem ar)
  'projetil-1': { v0: 20, angleDeg: 30, g: 10, cd: 0 },
  'projetil-2': { v0: 20, angleDeg: 30, cd: 0 },
  'projetil-3': { v0: 30, angleDeg: 30, g: 10, cd: 0 },
  'projetil-4': { v0: 25, angleDeg: 53, g: 10, cd: 0 },
  'projetil-5': { v0: 30, angleDeg: 35, cd: 0.25 },
  // MUV
  'muv-1': { x0: 0, v0: 20, a: -5 },
  'muv-2': { x0: 0, v0: 0, a: 5, tMax: 6 },
  'muv-3': { x0: 0, v0: 0, a: 2.5 },
  'muv-4': { x0: 10, v0: 5, a: -1 },
  'muv-5': { x0: 0, v0: 10, a: -2 },
  // Leis de Newton
  'newton-1': { m: 20, thetaDeg: 30, muS: 0.5, muK: 0.3, F: 0, g: 10 },
  'newton-2': { m: 10, thetaDeg: 0, muS: 0.4, muK: 0.3, F: 30, g: 10 },
  'newton-3': { thetaDeg: 30, muS: 0, muK: 0, F: 0, g: 10 },
  'newton-4': { m: 10, thetaDeg: 30, muK: 0.2, v0: 2, g: 10 },
  'newton-5': { m: 20, thetaDeg: 30, muS: 0.8, F: 0, g: 10 },
  // Energia (pista U: y = x²/4, então h = 5 m em x ≈ 4,47 m e h = 3,2 m em x ≈ 3,58 m)
  'energia-1': { trackId: 'U', c: 0, g: 10, x0: 4.47 },
  'energia-2': { trackId: 'U', c: 0.3, g: 10 },
  'energia-3': { trackId: 'U', c: 0, g: 10, x0: 3.58 },
  'energia-4': { trackId: 'W', c: 0, g: 10, x0: 0.05 },
  'energia-5': { trackId: 'U', c: 0.3, m: 50, g: 10 },
  // Pêndulo
  'pendulo-1': { g: 10, th0: 5 },
  'pendulo-2': { L: 0.5, th0: 5 },
  'pendulo-3': { L: 1, th0: 5, g: 3.7 },
  'pendulo-4': { m: 0.1, th0: 5 },
  'pendulo-5': { th0: 90, b: 0 },
  // Massa-mola
  'mola-1': { k: 200, m: 0.5, b: 0 },
  'mola-2': { k: 200, m: 1, g: 10 },
  'mola-3': { k: 100, m: 1, A: 0.2, b: 0 },
  'mola-4': { k: 100, m: 0.5, b: 0 },
  'mola-5': { k: 100, m: 1, b: 2 },
  // Colisões
  'colisoes-1': { m1: 2, v1: 3, m2: 1, v2: 0, e: 0 },
  'colisoes-2': { m1: 2, v1: 3, m2: 1, v2: 0, e: 0 },
  'colisoes-3': { m1: 1, v1: 3, m2: 1, v2: 0, e: 1 },
  'colisoes-4': { m1: 2, v1: 3, m2: 1, v2: 0, e: 0.5 },
  'colisoes-5': { m1: 4, v1: 2, m2: 2, v2: -3, e: 0 },
  // Empuxo (fluid: 0 = água, 3 = água do mar)
  'empuxo-1': { fluid: 0, rhoC: 600 },
  'empuxo-2': { fluid: 0, depth: 1, g: 10 },
  'empuxo-3': { fluid: 0, a: 0.2, rhoC: 3000, g: 10 },
  'empuxo-4': { fluid: 0 },
  'empuxo-5': { fluid: 0, rhoC: 600 },
  // Órbitas
  'orbitas-1': { M: 1, r0: 4, f: 1 },
  'orbitas-2': { M: 1, r0: 3, f: 0.71 },
  'orbitas-3': { M: 2, r0: 2, f: 1 },
  'orbitas-4': { M: 1, r0: 1, f: 1 },
  'orbitas-5': { M: 1, r0: 1, f: 0.5 },
  // Circuitos
  'circuitos-1': { mode: 'paralelo', R1: 6, R2: 6, R3: 6, emf: 12, r: 0 },
  'circuitos-2': { mode: 'serie', R1: 2, R2: 4, R3: 6, emf: 12, r: 0 },
  'circuitos-3': { mode: 'misto', R1: 4, R2: 12, R3: 12, emf: 12, r: 0 },
  'circuitos-4': { mode: 'serie', R1: 2, R2: 3, R3: 5, emf: 12, r: 2 },
  'circuitos-5': { mode: 'paralelo', R1: 6, R2: 6, R3: 6, emf: 12, r: 0 },
  // Indução
  'inducao-1': { mode: 'gerador', N: 100, Acm: 200, B: 0.5, f: 5 },
  'inducao-2': { mode: 'gerador', f: 2 },
  'inducao-3': { mode: 'gerador', N: 200, Acm: 100, B: 0.4 },
  'inducao-4': { mode: 'ima', vMag: 1 },
  'inducao-5': { mode: 'ima' },
  // Refração
  'refracao-1': { n1: 1, n2: 1.33, th1d: 60 },
  'refracao-2': { n1: 1.33, n2: 1, th1d: 30 },
  'refracao-3': { n1: 1, n2: 1.5 },
  'refracao-4': { n1: 1, n2: 1.5 },
  'refracao-5': { n1: 1, n2: 1.5 },
  // Lentes e espelhos
  'lentes-1': { el: 'convergente', fAbs: 10, p: 15 },
  'lentes-2': { el: 'divergente', fAbs: 25 },
  'lentes-3': { el: 'convergente', fAbs: 10, p: 30 },
  'lentes-4': { el: 'concavo', fAbs: 20, p: 10 },
  'lentes-5': { el: 'convergente', fAbs: 10, p: 15 },
  // Ondas (corda de 8 m: com v = 20 m/s, o 3º harmônico é 3·20/16 = 3,75 Hz)
  'ondas-1': { T: 20, mu: 0.05, source: 'pulso' },
  'ondas-2': { T: 20, mu: 0.05, source: 'oscilador', end: 'fixa', f: 3.75 },
  'ondas-3': { T: 20, mu: 0.05, source: 'oscilador', end: 'sem-fim', f: 4 },
  'ondas-4': { T: 5, mu: 0.05 },
  'ondas-5': { source: 'pulso', end: 'fixa' },
  // Calorimetria
  'calorimetria-1': { matA: 'agua', mA: 0.2, TA0: 80, matB: 'agua', mB: 0.3, TB0: 20 },
  'calorimetria-2': { matA: 'gelo', mA: 0.1, TA0: 0, matB: 'agua', mB: 0.4, TB0: 30 },
  'calorimetria-3': { matA: 'ferro', mA: 0.5, TA0: 100, matB: 'agua', mB: 1, TB0: 20 },
  'calorimetria-4': { matA: 'agua', mA: 1, TA0: 20, matB: 'agua', mB: 2, TB0: 95 },
  'calorimetria-5': { matA: 'aluminio', mA: 1, matB: 'agua' },
  // Gases
  'gases-1': { T: 300 },
  'gases-2': {},
  'gases-3': { Lx: 10 },
  'gases-4': { T: 300, Lx: 15 },
  'gases-5': { gasId: 'He' },
  // pH
  'ph-1': { anId: 'HCl', Ca: 0.01 },
  'ph-2': { anId: 'CH3COOH', Ca: 0.08, Va: 25, Ct: 0.1, indId: 'fenol' },
  'ph-3': { anId: 'NaOH', Ca: 0.01 },
  'ph-4': { anId: 'CH3COOH', Ca: 0.1 },
  'ph-5': { anId: 'CH3COOH', Ca: 0.1, Va: 25, Ct: 0.1 },
  // Estequiometria (g0, g1: massas dos reagentes na ordem da equação)
  'estequiometria-1': { reacao: 'metano', g0: 32, g1: 160 },
  'estequiometria-2': { reacao: 'agua', g0: 4, g1: 16, yieldPct: 100 },
  'estequiometria-3': { reacao: 'amonia', g0: 28, g1: 10, yieldPct: 100 },
  'estequiometria-4': { reacao: 'amonia', g0: 28, g1: 10 },
  'estequiometria-5': { reacao: 'etanol', g0: 46, g1: 200, yieldPct: 80 },
  // Pilhas
  'pilhas-1': { idA: 'Zn', idB: 'Cu', cA: 1, cB: 1, U: 0 },
  'pilhas-2': { idA: 'Zn', idB: 'Cu' },
  'pilhas-3': { idA: 'Cu', idB: 'Ag', cA: 1, cB: 1, U: 0 },
  'pilhas-4': { idA: 'Zn', idB: 'Cu' },
  'pilhas-5': { idA: 'Zn', idB: 'Cu', cA: 1, cB: 0.01, U: 0 },
  // Efeito estufa
  'estufa-1': { albedo: 0.3 },
  'estufa-2': { albedo: 0.25 },
  'estufa-3': {},
  'estufa-4': { albedo: 0.6 },
  'estufa-5': {},
  // Seleção natural
  'selecao-1': { env: 'escura', pC0: 0.05, s: 0.3 },
  'selecao-2': { s: 0, mu: 0, pC0: 0.6, N: 3000 },
  'selecao-3': { s: 0, mu: 0, pC0: 0.7, N: 3000 },
  'selecao-4': { env: 'clara', s: 0.5, mu: 0, pC0: 0.5 },
  'selecao-5': { s: 0, N: 50 },
  // Genética
  'genetica-1': { mid: 'mono', p1: 'Aa', p2: 'Aa' },
  'genetica-2': { mid: 'x', p1: 'XDXd', p2: 'XDY' },
  'genetica-3': { mid: 'abo', p1: 'IAi', p2: 'IBi' },
  'genetica-4': { mid: 'di', p1: 'AaBb', p2: 'AaBb' },
  'genetica-5': { mid: 'incompleta', p1: 'VB', p2: 'VB' },
  // Funções
  'funcoes-1': { kind: 'quadratica', a: -0.5, b: 4, c: -2 },
  'funcoes-2': { kind: 'exponencial', a: 2, c: 0.5 },
  'funcoes-3': { kind: 'afim', a: 2.5, b: 5 },
  'funcoes-4': { kind: 'quadratica', a: -1, b: 8, c: -7 },
  'funcoes-5': { kind: 'exponencial', a: 0.5, c: 4 },
  // Estatística
  'estatistica-1': {},
  'estatistica-2': { n: 4, p: 0.5 },
  'estatistica-3': {},
  'estatistica-4': { n: 20, p: 0.5 },
  'estatistica-5': { n: 3, p: 0.5 },
  // Matemática financeira
  'juros-1': { mode: 'aplicacao', C: 1000, A: 0, rate: 10, n: 3 },
  'juros-2': { mode: 'financiamento', PV: 12000, rate: 1, n: 12 },
  'juros-3': { mode: 'aplicacao', C: 2000, A: 0, rate: 3, n: 6 },
  'juros-4': { mode: 'aplicacao', C: 1000, A: 0, rate: 1, n: 12 },
  'juros-5': { mode: 'financiamento', PV: 10000, rate: 2, n: 12 },
};

/** Rota do simulador já montado para a questão: "#pendulo?L=1&th0=5". */
export function linkDaQuestao(q: Pick<Questao, 'id' | 'modulo'>): string {
  const m = LINKS[q.id];
  const query = m ? new URLSearchParams(Object.entries(m).map(([k, v]) => [k, String(v)])).toString() : '';
  return `#${q.modulo}${query ? `?${query}` : ''}`;
}
