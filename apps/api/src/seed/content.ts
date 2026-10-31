// Conteúdo mínimo da instalação: pré-requisitos e textos de leitura autorais.
export const PREREQUISITES = [
  { key: "equacao_1grau", name: "Equação do 1º grau", grade: "7º ano", areas: "MT · CN" },
  { key: "proporcao", name: "Razão e proporção", grade: "7º ano", areas: "MT · CN" },
  { key: "conversao_unidades", name: "Conversão de unidades", grade: "6º ano", areas: "CN · MT" },
  { key: "potencia_dez", name: "Potência de 10", grade: "8º ano", areas: "CN · MT" },
  { key: "leitura_grafico", name: "Leitura de gráficos", grade: "8º ano", areas: "CN · CH · MT" },
  { key: "interpretacao_texto", name: "Interpretação de texto", grade: "6º ano", areas: "LC · CH" },
];

type Question = { kind: string; prompt: string; options: string[]; answer: number; why: string };
const q = (kind: string, prompt: string, options: string[], answer: number, why: string): Question => ({ kind, prompt, options, answer, why });

export const READING_TEXTS = [
  {
    externalId: "leitura-acai", title: "O preço do sucesso", grade: "9º ano",
    body: "O açaí sempre esteve na mesa das famílias do Amapá, mas nos últimos anos o fruto ganhou o mundo. A procura de outros estados e países fez o preço subir, e isso trouxe renda para muitos ribeirinhos. Ao mesmo tempo, moradores das cidades da região passaram a pagar mais caro por um alimento que antes era barato e diário. Pesquisadores alertam ainda para outro efeito: em algumas áreas, a pressa em produzir mais levou à derrubada de outras árvores para abrir espaço aos açaizeiros, o que reduz a variedade da floresta. Por isso, defendem o manejo, técnica que aumenta a produção sem eliminar as demais espécies. Para eles, o sucesso do açaí só será duradouro se o ganho econômico de hoje não comprometer a floresta de amanhã.",
    questions: [
      q("LOCALIZAR", "Segundo o texto, qual foi um efeito do aumento da procura pelo açaí?", ["Queda no preço para os moradores das cidades.", "Aumento da renda de muitos ribeirinhos.", "Fim do consumo diário na região.", "Proibição do manejo dos açaizeiros."], 1, "O texto diz que a alta do preço trouxe renda para muitos ribeirinhos."),
      q("INFERIR", 'Ao dizer que o açaí "era barato e diário", o texto sugere que:', ["o fruto deixou de ser produzido no Amapá.", "para muitos moradores, o açaí ficou menos acessível.", "os moradores passaram a preferir outros alimentos.", "o preço do açaí não muda há anos."], 1, "Se era barato e passou a custar mais, ficou menos acessível."),
      q("TESE", "A ideia principal defendida pelos pesquisadores é que:", ["a produção de açaí deve ser reduzida.", "o açaí deve ser vendido só no Amapá.", "o crescimento econômico do açaí precisa preservar a floresta.", "os açaizeiros devem substituir as outras árvores."], 2, "A última frase resume a tese: ganho de hoje sem comprometer a floresta."),
      q("EXTRAPOLAÇÃO", "Qual afirmação NÃO pode ser concluída a partir do texto?", ["O açaí é consumido fora do Amapá.", "O manejo permite produzir mais.", "Todos os ribeirinhos ficaram ricos com o açaí.", "Houve derrubada de árvores em algumas áreas."], 2, 'O texto fala em renda para muitos, não em riqueza para todos. "Todos" é extrapolação.'),
    ],
  },
  {
    externalId: "leitura-ponte", title: "A ponte e o ônibus", grade: "1ª série",
    body: "Quando a prefeitura anunciou a nova ponte sobre o rio, muitos moradores comemoraram: o trajeto até o centro cairia de uma hora para vinte minutos. Dois anos depois da inauguração, o tempo de viagem de fato diminuiu para quem anda de carro, mas não para quem depende do ônibus. As linhas continuaram com os mesmos horários, e os veículos passaram a disputar espaço com um número maior de automóveis, atraídos pela via nova. Urbanistas chamam esse efeito de demanda induzida: quando se abre mais espaço para os carros, mais pessoas decidem usá-los, e o congestionamento retorna. Eles não afirmam que obras viárias são inúteis, mas lembram que uma ponte resolve pouco se vier sozinha. Sem corredores de ônibus e mais horários, a obra beneficia principalmente quem já tinha mais opções.",
    questions: [
      q("LOCALIZAR", "Para quem o tempo de viagem diminuiu, segundo o texto?", ["Para quem anda de carro.", "Para quem depende do ônibus.", "Para todos os moradores.", "Para quem mora no centro."], 0, "O texto afirma que o tempo diminuiu para quem anda de carro, mas não para quem depende do ônibus."),
      q("INFERIR", "O que explica a piora para os passageiros de ônibus?", ["A ponte foi construída no lugar errado.", "As linhas foram cortadas pela prefeitura.", "Mais carros passaram a ocupar a via, e os horários não mudaram.", "Os moradores deixaram de usar o ônibus."], 2, "O texto liga os mesmos horários à disputa com mais automóveis."),
      q("TESE", "Qual é a posição dos urbanistas?", ["Pontes não deveriam ser construídas.", "Obras viárias precisam vir com medidas para o transporte coletivo.", "O carro é a melhor solução para as cidades.", "A demanda induzida é um mito."], 1, "Eles dizem que a ponte resolve pouco sozinha, sem corredores e mais horários."),
      q("EXTRAPOLAÇÃO", "Qual afirmação vai além do que o texto permite concluir?", ["O congestionamento pode voltar depois de uma obra.", "A obra beneficiou mais quem tinha mais opções.", "Toda obra viária piora o trânsito.", "As linhas de ônibus mantiveram os horários."], 2, 'O texto diz o contrário: não afirma que as obras são inúteis. "Toda" extrapola.'),
    ],
  },
  {
    externalId: "leitura-sono", title: "Sono de adolescente", grade: "2ª série",
    body: "Pais costumam interpretar como preguiça o hábito de adolescentes de dormir tarde e acordar tarde, mas estudos sobre o relógio biológico apontam outra explicação. Na adolescência, a liberação de melatonina, hormônio ligado ao sono, ocorre mais tarde do que na infância, o que atrasa a sensação de cansaço. Assim, um jovem que precisa acordar às seis pode estar dormindo bem menos do que as oito ou nove horas recomendadas, ainda que se deite em um horário considerado razoável pelos adultos. Algumas escolas que atrasaram o início das aulas registraram menos faltas e melhor desempenho. Os pesquisadores ressalvam que telas à noite agravam o quadro, pois a luz também adia o sono. Ou seja, a biologia explica parte do problema, mas os hábitos não deixam de contar.",
    questions: [
      q("LOCALIZAR", "O que acontece com a melatonina na adolescência?", ["Deixa de ser produzida.", "É liberada mais tarde do que na infância.", "É liberada mais cedo pela manhã.", "Aumenta com o uso de telas."], 1, "O texto diz que a liberação ocorre mais tarde do que na infância."),
      q("INFERIR", "A expressão “ainda que se deite em um horário considerado razoável” sugere que:", ["adultos e adolescentes têm a mesma necessidade de sono.", "o horário que parece bom ao adulto pode não bastar ao adolescente.", "adolescentes dormem mais do que precisam.", "o horário de dormir não tem relação com a escola."], 1, "Mesmo deitando em horário razoável, o jovem pode dormir menos que o recomendado."),
      q("TESE", "Qual é a ideia central do texto?", ["Adolescentes são preguiçosos por natureza.", "As escolas devem proibir o uso de telas.", "O sono tardio tem causa biológica, somada aos hábitos.", "Dormir tarde melhora o desempenho escolar."], 2, "A última frase resume: biologia explica parte, e os hábitos também contam."),
      q("EXTRAPOLAÇÃO", "Qual conclusão NÃO é sustentada pelo texto?", ["A luz das telas pode adiar o sono.", "Atrasar a aula eliminaria todas as faltas.", "Algumas escolas mudaram o horário de início.", "O relógio biológico muda na adolescência."], 1, 'O texto diz "menos faltas", não o fim delas.'),
    ],
  },
  {
    externalId: "leitura-caatinga", title: "Água de cisterna", grade: "3ª série",
    body: "Durante décadas, a política para o semiárido brasileiro foi descrita como combate à seca, expressão que tratava o clima como inimigo a ser vencido com grandes obras. Nos anos 2000, ganhou força outra formulação: convivência com o semiárido. A mudança não é apenas de vocabulário. Em vez de esperar água trazida de longe, famílias passaram a guardar a chuva em cisternas de placas, construídas com mão de obra local, ao lado da própria casa. A água não falta o ano inteiro para quem a armazena, e isso reduz a dependência de carros-pipa, muitas vezes controlados por interesses políticos. Críticos lembram que cisternas não resolvem a produção agrícola em larga escala. Seus defensores respondem que elas nunca pretenderam isso: o objetivo é garantir água para beber e cozinhar, condição mínima para que outras escolhas sejam possíveis.",
    questions: [
      q("LOCALIZAR", "Onde as cisternas de placas são construídas?", ["Ao lado da casa das famílias.", "Nas capitais do Nordeste.", "Em grandes açudes públicos.", "Nas áreas de produção agrícola."], 0, "O texto diz que são construídas ao lado da própria casa."),
      q("INFERIR", "Ao citar carros-pipa “controlados por interesses políticos”, o texto sugere que:", ["os carros-pipa são a melhor solução.", "a dependência de água podia ser usada como instrumento de poder.", "políticos constroem cisternas.", "não há mais carros-pipa no semiárido."], 1, "Reduzir a dependência importa porque o acesso à água era controlado por terceiros."),
      q("TESE", "A mudança de “combate” para “convivência” significa que:", ["o clima do semiárido mudou.", "deixou-se de investir na região.", "se passou a tratar a seca como condição a administrar, não como inimigo.", "as grandes obras foram proibidas."], 2, "O texto opõe clima como inimigo a formas de viver com ele."),
      q("EXTRAPOLAÇÃO", "Qual afirmação vai além do texto?", ["Cisternas guardam água da chuva.", "Cisternas não atendem à produção em larga escala.", "As cisternas acabaram com a pobreza no semiárido.", "Críticos questionam o alcance das cisternas."], 2, "O texto não afirma nada sobre o fim da pobreza."),
    ],
  },
];

