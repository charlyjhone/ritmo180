export interface Questao {
  id: string;
  /** id do experimento em modules/registry.ts */
  modulo: string;
  assunto: string;
  dificuldade: 1 | 2 | 3;
  /** Parágrafos do enunciado; o último é o comando. */
  texto: string[];
  alternativas: [string, string, string, string, string];
  correta: 0 | 1 | 2 | 3 | 4;
  resolucao: string[];
  /** Como reproduzir a situação no simulador. */
  simulador: string;
  /** Valor numérico de cada alternativa (quando a resposta é um número): o teste confere o gabarito com a física do módulo. */
  valores?: [number, number, number, number, number];
  /** Tolerância relativa da conferência (padrão 2%: os enunciados arredondam como a prova). */
  tol?: number;
}

export const LETRAS = ['A', 'B', 'C', 'D', 'E'] as const;
