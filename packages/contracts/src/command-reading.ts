// Leitura de comando: três módulos com questões oficiais do ENEM que já estão no banco.
// Conteúdo de autoria de Charly Jhone (acervo Perfect Enem), uso confirmado em 21/11/2026.
import { z } from "zod";
import type { Letter } from "./item.ts";

export interface CommandItem {
  /** Código da questão no banco (external_id). */
  externalId: string;
  /** O que a alternativa errada revela. Letras sem raciocínio típico ficam de fora. */
  traps: Partial<Record<Letter, string>>;
}

export interface CommandModule {
  id: "L1" | "L2" | "L3";
  title: string;
  /** O erro que o módulo treina, em uma frase. */
  problem: string;
  /** A regra que o aluno leva. */
  rule: string;
  /** Nome curto do erro, para o aluno reconhecer. */
  errorName: string;
  /** O passo do protocolo que mais pesa neste módulo. */
  check: string;
  items: CommandItem[];
}

export const CommandModuleId = z.enum(["L1", "L2", "L3"]);

/** Protocolo de leitura do comando: sete movimentos antes de marcar. */
export const COMMAND_PROTOCOL: { step: string; detail: string }[] = [
  { step: "Leia o comando antes do texto", detail: "Saber o que se pede muda o jeito de ler o texto-base." },
  { step: "Sublinhe o verbo", detail: "E o objeto dele: explica, é a causa de, o máximo que, o que resolve." },
  { step: "Numere as condições", detail: "Cada condição escrita é um filtro: (1), (2), (3)." },
  { step: "Circule a unidade e o período", detail: "kg, km, horas, %, por dia, por mês: o que a resposta precisa ter." },
  { step: "Escreva a pergunta em até cinco palavras", detail: "\"Por que mais espécies?\", \"máximo que funciona?\"." },
  { step: "Dê nome a cada número", detail: "\"27 000 L = etanol, não vinhaça\". Número sem nome vira armadilha." },
  { step: "Só agora leia as alternativas", detail: "Com a pergunta já clara, as pegadinhas perdem força." },
];

/** As três perguntas antes de marcar. */
export const COMMAND_FINAL_CHECK = [
  "Passa em todas as condições numeradas?",
  "Responde à pergunta que foi feita, e não a outra?",
  "Está na unidade e no período pedidos?",
];

