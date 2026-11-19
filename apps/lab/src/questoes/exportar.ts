// Converte as questões do Laboratório para o formato canônico do Ritmo 180 (CanonicalItem).
// O arquivo content/laboratorio.json é gerado daqui (npm run content:laboratorio) e nunca é editado à mão.

import type { CanonicalItem } from '@ritmo/contracts';
import { LETRAS, type Questao } from './tipos';
import { DIREITOS_CONFIRMADOS } from './direitos';
import { LINKS } from './links';

/** Disciplina e assunto do Ritmo para cada simulador (assuntos já usados no banco dos livros). */
const DESTINO: Record<string, { area: 'CN' | 'MT'; discipline: string; topic: string }> = {
  projetil: { area: 'CN', discipline: 'Física', topic: 'Cinemática' },
  muv: { area: 'CN', discipline: 'Física', topic: 'Cinemática' },
  newton: { area: 'CN', discipline: 'Física', topic: 'Dinâmica' },
  energia: { area: 'CN', discipline: 'Física', topic: 'Trabalho e Energia' },
  pendulo: { area: 'CN', discipline: 'Física', topic: 'Ondulatória' },
  mola: { area: 'CN', discipline: 'Física', topic: 'Ondulatória' },
  colisoes: { area: 'CN', discipline: 'Física', topic: 'Impulso e Quantidade de Movimento' },
  empuxo: { area: 'CN', discipline: 'Física', topic: 'Hidrostática' },
  orbitas: { area: 'CN', discipline: 'Física', topic: 'Gravitação' },
  circuitos: { area: 'CN', discipline: 'Física', topic: 'Eletrodinâmica' },
  inducao: { area: 'CN', discipline: 'Física', topic: 'Eletromagnetismo' },
  refracao: { area: 'CN', discipline: 'Física', topic: 'Óptica Geométrica' },
  lentes: { area: 'CN', discipline: 'Física', topic: 'Óptica Geométrica' },
  ondas: { area: 'CN', discipline: 'Física', topic: 'Ondulatória' },
  calorimetria: { area: 'CN', discipline: 'Física', topic: 'Termologia' },
  gases: { area: 'CN', discipline: 'Física', topic: 'Termologia' },
  ph: { area: 'CN', discipline: 'Química', topic: 'Soluções' },
  estequiometria: { area: 'CN', discipline: 'Química', topic: 'Estequiometria' },
  pilhas: { area: 'CN', discipline: 'Química', topic: 'Eletroquímica' },
  estufa: { area: 'CN', discipline: 'Química', topic: 'Química Ambiental' },
  selecao: { area: 'CN', discipline: 'Biologia', topic: 'Evolução' },
  genetica: { area: 'CN', discipline: 'Biologia', topic: 'Genética' },
  funcoes: { area: 'MT', discipline: 'Matemática', topic: 'Função Afim' },
  estatistica: { area: 'MT', discipline: 'Matemática', topic: 'Estatística' },
  juros: { area: 'MT', discipline: 'Matemática', topic: 'Matemática Financeira' },
};

const FUNCOES: Record<string, string> = { afim: 'Função Afim', quadratica: 'Função Quadrática', exponencial: 'Função Exponencial' };

export function destino(q: Questao) {
  const d = DESTINO[q.modulo];
  if (!d) throw new Error(`Simulador sem destino no Ritmo: ${q.modulo}`);
  if (q.modulo === 'funcoes') return { ...d, topic: FUNCOES[String(LINKS[q.id]?.kind)] ?? d.topic };
  if (q.modulo === 'estatistica' && /probabilidade|binomial/i.test(q.assunto)) return { ...d, topic: 'Probabilidade' };
  return d;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const p = (s: string) => `<p>${esc(s)}</p>`;
const semPonto = (s: string) => s.trim().replace(/[.;]$/, '');

/** Rota do simulador montado, sem o "#": "pendulo?L=1&th0=5". */
export function rotaDaQuestao(q: Questao): string {
  const m = LINKS[q.id] ?? {};
  const query = new URLSearchParams(Object.entries(m).map(([k, v]) => [k, String(v)])).toString();
  return query ? `${q.modulo}?${query}` : q.modulo;
}

/**
 * Explicação de cada alternativa errada, tirada da resolução: só a oração que começa pelo texto da
 * alternativa ("80 m multiplica velocidade e frequência"). Contas intermediárias que só citam o valor
 * não contam, e alternativas curtas demais ("4.") não são procuradas.
 */
/** Orações que começam pela alternativa mas não explicam o erro sozinhas (revisadas à mão). */
const SEM_ARMADILHA = new Set(['estequiometria-3:B', 'pilhas-3:E', 'energia-5:E']);

export function armadilhas(q: Questao): Partial<Record<number, string>> {
  const oracoes = q.resolucao
    .flatMap((r) => r.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9R])|;\s*/))
    .map((o) => o.trim().replace(/^(a alternativa|a opção)\s+/i, ''));
  const out: Partial<Record<number, string>> = {};
  q.alternativas.forEach((alt, i) => {
    if (i === q.correta || SEM_ARMADILHA.has(`${q.id}:${LETRAS[i]}`)) return;
    const a = semPonto(alt);
    if (a.length < 4 || /^[\d\s,.%]+$/.test(a)) return;
    const o = oracoes.find((x) => x.startsWith(a) && x.length > a.length + 8);
    if (o) out[i] = o.charAt(0).toUpperCase() + o.slice(1).replace(/[^.!?]$/, '$&.');
  });
  return out;
}

export function paraRitmo(q: Questao): CanonicalItem {
  const d = destino(q);
  const contexto = q.texto.slice(0, -1);
  const comando = q.texto[q.texto.length - 1]!;
  const traps = armadilhas(q);
  return {
    externalId: `lab-${q.id}`,
    source: 'authored',
    area: d.area,
    discipline: d.discipline,
    topic: d.topic,
    application: 'Laboratório Virtual',
    contextHtml: contexto.map(p).join(''),
    stemHtml: esc(comando),
    alternatives: q.alternativas.map((html, i) => ({ letter: LETRAS[i]!, html: esc(semPonto(html)), ...(traps[i] ? { trap: traps[i] } : {}) })),
    answer: LETRAS[q.correta]!,
    // O <span class="lab-ref"> leva a rota do simulador montado; a interface do Ritmo troca por um botão.
    solutionHtml:
      q.resolucao.map(p).join('') +
      `<div class="lab-roteiro"><p><strong>Confira no simulador.</strong> ${esc(q.simulador)}</p><span class="lab-ref">${esc(rotaDaQuestao(q))}</span></div>`,
    prerequisites: [],
    rightsCleared: DIREITOS_CONFIRMADOS !== null,
    rightsNote: DIREITOS_CONFIRMADOS
      ? `Questão autoral do Laboratório Virtual (apps/lab). Direitos confirmados por ${DIREITOS_CONFIRMADOS.por} em ${DIREITOS_CONFIRMADOS.em}.`
      : 'Questão autoral do Laboratório Virtual (apps/lab). Publicar só depois da confirmação.',
  };
}
