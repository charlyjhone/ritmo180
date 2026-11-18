import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export type Area = 'Física' | 'Química' | 'Biologia' | 'Matemática';

export interface ModuleInfo {
  id: string;
  title: string;
  area: Area;
  bloco: string;
  tema: string;
  resumo: string;
  icon: string; // caminho SVG (viewBox 0 0 24 24)
  component?: LazyExoticComponent<ComponentType>;
  fase: number;
}

const L = (f: () => Promise<{ default: ComponentType }>) => lazy(f);

export const MODULES: ModuleInfo[] = [
  { id: 'muv', title: 'Movimento Uniformemente Variado', area: 'Física', bloco: 'Mecânica', tema: 'MUV, gráficos s×t e v×t, Torricelli', resumo: 'Carro com posição, velocidade e aceleração iniciais; marcas estroboscópicas e três gráficos ao vivo.', icon: 'M3 17h18M6 17l2-5h8l2 5M8 12l1-3h6l1 3', component: L(() => import('./muv/MuvModule')), fase: 1 },
  { id: 'newton', title: 'Leis de Newton e Atrito', area: 'Física', bloco: 'Mecânica', tema: 'Plano inclinado, atrito estático e cinético', resumo: 'Bloco num plano inclinado com força aplicada, diagrama de corpo livre e transição estático → cinético.', icon: 'M3 20L21 8M10 15l3-4 4 3-3 4z', component: L(() => import('./newton/NewtonModule')), fase: 1 },
  { id: 'projetil', title: 'Lançamento Oblíquo', area: 'Física', bloco: 'Mecânica', tema: 'Alcance, altura máxima, resistência do ar', resumo: 'Canhão com v₀, θ, g e arrasto; comparação de trajetórias e verificação de R e H.', icon: 'M3 20c4-12 14-12 18 0M12 9.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3', component: L(() => import('./projetil/ProjetilModule')), fase: 0 },
  { id: 'energia', title: 'Conservação da Energia', area: 'Física', bloco: 'Mecânica', tema: 'Energia cinética, potencial e térmica', resumo: 'Corpo deslizando numa pista com atrito ajustável e barras de energia em tempo real.', icon: 'M3 6c3 0 4 12 9 12s6-12 9-12', component: L(() => import('./energia/EnergiaModule')), fase: 1 },
  { id: 'pendulo', title: 'Pêndulo Simples', area: 'Física', bloco: 'Mecânica', tema: 'MHS, período, grandes amplitudes', resumo: 'Equação não linear integrada por RK4; período medido contra 2π√(L/g) e a solução exata.', icon: 'M12 3v0M12 3l5 13M17 16a2 2 0 100 .1', component: L(() => import('./pendulo/PenduloModule')), fase: 1 },
  { id: 'mola', title: 'Sistema Massa-Mola', area: 'Física', bloco: 'Mecânica', tema: 'Lei de Hooke, MHS, amortecimento', resumo: 'Mola vertical com constante k, massa e amortecimento; período e energia elástica.', icon: 'M12 2v3l-4 2 8 2-8 2 8 2-8 2 4 2v2M9 19h6v3H9z', component: L(() => import('./mola/MolaModule')), fase: 1 },
  { id: 'colisoes', title: 'Colisões', area: 'Física', bloco: 'Mecânica', tema: 'Quantidade de movimento, coeficiente de restituição', resumo: 'Dois carrinhos em trilho sem atrito; conservação do momento e perda de energia cinética.', icon: 'M2 14h8v4H2zM14 14h8v4h-8zM10 16h4', component: L(() => import('./colisoes/ColisoesModule')), fase: 1 },
  { id: 'empuxo', title: 'Hidrostática e Empuxo', area: 'Física', bloco: 'Mecânica', tema: 'Arquimedes, Stevin, densidade', resumo: 'Bloco em recipiente com fluido escolhido; empuxo, peso aparente e pressão em profundidade.', icon: 'M3 10h18v11H3zM9 6h6v8H9z', component: L(() => import('./empuxo/EmpuxoModule')), fase: 1 },
  { id: 'orbitas', title: 'Gravitação e Leis de Kepler', area: 'Física', bloco: 'Mecânica', tema: 'Órbitas, áreas iguais, T² ∝ a³', resumo: 'Planeta em torno de uma estrela com áreas varridas em tempos iguais e período medido.', icon: 'M12 12m-2 0a2 2 0 104 0 2 2 0 10-4 0M3 12a9 5 0 1018 0 9 5 0 10-18 0', component: L(() => import('./orbitas/OrbitasModule')), fase: 1 },
  // Próximas fases
  { id: 'circuitos', title: 'Circuitos Elétricos', area: 'Física', bloco: 'Eletricidade', tema: 'Ohm, associação de resistores, potência, RC', resumo: 'Série, paralelo e misto resolvidos por análise nodal; capacitor carregando e consumo em kWh.', icon: 'M4 12h4l2-4 4 8 2-4h4', component: L(() => import('./circuitos/CircuitosModule')), fase: 2 },
  { id: 'inducao', title: 'Indução Eletromagnética', area: 'Física', bloco: 'Eletricidade', tema: 'Lei de Faraday, Lenz, geradores', resumo: 'Espira girando num campo e ímã atravessando bobina; fem medida como −ΔΦ/Δt.', icon: 'M4 12a8 8 0 0116 0', component: L(() => import('./inducao/InducaoModule')), fase: 2 },
  { id: 'refracao', title: 'Refração e Reflexão', area: 'Física', bloco: 'Óptica e Ondas', tema: 'Snell, reflexão total, Fresnel', resumo: 'Laser entre dois meios, frentes de onda, reflexão parcial e conferência pelo princípio de Fermat.', icon: 'M3 12h18M6 3l6 9 4 9', component: L(() => import('./refracao/RefracaoModule')), fase: 2 },
  { id: 'lentes', title: 'Lentes e Espelhos', area: 'Física', bloco: 'Óptica e Ondas', tema: 'Imagens, equação de Gauss, vergência', resumo: 'Raios notáveis em lentes e espelhos esféricos; natureza da imagem e aumento.', icon: 'M12 3c3 4 3 14 0 18M12 3c-3 4-3 14 0 18', component: L(() => import('./lentes/LentesModule')), fase: 2 },
  { id: 'ondas', title: 'Ondas em uma Corda', area: 'Física', bloco: 'Óptica e Ondas', tema: 'v = λf, reflexão, ondas estacionárias', resumo: 'Corda com oscilador ou pulso, pontas fixa, livre ou sem fim, e harmônicos.', icon: 'M2 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0', component: L(() => import('./ondas/OndasModule')), fase: 2 },
  { id: 'calorimetria', title: 'Calorimetria', area: 'Física', bloco: 'Termologia', tema: 'Calor sensível e latente, equilíbrio térmico', resumo: 'Dois corpos (água, gelo ou metais) num calorímetro; troca de calor com fusão e temperatura de equilíbrio exata.', icon: 'M10 4v10a3 3 0 104 0V4a2 2 0 10-4 0', component: L(() => import('./calorimetria/CalorimetriaModule')), fase: 3 },
  { id: 'gases', title: 'Gases Ideais', area: 'Química', bloco: 'Termologia', tema: 'PV = nRT, teoria cinética', resumo: 'Centenas de partículas com Maxwell–Boltzmann; pressão medida nas paredes contra NkT/V.', icon: 'M5 5h14v14H5zM9 9h.01M14 11h.01M10 15h.01', component: L(() => import('./gases/GasesModule')), fase: 3 },
  { id: 'ph', title: 'pH e Titulação', area: 'Química', bloco: 'Soluções', tema: 'Ácidos, bases, indicadores, titulação', resumo: 'Curva de titulação pelo balanço de cargas exato, indicadores e escala de pH do cotidiano.', icon: 'M8 3h8M9 3v6l-4 11h14L15 9V3', component: L(() => import('./ph/PhModule')), fase: 3 },
  { id: 'estequiometria', title: 'Estequiometria', area: 'Química', bloco: 'Reações', tema: 'Reagente limitante, excesso, rendimento', resumo: 'Reações com moléculas desenhadas, reagente limitante, rendimento e lei de Lavoisier.', icon: 'M4 12h6M14 12h6M17 9l3 3-3 3', component: L(() => import('./estequiometria/EstequiometriaModule')), fase: 3 },
  { id: 'pilhas', title: 'Pilhas e Eletrólise', area: 'Química', bloco: 'Eletroquímica', tema: 'Potenciais de redução, Nernst, Faraday', resumo: 'Monte pilhas com 8 metais; ddp por Nernst, massa dos eletrodos por Faraday e eletrólise com fonte.', icon: 'M7 6h10v14H7zM10 3h4v3h-4z', component: L(() => import('./pilhas/PilhasModule')), fase: 3 },
  { id: 'estufa', title: 'Efeito Estufa', area: 'Química', bloco: 'Ambiente', tema: 'Balanço radiativo, CO₂, albedo', resumo: 'Modelo de uma camada com superfície e atmosfera; CO₂, albedo e Sol mudam a temperatura de equilíbrio.', icon: 'M12 3a9 9 0 100 18 9 9 0 000-18M3 12h18', component: L(() => import('./estufa/EstufaModule')), fase: 3 },
  { id: 'selecao', title: 'Seleção Natural', area: 'Biologia', bloco: 'Evolução', tema: 'Mariposas, pressão seletiva, deriva, mutação', resumo: 'Mariposas claras e escuras em troncos limpos ou com fuligem; frequência alélica contra o modelo determinístico.', icon: 'M6 18c0-6 12-6 12-12M6 6c0 6 12 6 12 12', component: L(() => import('./selecao/SelecaoModule')), fase: 4 },
  { id: 'genetica', title: 'Genética Mendeliana', area: 'Biologia', bloco: 'Genética', tema: 'Punnett, proporções, ABO, ligada ao X', resumo: 'Cinco tipos de herança com quadro de Punnett exato, descendentes sorteados e teste χ².', icon: 'M4 4h16v16H4zM12 4v16M4 12h16', component: L(() => import('./genetica/GeneticaModule')), fase: 4 },
  { id: 'funcoes', title: 'Funções', area: 'Matemática', bloco: 'Funções', tema: 'Afim, quadrática, exponencial', resumo: 'Raízes, vértice, sinal e taxa de variação conferidos por fórmula e por métodos numéricos.', icon: 'M3 21L21 3M3 6c6 18 12 18 18 0', component: L(() => import('./funcoes/FuncoesModule')), fase: 4 },
  { id: 'estatistica', title: 'Estatística e Probabilidade', area: 'Matemática', bloco: 'Estatística', tema: 'Galton, binomial, média, mediana, desvio', resumo: 'Tabuleiro de Galton com histograma ao vivo contra a binomial e a curva normal.', icon: 'M4 20V10M10 20V4M16 20v-8M22 20H2', component: L(() => import('./estatistica/EstatisticaModule')), fase: 4 },
  { id: 'juros', title: 'Matemática Financeira', area: 'Matemática', bloco: 'Finanças', tema: 'Juros simples e compostos, Price e SAC', resumo: 'Aplicações com aportes e financiamentos mês a mês, conferidos pelas fórmulas fechadas.', icon: 'M12 3v18M17 7H9.5a3 3 0 000 6h5a3 3 0 010 6H6', component: L(() => import('./juros/JurosModule')), fase: 4 },
];

export const AREAS: Area[] = ['Física', 'Química', 'Biologia', 'Matemática'];