export const COMMAND_MODULES: CommandModule[] = [
  {
    id: "L1",
    title: "A condição que você pulou",
    problem: "Você resolve a situação certa, mas ignora uma condição que o enunciado deixou escrita.",
    rule: "Cada condição escrita no enunciado é um filtro. A resposta tem de passar por todos. Alternativa que passa em um filtro só é a armadilha preferida do ENEM.",
    errorName: "Condição pulada",
    check: "Antes de olhar as alternativas, sublinhe cada condição e numere. Depois de escolher, dê um visto em cada número.",
    items: [
      { externalId: "MAT-1688", traps: {
        B: "Você contou só quem \"somente trabalha\" (45,2%) e esqueceu quem trabalha e estuda. Os dois grupos trabalham.",
        D: "Você tirou só quem \"somente estuda\" e esqueceu quem nem trabalha nem estuda.",
        E: "Você somou também quem \"somente estuda\", que não trabalha.",
      } },
      { externalId: "FIS-0145", traps: {
        A: "Você multiplicou também pela altura (6 mca). Ela serve só para achar a vazão no gráfico.",
        E: "Você ignorou as 4 pessoas da casa: 12 · 8 · 30 dá o consumo de uma pessoa só.",
      } },
      { externalId: "MAT-1718", traps: {
        A: "Você escolheu o sachê de menor preço unitário, sem multiplicar pela quantidade necessária.",
        B: "Você olhou só o mineral A. O enunciado pede os três minerais ao mesmo tempo.",
        C: "Você olhou só o mineral B. O enunciado pede os três minerais ao mesmo tempo.",
        E: "Você olhou só o mineral C. O IV precisa de 2 sachês, mas ainda sai mais barato: R$ 12.",
      } },
      { externalId: "QUI-0785", traps: {
        B: "O grupo –CHO é aldeído, não hidroxila. E a cadeia tem apenas uma ligação dupla.",
        C: "Você viu a hidroxila e marcou, pulando as condições \"poli-insaturada\" e \"carbono terminal\". O mentol é saturado e o OH é secundário.",
        D: "O OH ligado ao anel é fenol, não álcool, e não está em carbono terminal de cadeia.",
        E: "A cadeia é poli-insaturada, mas o grupo –CHO é aldeído, não hidroxila terminal.",
      } },
      { externalId: "QUI-0818", traps: {
        A: "O oxigênio em ponte está ligado a C=O: é éster (ou lactona), não éter.",
        C: "Álcool e cetona existem na coronopilina, mas a piretrina não tem OH. A palavra que decide é \"simultaneamente\".",
        D: "Não há H ligado ao C=O: é cetona ou éster, não aldeído.",
        E: "C–O–C ao lado de C=O é um grupo só, o éster. Não são éter e ácido separados.",
      } },
      { externalId: "FIS-0263", traps: {
        A: "A figura mostra o raio voltando para o ar (reflexão). A questão pede o raio que entra no metamaterial.",
        C: "Esta é a refração comum. O enunciado diz que o índice é negativo: o raio fica do mesmo lado da normal.",
      } },
    ],
  },
  {
    id: "L2",
    title: "Responder o que foi perguntado",
    problem: "A alternativa é verdadeira, ou o cálculo está certo, mas não é a resposta da pergunta feita.",
    rule: "No ENEM a alternativa errada quase nunca é mentira: ela é verdadeira e fora do alvo. A pergunta a fazer não é \"isso é verdade?\", é \"isso responde à pergunta que me fizeram?\".",
    errorName: "Verdadeira fora do alvo",
    check: "Escreva a pergunta com as suas palavras, em até cinco palavras. Em cada alternativa, pergunte \"responde a isso?\", e não \"é verdade?\".",
    items: [
      { externalId: "QUI-0781", traps: {
        B: "Todas têm insaturações, é verdade, mas insaturação não é o que define a família aromática.",
        D: "Todas as estruturas mostradas têm oxigênio, mas o benzeno, que dá nome à família, não tem.",
      } },
      { externalId: "BIO-0982", traps: {
        A: "Aumentar a heterogeneidade não resolve o isolamento das populações, que é o que o comando pede.",
        B: "O efeito de borda é um problema dos fragmentos, não algo a ampliar.",
        D: "A sucessão é um processo positivo, mas não reconecta as ilhas de mata.",
        E: "Introduzir espécies não resolve o isolamento e pode prejudicar as nativas.",
      } },
      { externalId: "BIO-1464", traps: {
        A: "A pupa protege mesmo o animal, mas a pergunta é por que existem MAIS ESPÉCIES. Proteger o indivíduo não responde isso.",
        B: "Número de espécies não é número de indivíduos produzidos.",
      } },
      { externalId: "FIS-0269", traps: {
        B: "Você sabe que comprimento de onda menor lê cavidade menor, mas parou no azul. O comando pede o menor possível: o violeta é ainda menor.",
        D: "Inverteu a relação: comprimento de onda maior lê cavidades maiores, não menores.",
        E: "Inverteu a relação e foi ao extremo oposto: o infravermelho é o do CD, o de menor capacidade.",
      } },
      { externalId: "QUI-0843", traps: {
        B: "As três têm ramificações, é verdade, mas não é isso que dá cor. O comando pede a propriedade responsável pela cor.",
        C: "Há carbonos terciários, é verdade, mas não são a causa da cor.",
      } },
      { externalId: "FIS-0392", traps: {
        A: "Você limitou a corrente a 3 A, mas calculou os ramos com 120 V, esquecendo a queda de tensão no cabo.",
        C: "A conta dá 2,67, mas arredondar para cima falha: com 3 lâmpadas a TV fica com cerca de 89 V. O comando pede o máximo que ainda funciona.",
        E: "Você ignorou a resistência do cabo: a TV não recebe sempre 120 V.",
      } },
    ],
  },
  {
    id: "L3",
    title: "O dado certo, na unidade certa",
    problem: "Você usa um número que está no texto, mas é de outra situação, ou opera sem converter a unidade.",
    rule: "Todo número do texto tem nome. Antes de calcular, escreva o nome ao lado do número e a unidade em cada passo: se a unidade não fecha na que foi pedida, a conta está errada mesmo com a aritmética certa.",
    errorName: "Dado de outra situação ou unidade não convertida",
    check: "Circule no comando a unidade pedida e escreva essa unidade no fim da linha da conta antes de calcular.",
    items: [
      { externalId: "QUI-0570", traps: {
        A: "Você aplicou o teor de fósforo ao volume de etanol. A vinhaça é 18 L por litro de etanol: 486 000 L.",
        C: "60 é o teor de fósforo em mg/L, um dado do texto, não a resposta.",
        D: "Conta certa com o número errado: 357 mg/L é o teor de nitrogênio, não de fósforo.",
        E: "Conta certa com o número errado: 2 034 mg/L é o teor de potássio, não de fósforo.",
      } },
      { externalId: "FIS-0104", traps: {
        A: "Você dividiu kWh por W sem converter: 4 400 W são 4,4 kW. O resultado ficou mil vezes menor.",
        B: "Você multiplicou distância por desempenho. A energia é 110 km ÷ 5 km/kWh = 22 kWh.",
        E: "Você combinou os dados ao contrário: potência dividida por energia não dá tempo.",
      } },
      { externalId: "MAT-1794", traps: {
        B: "Erro de conversão: 160 cm não é 0,16 m nesta conta. Ponha as duas medidas na mesma unidade antes de dividir.",
        D: "Você dividiu os números sem converter as unidades e ainda inverteu a razão.",
        E: "Erro por um fator 10 na conversão de unidades.",
      } },
      { externalId: "MAT-1785", traps: {
        B: "Você dividiu em vez de multiplicar pela escala.",
        C: "De cm para km se divide por 100 000 (10⁵), não por 10⁴.",
        D: "Você dividiu em vez de multiplicar pela escala.",
        E: "De cm para km se divide por 100 000, não por 1 000.",
      } },
      { externalId: "QUI-0620", traps: {
        A: "O resíduo não fica sem etanol: sobram 64 kg dos 160 kg iniciais.",
        B: "Você dividiu pela massa inicial (800 kg). A porcentagem é no resíduo, que tem 700 kg.",
        C: "Você tratou os 100 kg de álcool 96% como etanol puro. O destilado tem 96 kg de etanol.",
        E: "Você pôs no numerador o etanol do destilado (96 kg). A pergunta é sobre o que ficou no resíduo.",
      } },
    ],
  },
];

export const commandModule = (id: string): CommandModule | undefined => COMMAND_MODULES.find((m) => m.id === id);
