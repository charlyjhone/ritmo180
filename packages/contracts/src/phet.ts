// Simulações PhET (Universidade do Colorado), gratuitas, em português, abertas no site do PhET.
// Vêm do catálogo em pesquisa-phet/catalogo-phet.csv: entram só as de prioridade alta e média para o ENEM,
// uma por conceito (as versões "Básico" ficam de fora quando há a completa).
// Mesmo formato do Laboratório (assuntos do banco + palavras-chave sem acento), para o mesmo motor ligar questão e simulação.

export interface PhetSim {
  id: string;
  title: string;
  disciplines: readonly string[];
  topics: readonly string[];
  keywords: readonly string[];
}

export const PHET_SIMS: readonly PhetSim[] = [
  // Física: mecânica
  { id: "projectile-motion", title: "Movimento de Projétil", disciplines: ["Física"], topics: [], keywords: ["lancamento obliquo", "lancamento horizontal", "projetil", "alcance horizontal"] },
  { id: "vector-addition", title: "Adição de Vetores", disciplines: ["Física"], topics: [], keywords: ["\\bvetor", "vetores", "resultante", "componentes? (horizontal|vertical)"] },
  { id: "forces-and-motion-basics", title: "Forças e Movimento", disciplines: ["Física"], topics: ["Dinâmica", "Mecânica"], keywords: ["leis? de newton", "inercia", "forca resultante", "forca de atrito"] },
  { id: "friction", title: "Atrito", disciplines: ["Física"], topics: [], keywords: ["\\batrito"] },
  { id: "balancing-act", title: "Balançando (torque e alavancas)", disciplines: ["Física"], topics: [], keywords: ["alavanca", "torque", "momento de uma forca", "gangorra", "equilibrio de (um )?corpo extenso"] },
  { id: "energy-skate-park", title: "Energia na Pista de Skate", disciplines: ["Física"], topics: ["Trabalho e Energia"], keywords: ["energia mecanica", "energia cinetica", "energia potencial gravitacional", "montanha-russa", "conservacao da energia"] },
  { id: "energy-forms-and-changes", title: "Formas de Energia e Transformações", disciplines: ["Física", "Química"], topics: ["Termologia"], keywords: ["transformac(ao|oes) de energia", "conversao de energia", "usina", "rendimento", "painel solar", "energia termica"] },
  { id: "collision-lab", title: "Laboratório de Colisões", disciplines: ["Física"], topics: ["Impulso e Quantidade de Movimento"], keywords: ["colisao", "colidem", "quantidade de movimento", "\\bimpulso\\b"] },
  { id: "hookes-law", title: "Lei de Hooke", disciplines: ["Física"], topics: [], keywords: ["lei de hooke", "constante elastica", "\\bmolas?\\b", "deformacao da mola"] },
  { id: "masses-and-springs", title: "Massas e Molas", disciplines: ["Física"], topics: [], keywords: ["massa-mola", "oscilador", "movimento harmonico", "\\bmhs\\b"] },
  { id: "pendulum-lab", title: "Laboratório do Pêndulo", disciplines: ["Física"], topics: [], keywords: ["pendulo"] },
  { id: "gravity-and-orbits", title: "Gravidade e Órbitas", disciplines: ["Física"], topics: ["Gravitação"], keywords: ["\\borbita", "satelite", "gravitacao universal", "atracao gravitacional"] },
  { id: "keplers-laws", title: "Leis de Kepler", disciplines: ["Física"], topics: ["Gravitação"], keywords: ["kepler", "elipse", "periodo orbital"] },
  { id: "under-pressure", title: "Sob Pressão", disciplines: ["Física"], topics: ["Hidrostática"], keywords: ["pressao hidrostatica", "stevin", "pressao atmosferica", "vasos comunicantes", "prensa hidraulica", "pascal"] },
  { id: "buoyancy", title: "Flutuabilidade", disciplines: ["Física"], topics: ["Hidrostática"], keywords: ["empuxo", "arquimedes", "\\bflutua", "afunda"] },
  { id: "density", title: "Densidade", disciplines: ["Física", "Química"], topics: [], keywords: ["densidade", "massa especifica"] },
  // Física: termologia
  { id: "gas-properties", title: "Propriedades dos Gases", disciplines: ["Física", "Química"], topics: [], keywords: ["gas ideal", "gases ideais", "gas perfeito", "isotermica", "isobarica", "isocorica", "clapeyron", "teoria cinetica"] },
  { id: "states-of-matter", title: "Estados da Matéria", disciplines: ["Química", "Física"], topics: [], keywords: ["mudancas? de (fase|estado)", "estados? fisicos?", "fusao", "ebulicao", "solidificacao", "sublimacao", "vaporizacao"] },
  // Física: eletricidade e magnetismo
  { id: "balloons-and-static-electricity", title: "Balões e Eletricidade Estática", disciplines: ["Física"], topics: ["Eletroestática"], keywords: ["eletrizacao", "eletrizad", "atrito entre", "inducao eletrostatica"] },
  { id: "coulombs-law", title: "Lei de Coulomb", disciplines: ["Física"], topics: ["Eletroestática"], keywords: ["coulomb", "forca eletrica", "cargas? eletricas?"] },
  { id: "charges-and-fields", title: "Cargas e Campos", disciplines: ["Física"], topics: ["Eletroestática", "Eletricidade"], keywords: ["campo eletrico", "potencial eletrico", "linhas de campo", "diferenca de potencial"] },
  { id: "capacitor-lab-basics", title: "Laboratório do Capacitor", disciplines: ["Física"], topics: [], keywords: ["capacitor", "capacitancia"] },
  { id: "circuit-construction-kit-dc", title: "Kit para Montar Circuito", disciplines: ["Física"], topics: ["Eletrodinâmica", "Eletricidade"], keywords: ["circuito eletrico", "associacao em (serie|paralelo)", "resistor", "amperimetro", "voltimetro", "curto-circuito"] },
  { id: "ohms-law", title: "Lei de Ohm", disciplines: ["Física"], topics: ["Eletrodinâmica"], keywords: ["lei de ohm", "resistencia eletrica", "corrente eletrica", "tensao eletrica"] },
  { id: "resistance-in-a-wire", title: "Resistência em um Fio", disciplines: ["Física"], topics: [], keywords: ["resistividade", "segunda lei de ohm", "2a lei de ohm", "comprimento do fio", "espessura do fio", "area de secao"] },
  { id: "magnets-and-electromagnets", title: "Ímãs e Eletroímãs", disciplines: ["Física"], topics: ["Eletromagnetismo"], keywords: ["\\bima\\b", "\\bimas\\b", "eletroima", "campo magnetico", "bussola"] },
  { id: "faradays-law", title: "Lei de Faraday", disciplines: ["Física"], topics: ["Eletromagnetismo"], keywords: ["inducao eletromagnetica", "corrente induzida", "faraday", "\\blenz\\b", "fluxo magnetico"] },
  { id: "generator", title: "Gerador", disciplines: ["Física"], topics: [], keywords: ["gerador", "dinamo", "turbina", "hidreletrica", "transformador"] },
  // Física: ondas, óptica e física moderna
  { id: "waves-intro", title: "Ondas: Introdução", disciplines: ["Física"], topics: ["Ondulatória", "Ondas e Óptica"], keywords: ["\\bondas?\\b", "\\bsom\\b", "frequencia", "amplitude", "periodo da onda"] },
  { id: "wave-on-a-string", title: "Onda em Corda", disciplines: ["Física"], topics: ["Ondulatória"], keywords: ["\\bcorda", "onda estacionaria", "ondas estacionarias", "harmonico", "comprimento de onda"] },
  { id: "wave-interference", title: "Interferência de Onda", disciplines: ["Física"], topics: ["Ondulatória"], keywords: ["interferencia", "difracao", "fenda dupla", "ressonancia"] },
  { id: "bending-light", title: "Desvio da Luz", disciplines: ["Física"], topics: ["Óptica Geométrica", "Ondas e Óptica"], keywords: ["refracao", "refrata", "indice de refracao", "snell", "reflexao total", "fibra optica", "dispersao da luz", "prisma"] },
  { id: "geometric-optics", title: "Óptica Geométrica", disciplines: ["Física"], topics: ["Óptica Geométrica"], keywords: ["\\blentes?\\b", "espelho", "miopia", "hipermetropia", "\\blupa\\b", "imagem (real|virtual)", "foco"] },
  { id: "color-vision", title: "Visão Colorida", disciplines: ["Física", "Biologia"], topics: [], keywords: ["\\bcores?\\b", "filtro de luz", "luz branca", "cones da retina"] },
  { id: "blackbody-spectrum", title: "Espectro de Corpo Negro", disciplines: ["Física"], topics: ["Física Moderna"], keywords: ["corpo negro", "radiacao termica", "infravermelho", "temperatura da estrela"] },
  { id: "quantum-wave-interference", title: "Interferência Quântica", disciplines: ["Física"], topics: ["Física Moderna"], keywords: ["dualidade onda-particula", "foton", "efeito fotoeletrico", "eletrons? como onda"] },
  // Química
  { id: "build-an-atom", title: "Monte um Átomo", disciplines: ["Química"], topics: ["Atomística", "Tabela Periódica"], keywords: ["numero atomico", "numero de massa", "protons", "neutrons", "eletrons", "\\bions?\\b"] },
  { id: "isotopes-and-atomic-mass", title: "Isótopos e Massa Atômica", disciplines: ["Química"], topics: ["Atomística"], keywords: ["isotopo", "massa atomica"] },
  { id: "models-of-the-hydrogen-atom", title: "Modelos do Átomo de Hidrogênio", disciplines: ["Química", "Física"], topics: ["Atomística"], keywords: ["modelo atomico", "\\bbohr\\b", "niveis de energia", "salto quantico", "espectro de emissao"] },
  { id: "rutherford-scattering", title: "Espalhamento de Rutherford", disciplines: ["Química", "Física"], topics: ["Atomística"], keywords: ["rutherford", "particulas alfa", "folha de ouro"] },
  { id: "alpha-decay", title: "Decaimento Alfa", disciplines: ["Química", "Física"], topics: ["Radioatividade", "Física Moderna"], keywords: ["radioativ", "meia-vida", "decaimento", "particula alfa", "emissao alfa"] },
  { id: "beta-decay", title: "Decaimento Beta", disciplines: ["Química", "Física"], topics: ["Radioatividade"], keywords: ["decaimento beta", "emissao beta", "particula beta"] },
  { id: "build-a-nucleus", title: "Monte um Núcleo", disciplines: ["Química", "Física"], topics: ["Radioatividade"], keywords: ["nucleo atomico", "fissao", "fusao nuclear", "estabilidade nuclear"] },
  { id: "molecule-shapes", title: "Geometria Molecular", disciplines: ["Química"], topics: ["Ligações Químicas"], keywords: ["geometria molecular", "piramidal", "tetraedric", "angular", "trigonal plana", "linear"] },
  { id: "molecule-polarity", title: "Polaridade da Molécula", disciplines: ["Química"], topics: ["Ligações Químicas"], keywords: ["polaridade", "molecula polar", "apolar", "eletronegatividade", "momento dipolar"] },
  { id: "atomic-interactions", title: "Interações Atômicas", disciplines: ["Química"], topics: [], keywords: ["forcas? intermoleculares?", "ligacao de hidrogenio", "ligacoes de hidrogenio", "dipolo"] },
  { id: "build-a-molecule", title: "Monte uma Molécula", disciplines: ["Química"], topics: ["Química Orgânica"], keywords: ["formula molecular", "formula estrutural"] },
  { id: "balancing-chemical-equations", title: "Balanceamento de Equações Químicas", disciplines: ["Química"], topics: ["Estequiometria"], keywords: ["balance", "coeficientes estequiometricos", "equacao quimica"] },
  { id: "reactants-products-and-leftovers", title: "Reagentes, Produtos e Excesso", disciplines: ["Química"], topics: ["Estequiometria"], keywords: ["reagente limitante", "reagente em excesso", "rendimento da reacao"] },
  { id: "concentration", title: "Concentração", disciplines: ["Química"], topics: ["Soluções"], keywords: ["concentracao", "solubilidade", "solucao saturada", "soluto", "diluicao"] },
  { id: "molarity", title: "Molaridade", disciplines: ["Química"], topics: ["Soluções"], keywords: ["molaridade", "mol/l", "concentracao molar", "concentracao em quantidade de materia"] },
  { id: "beers-law-lab", title: "Laboratório da Lei de Beer", disciplines: ["Química"], topics: [], keywords: ["absorbancia", "lei de beer", "espectrofotometr"] },
  { id: "ph-scale", title: "Escala de pH", disciplines: ["Química"], topics: [], keywords: ["\\bph\\b", "\\bpoh\\b", "acidez", "basicidade", "\\bacid", "alcalin"] },
  { id: "acid-base-solutions", title: "Soluções Ácido-Base", disciplines: ["Química"], topics: [], keywords: ["acido forte", "acido fraco", "base forte", "base fraca", "ionizacao", "dissociacao"] },
  { id: "diffusion", title: "Difusão", disciplines: ["Química", "Biologia"], topics: [], keywords: ["difusao"] },
  { id: "molecules-and-light", title: "Moléculas e Luz", disciplines: ["Química"], topics: ["Química Ambiental"], keywords: ["camada de ozonio", "radiacao ultravioleta", "absorcao de radiacao"] },
  { id: "greenhouse-effect", title: "Efeito Estufa", disciplines: ["Química", "Física", "Biologia"], topics: ["Química Ambiental"], keywords: ["efeito estufa", "aquecimento global", "gases? (de )?efeito estufa", "albedo"] },
  // Biologia
  { id: "gene-expression-essentials", title: "Fundamentos da Expressão Gênica", disciplines: ["Biologia"], topics: ["Biotecnologia e Engenharia Genética", "Citologia/Bioquímica"], keywords: ["\\bdna\\b", "\\brna\\b", "transcricao", "traducao", "sintese (de )?proteic", "sintese de proteinas", "ribossomo", "codon"] },
  { id: "membrane-transport", title: "Transporte Celular", disciplines: ["Biologia"], topics: ["Citologia/Bioquímica"], keywords: ["membrana plasmatica", "osmose", "transporte ativo", "transporte passivo", "bomba de sodio"] },
  { id: "natural-selection", title: "Seleção Natural", disciplines: ["Biologia"], topics: ["Evolução"], keywords: ["selecao natural", "darwin", "adaptacao", "mutacao"] },
  { id: "neuron", title: "Neurônio", disciplines: ["Biologia"], topics: ["Sistema Nervoso"], keywords: ["neuronio", "impulso nervoso", "sinapse", "potencial de acao"] },
  // Matemática
  { id: "graphing-lines", title: "Traçando Retas", disciplines: ["Matemática"], topics: ["Função Afim", "Geometria Analítica"], keywords: ["funcao afim", "coeficiente angular", "equacao da reta", "funcao do 1o grau", "taxa de variacao"] },
  { id: "graphing-quadratics", title: "Gráfico de Quadráticas", disciplines: ["Matemática"], topics: ["Função Quadrática"], keywords: ["funcao quadratica", "\\bparabola", "vertice", "funcao do 2o grau", "raizes"] },
  { id: "function-builder", title: "Gerador de Funções", disciplines: ["Matemática"], topics: [], keywords: ["\\bfuncao\\b", "lei de formacao"] },
  { id: "equality-explorer", title: "Explorador da Igualdade", disciplines: ["Matemática"], topics: ["Álgebra e Aritmética"], keywords: ["equacao do 1o grau", "equacao do primeiro grau", "incognita"] },
  { id: "equality-explorer-two-variables", title: "Explorador da Igualdade: Duas Variáveis", disciplines: ["Matemática"], topics: [], keywords: ["sistema linear", "sistema de equacoes", "duas equacoes"] },
  { id: "area-model-algebra", title: "Modelo de Área: Álgebra", disciplines: ["Matemática"], topics: [], keywords: ["produtos? notave", "fatora"] },
  { id: "ratio-and-proportion", title: "Razão e Proporção", disciplines: ["Matemática"], topics: ["Razão e Proporção"], keywords: ["\\brazao\\b", "proporcao", "proporcional", "regra de tres", "escala"] },
  { id: "unit-rates", title: "Taxas Unitárias", disciplines: ["Matemática"], topics: ["Razão e Proporção", "Porcentagem"], keywords: ["preco por", "custo por", "por unidade", "taxa unitaria", "grandezas (diretamente|inversamente)"] },
  { id: "area-builder", title: "Construtor de Área", disciplines: ["Matemática"], topics: ["Geometria Plana"], keywords: ["\\barea\\b", "perimetro"] },
  { id: "quadrilateral", title: "Quadrilátero", disciplines: ["Matemática"], topics: ["Geometria Plana"], keywords: ["quadrilatero", "paralelogramo", "trapezio", "losango"] },
  { id: "trig-tour", title: "Tour Trigonométrico", disciplines: ["Matemática"], topics: ["Trigonometria"], keywords: ["\\bseno\\b", "cosseno", "tangente", "ciclo trigonometrico", "radiano"] },
  { id: "center-and-variability", title: "Centro e Variabilidade", disciplines: ["Matemática"], topics: ["Estatística"], keywords: ["\\bmediana\\b", "\\bmoda\\b", "desvio padrao", "variancia", "dispersao"] },
  { id: "mean-share-and-balance", title: "Média: Distribuição e Equilíbrio", disciplines: ["Matemática"], topics: ["Estatística"], keywords: ["\\bmedia\\b", "media aritmetica"] },
  { id: "least-squares-regression", title: "Regressão por Quadrados Mínimos", disciplines: ["Matemática"], topics: [], keywords: ["regressao", "correlacao", "linha de tendencia"] },
  { id: "plinko-probability", title: "Probabilidade Plinko", disciplines: ["Matemática"], topics: ["Probabilidade"], keywords: ["probabilidade", "distribuicao binomial", "chance de"] },
];

export const phetUrl = (id: string) => `https://phet.colorado.edu/sims/html/${id}/latest/${id}_pt_BR.html`;
export const phetSim = (id: string) => PHET_SIMS.find((s) => s.id === id);