export const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** Questões do protótipo original, agora como conteúdo comum. */
export const ENERGY_ITEMS = [
  {
    externalId: "ritmo-energia-01", source: "authored", area: "CN", discipline: "Física", topic: "Eletricidade", skill: "H21", competency: "C6",
    contextHtml: "<p>Em uma casa em Macapá, o chuveiro elétrico tem potência de 5 500 W e é usado, em média, 10 minutos por dia. A concessionária de energia cobra R$ 0,80 por quilowatt-hora (kWh) consumido.</p>",
    stemHtml: "<p>Considerando um mês de 30 dias, qual é o custo mensal do uso desse chuveiro?</p>",
    alternatives: [
      { letter: "A", html: "R$ 0,73", trap: "Calculou um único dia e esqueceu os 30 dias do mês." },
      { letter: "B", html: "R$ 13,20", trap: "Converteu 10 minutos como 0,1 hora. O correto é 1/6 h." },
      { letter: "C", html: "R$ 22,00" },
      { letter: "D", html: "R$ 132,00", trap: "Usou 1 hora por banho em vez de 10 minutos." },
      { letter: "E", html: "R$ 22.000,00", trap: "Não converteu watt para quilowatt." },
    ],
    answer: "C", solutionHtml: "<p>E = 5,5 kW × (1/6 h) × 30 = 27,5 kWh. Custo = 27,5 × 0,80 = R$ 22,00.</p>",
    hint: "A conta de luz cobra por kWh. Em que unidades estão a potência e o tempo no enunciado?",
    prerequisites: ["conversao_unidades", "equacao_1grau"], rightsCleared: true, rightsNote: "Material autoral do projeto.",
  },
  {
    externalId: "ritmo-energia-02", source: "authored", area: "CN", discipline: "Física", topic: "Eletricidade", skill: "H21", competency: "C6",
    contextHtml: "<p>Uma escola instalou em cada sala um ar-condicionado de 1 200 W, que fica ligado 4 horas por dia letivo. A tarifa de energia da região é de R$ 0,90 por kWh.</p>",
    stemHtml: "<p>Em um período de 30 dias de uso, qual é o custo de energia de um desses aparelhos?</p>",
    alternatives: [
      { letter: "A", html: "R$ 32,40", trap: "Usou 1 hora por dia em vez de 4 horas." },
      { letter: "B", html: "R$ 129,60" },
      { letter: "C", html: "R$ 4,32", trap: "Calculou um único dia e esqueceu os 30 dias." },
      { letter: "D", html: "R$ 129.600,00", trap: "Não converteu watt para quilowatt." },
      { letter: "E", html: "R$ 144,00", trap: "Parou no consumo em kWh e esqueceu de aplicar a tarifa." },
    ],
    answer: "B", solutionHtml: "<p>E = 1,2 kW × 4 h × 30 = 144 kWh. Custo = 144 × 0,90 = R$ 129,60.</p>",
    hint: "Primeiro descubra a energia em kWh de um dia. Depois pense no mês e, por último, no preço.",
    prerequisites: ["conversao_unidades", "equacao_1grau"], rightsCleared: true, rightsNote: "Material autoral do projeto.",
  },
];
