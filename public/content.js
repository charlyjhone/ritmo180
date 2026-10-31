// Questões e texto criados para a demonstração.
export const QUESTIONS = [
  {
    skill: "CN · Competência 6 · H21",
    target: 160,
    text: "Em uma casa em Macapá, o chuveiro elétrico tem potência de 5 500 W e é usado, em média, 10 minutos por dia. A concessionária de energia cobra R$ 0,80 por quilowatt-hora (kWh) consumido.",
    command: "Considerando um mês de 30 dias, qual é o custo mensal do uso desse chuveiro?",
    hint: "a conta de luz cobra por kWh. Em que unidades estão a potência e o tempo no enunciado?",
    correct: 2,
    alts: ["R$ 0,73", "R$ 13,20", "R$ 22,00", "R$ 132,00", "R$ 22.000,00"],
    traps: [
      "Você calculou um único dia e esqueceu os 30 dias do mês.",
      "Você converteu 10 minutos como 0,1 hora. O correto é 10/60 h, ou 1/6 h.",
      "",
      "Você usou 1 hora por banho em vez de 10 minutos.",
      "Você não converteu watt para quilowatt, e a tarifa é por kWh.",
    ],
    solution: "E = 5,5 kW × (1/6 h) × 30 = 27,5 kWh. Custo = 27,5 × 0,80 = R$ 22,00.",
  },
  {
    skill: "CN · Competência 6 · H21",
    target: 150,
    text: "Uma escola instalou em cada sala um ar-condicionado de 1 200 W, que fica ligado 4 horas por dia letivo. A tarifa de energia da região é de R$ 0,90 por kWh.",
    command: "Em um período de 30 dias de uso, qual é o custo de energia de um desses aparelhos?",
    hint: "primeiro descubra a energia em kWh de um dia. Depois pense no mês e, por último, no preço.",
    correct: 1,
    alts: ["R$ 32,40", "R$ 129,60", "R$ 4,32", "R$ 129.600,00", "R$ 144,00"],
    traps: [
      "Você usou 1 hora por dia em vez de 4 horas.",
      "",
      "Você calculou um único dia e esqueceu os 30 dias.",
      "Você não converteu watt para quilowatt.",
      "Você parou no consumo em kWh e esqueceu de aplicar a tarifa.",
    ],
    solution: "E = 1,2 kW × 4 h × 30 = 144 kWh. Custo = 144 × 0,90 = R$ 129,60.",
  },
];

export const READING = {
  title: "O preço do sucesso",
  text: "O açaí sempre esteve na mesa das famílias do Amapá, mas nos últimos anos o fruto ganhou o mundo. A procura de outros estados e países fez o preço subir, e isso trouxe renda para muitos ribeirinhos. Ao mesmo tempo, moradores das cidades da região passaram a pagar mais caro por um alimento que antes era barato e diário. Pesquisadores alertam ainda para outro efeito: em algumas áreas, a pressa em produzir mais levou à derrubada de outras árvores para abrir espaço aos açaizeiros, o que reduz a variedade da floresta. Por isso, defendem o manejo, técnica que aumenta a produção sem eliminar as demais espécies. Para eles, o sucesso do açaí só será duradouro se o ganho econômico de hoje não comprometer a floresta de amanhã.",
  questions: [
    {
      kind: "LOCALIZAR",
      prompt: "Segundo o texto, qual foi um efeito do aumento da procura pelo açaí?",
      opts: ["Queda no preço para os moradores das cidades.", "Aumento da renda de muitos ribeirinhos.", "Fim do consumo diário na região.", "Proibição do manejo dos açaizeiros."],
      correct: 1,
      why: "o texto diz que a alta do preço trouxe renda para muitos ribeirinhos.",
    },
    {
      kind: "INFERIR",
      prompt: 'Ao dizer que o açaí "era barato e diário", o texto sugere que:',
      opts: ["o fruto deixou de ser produzido no Amapá.", "para muitos moradores, o açaí ficou menos acessível.", "os moradores passaram a preferir outros alimentos.", "o preço do açaí não muda há anos."],
      correct: 1,
      why: "se era barato e passou a custar mais, ficou menos acessível.",
    },
    {
      kind: "TESE",
      prompt: "A ideia principal defendida pelos pesquisadores é que:",
      opts: ["a produção de açaí deve ser reduzida.", "o açaí deve ser vendido só no Amapá.", "o crescimento econômico do açaí precisa preservar a floresta.", "os açaizeiros devem substituir as outras árvores."],
      correct: 2,
      why: "a última frase resume a tese: ganho de hoje sem comprometer a floresta.",
    },
    {
      kind: "EXTRAPOLAÇÃO",
      prompt: "Qual afirmação NÃO pode ser concluída a partir do texto?",
      opts: ["O açaí é consumido fora do Amapá.", "O manejo permite produzir mais.", "Todos os ribeirinhos ficaram ricos com o açaí.", "Houve derrubada de árvores em algumas áreas."],
      correct: 2,
      why: 'o texto fala em renda para muitos, não em riqueza para todos. "Todos" é extrapolação.',
    },
  ],
};
