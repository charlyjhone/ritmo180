// Mapa de pré-requisitos entre os assuntos do banco de questões do ENEM.
// Cada assunto aponta para as bases que ele usa e o porquê, em linguagem de aluno.
// Os nomes são os mesmos da tabela topics; um vínculo para assunto sem questões publicadas é ignorado.

export interface TopicRef {
  discipline: string;
  topic: string;
}

export interface PrerequisiteLink extends TopicRef {
  why: string;
}

type Links = Record<string, Record<string, [discipline: string, topic: string, why: string][]>>;

const MT = "Matemática";
const RAZAO: [string, string, string] = [MT, "Razão e Proporção", "Boa parte das contas é regra de três e grandeza proporcional."];
const ALGEBRA: [string, string, string] = [MT, "Álgebra e Aritmética", "Você vai isolar incógnitas e operar com potências de 10."];

const LINKS: Links = {
  Física: {
    Cinemática: [RAZAO, [MT, "Função Afim", "Posição em função do tempo no movimento uniforme é uma função afim."]],
    Dinâmica: [["Física", "Cinemática", "Força muda a velocidade: é preciso entender aceleração."], ALGEBRA],
    "Trabalho e Energia": [["Física", "Dinâmica", "Trabalho é força vezes deslocamento."], ALGEBRA],
    "Impulso e Quantidade de Movimento": [["Física", "Dinâmica", "Impulso é força aplicada durante um tempo."]],
    Hidrostática: [RAZAO, [MT, "Geometria Espacial", "Empuxo e densidade pedem o volume dos sólidos."]],
    Gravitação: [["Física", "Dinâmica", "A força gravitacional entra nas leis de Newton."], RAZAO],
    Termologia: [RAZAO, [MT, "Porcentagem", "Rendimento de máquinas e variações aparecem em porcentagem."], [MT, "Função Afim", "Escalas termométricas e dilatação são relações lineares."]],
    Ondulatória: [RAZAO],
    "Óptica Geométrica": [[MT, "Geometria Plana", "Ângulos e semelhança de triângulos explicam reflexão e imagens."]],
    "Ondas e Óptica": [["Física", "Ondulatória", "Luz e som são ondas."], ["Física", "Óptica Geométrica", "Espelhos e lentes usam os raios de luz."]],
    Eletrodinâmica: [RAZAO, ALGEBRA],
    Eletricidade: [RAZAO, ALGEBRA],
    Eletroestática: [RAZAO, ALGEBRA],
    Eletromagnetismo: [["Física", "Eletrodinâmica", "Campo magnético nasce da corrente elétrica."]],
    Mecânica: [["Física", "Cinemática", "Descreve o movimento antes de explicar a causa."], ["Física", "Dinâmica", "As leis de Newton são a base da mecânica."]],
    "Física Moderna": [["Física", "Ondulatória", "Fótons têm frequência e comprimento de onda."], ["Física", "Trabalho e Energia", "Efeito fotoelétrico é conservação de energia."]],
  },
  Química: {
    Estequiometria: [RAZAO, ALGEBRA],
    Soluções: [RAZAO, [MT, "Porcentagem", "Título e concentração aparecem em porcentagem."], ["Química", "Estequiometria", "Concentração em mol/L usa a ideia de mol."]],
    Termoquímica: [["Química", "Estequiometria", "A energia é proporcional à quantidade de reagente."], ALGEBRA],
    Eletroquímica: [["Química", "Química Inorgânica", "Pilhas dependem de número de oxidação."], ["Química", "Estequiometria", "Massa depositada na eletrólise é cálculo estequiométrico."]],
    "Cinética Química": [RAZAO, [MT, "Estatística", "Velocidade de reação costuma vir em tabela ou gráfico."]],
    "Propriedades Coligativas": [["Química", "Soluções", "O efeito depende da concentração de soluto."]],
    Radioatividade: [[MT, "Função Exponencial", "Meia-vida é decaimento exponencial."], ["Química", "Atomística", "Prótons e nêutrons mudam no decaimento."]],
    "Ligações Químicas": [["Química", "Tabela Periódica", "A posição na tabela indica como o átomo se liga."], ["Química", "Atomística", "Elétrons de valência definem a ligação."]],
    "Química Orgânica": [["Química", "Ligações Químicas", "Cadeias de carbono são ligações covalentes."]],
    "Química Inorgânica": [["Química", "Ligações Químicas", "Ácidos, bases e sais dependem do tipo de ligação."]],
    "Química Ambiental": [["Química", "Química Inorgânica", "Chuva ácida e poluentes são reações inorgânicas."]],
  },
  Biologia: {
    Genética: [[MT, "Probabilidade", "Cruzamentos são cálculos de probabilidade."], ["Biologia", "Citologia/Bioquímica", "Genes ficam no DNA, dentro da célula."]],
    Evolução: [["Biologia", "Genética", "Seleção natural age sobre a variação genética."]],
    "Biotecnologia e Engenharia Genética": [["Biologia", "Genética", "Transgênicos e clonagem mexem com genes."], ["Biologia", "Citologia/Bioquímica", "DNA, RNA e proteínas são a matéria-prima."]],
    Ecologia: [[MT, "Estatística", "Populações e cadeias aparecem em gráficos e tabelas."], ["Biologia", "Citologia/Bioquímica", "Fotossíntese e respiração movem a energia no ecossistema."]],
    Botânica: [["Biologia", "Citologia/Bioquímica", "Fotossíntese acontece no cloroplasto."]],
    Vírus: [["Biologia", "Citologia/Bioquímica", "Vírus usa a maquinaria da célula para se replicar."]],
    "Sistema Imunológico": [["Biologia", "Citologia/Bioquímica", "Anticorpos são proteínas produzidas por células."]],
    Doenças: [["Biologia", "Vírus", "Muitas doenças cobradas no ENEM são virais."], ["Biologia", "Sistema Imunológico", "Vacina e soro dependem da resposta imune."]],
    "Sistema Digestório": [["Biologia", "Citologia/Bioquímica", "Digestão é ação de enzimas."]],
    "Sistema Endócrino": [["Biologia", "Citologia/Bioquímica", "Hormônios agem sobre receptores das células."]],
    "Sistema Circulatório": [["Biologia", "Citologia/Bioquímica", "O sangue leva às células o oxigênio e os nutrientes que elas usam."]],
    "Sistema Respiratório": [["Biologia", "Citologia/Bioquímica", "A respiração celular usa o oxigênio que o pulmão capta."]],
    "Sistema Nervoso": [["Biologia", "Citologia/Bioquímica", "O impulso nervoso depende da membrana do neurônio."]],
    Embriologia: [["Biologia", "Citologia/Bioquímica", "O embrião se forma por divisão celular."]],
  },
  Matemática: {
    "Razão e Proporção": [ALGEBRA],
    Porcentagem: [[MT, "Razão e Proporção", "Porcentagem é uma razão de denominador 100."]],
    "Matemática Financeira": [[MT, "Porcentagem", "Juros e descontos são porcentagens."], [MT, "Função Exponencial", "Juros compostos crescem de forma exponencial."]],
    "Função Afim": [ALGEBRA],
    "Função Quadrática": [[MT, "Função Afim", "Comece pelas funções do 1º grau e seus gráficos."]],
    "Função Exponencial": [ALGEBRA],
    Logaritmo: [[MT, "Função Exponencial", "Logaritmo é a operação inversa da exponencial."]],
    Estatística: [[MT, "Porcentagem", "Gráficos e tabelas do ENEM usam muito porcentagem."], ALGEBRA],
    Probabilidade: [[MT, "Análise Combinatória", "Contar os casos possíveis vem antes da probabilidade."], RAZAO],
    "Análise Combinatória": [ALGEBRA],
    "Geometria Espacial": [[MT, "Geometria Plana", "Volume e área dos sólidos partem das figuras planas."]],
    "Geometria Analítica": [[MT, "Função Afim", "A reta no plano cartesiano é uma função afim."], [MT, "Geometria Plana", "Distâncias e áreas vêm da geometria plana."]],
    Trigonometria: [[MT, "Geometria Plana", "Seno e cosseno nascem do triângulo retângulo."]],
    "P.A. e P.G.": [ALGEBRA],
    Matrizes: [ALGEBRA],
  },
  Geografia: {
    Cartografia: [[MT, "Razão e Proporção", "Escala de mapa é uma razão."]],
    Clima: [[MT, "Estatística", "Climogramas são gráficos de temperatura e chuva."]],
    "Brasil: demografia, economia e sociedade": [[MT, "Estatística", "Taxas, pirâmides etárias e tabelas aparecem o tempo todo."]],
    "Vegetação/biomas": [["Geografia", "Clima", "O clima define o tipo de vegetação."], ["Geografia", "Solo e Relevo", "Solo e relevo influenciam cada bioma."]],
    Hidrografia: [["Geografia", "Clima", "O regime dos rios depende das chuvas."]],
    "Impactos Ambientais": [["Geografia", "Vegetação/biomas", "Desmatamento e queimadas afetam os biomas."]],
  },
  História: {
    "Período Colonial": [["História", "Expansão Marítima e Comercial", "A colonização começa com as navegações."]],
    "Primeiro Reinado": [["História", "Período Colonial", "A independência encerra o período colonial."]],
    "Período Regencial": [["História", "Primeiro Reinado", "As regências vêm da abdicação de D. Pedro I."]],
    "Segundo Reinado": [["História", "Período Regencial", "O golpe da maioridade encerra as regências."]],
    "Primeira República": [["História", "Segundo Reinado", "A república nasce da crise do Império."]],
    "Era Vargas": [["História", "Primeira República", "A Revolução de 1930 derruba a Primeira República."]],
    "República Democrática (1945-1964)": [["História", "Era Vargas", "O período começa com a queda do Estado Novo."]],
    "Governo dos Militares (1964-1985)": [["História", "República Democrática (1945-1964)", "O golpe de 1964 encerra a república democrática."], ["História", "Guerra Fria", "O contexto internacional explica o golpe."]],
    "Nova República (1985-atualidade)": [["História", "Governo dos Militares (1964-1985)", "A redemocratização sai do fim da ditadura."]],
    "Guerra Fria": [["História", "Primeira e Segunda Guerra Mundial", "O mundo bipolar sai do fim da Segunda Guerra."]],
    "Revolução Francesa": [["História", "Iluminismo", "As ideias iluministas inspiraram a revolução."], ["História", "Absolutismo", "A revolução derruba o Antigo Regime absolutista."]],
    Iluminismo: [["História", "Renascimento", "A valorização da razão começa no Renascimento."]],
  },
  Filosofia: {
    "Filosofia Medieval": [["Filosofia", "Filosofia Antiga", "Os medievais releram Platão e Aristóteles."]],
    "Filosofia Moderna": [["Filosofia", "Filosofia Antiga", "Os modernos discutem com os gregos."]],
    "Filosofia Contemporânea": [["Filosofia", "Filosofia Moderna", "A filosofia contemporânea responde a Descartes e Kant."]],
  },
  Sociologia: {
    "Movimentos Sociais": [["Sociologia", "Poder, Política e Estado", "Movimentos sociais disputam direitos com o Estado."]],
  },
  Português: {
    "Gêneros textuais": [["Português", "Leitura e Interpretação de Texto", "Reconhecer o gênero começa por ler bem o texto."]],
    "Função da Linguagem": [["Português", "Leitura e Interpretação de Texto", "A função aparece na intenção do texto."]],
    "Variação Linguística": [["Português", "Leitura e Interpretação de Texto", "A variação é percebida no contexto do texto."]],
  },
  Literatura: {
    Romantismo: [["Literatura", "Arcadismo/neoclassicismo", "O Romantismo reage ao Arcadismo."]],
    "Realismo/naturalismo": [["Literatura", "Romantismo", "O Realismo critica o Romantismo."]],
    "Pré-modernismo": [["Literatura", "Realismo/naturalismo", "Os pré-modernistas herdam a crítica social do Realismo."]],
    Modernismo: [["Literatura", "Pré-modernismo", "O Pré-modernismo prepara a ruptura de 1922."], ["Português", "Leitura e Interpretação de Texto", "As questões de Modernismo cobram leitura atenta do poema."]],
    "Literatura Contemporânea": [["Literatura", "Modernismo", "A literatura atual dialoga com os modernistas."]],
  },
};

export function prerequisitesOf(discipline: string, topic: string): PrerequisiteLink[] {
  return (LINKS[discipline]?.[topic] ?? []).map(([d, t, why]) => ({ discipline: d, topic: t, why }));
}

/** Todos os vínculos, para conferir o mapa contra os assuntos do banco. */
export function allPrerequisiteLinks(): (TopicRef & { requires: PrerequisiteLink[] })[] {
  return Object.entries(LINKS).flatMap(([discipline, topics]) => Object.keys(topics).map((topic) => ({ discipline, topic, requires: prerequisitesOf(discipline, topic) })));
}
