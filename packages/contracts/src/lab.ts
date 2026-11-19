// Catálogo dos simuladores do Laboratório Virtual (apps/lab), servido em /laboratorio/.
// É só dado: a interface usa para montar links, o motor (labModulesFor) para ligar questões a simuladores.
// O teste apps/lab/src/modules/catalogo.test.ts garante que ids e títulos batem com o registro do Laboratório.

export const LAB_PATH = "/laboratorio/";

export interface LabModule {
  id: string;
  title: string;
  /** Disciplinas do Ritmo em que o simulador ajuda (a primeira é a principal). */
  disciplines: readonly string[];
  /** Assuntos do banco (campo `topic`) que, sozinhos, já indicam o simulador. */
  topics: readonly string[];
  /** Expressões procuradas no enunciado, em minúsculas e sem acento (fonte de RegExp). */
  keywords: readonly string[];
}

export const LAB_MODULES: readonly LabModule[] = [
  { id: "muv", title: "Movimento Uniformemente Variado", disciplines: ["Física"], topics: ["Cinemática"], keywords: ["uniformemente variado", "aceleracao constante", "torricelli", "\\bmruv\\b", "\\bmuv\\b"] },
  { id: "newton", title: "Leis de Newton e Atrito", disciplines: ["Física"], topics: ["Dinâmica"], keywords: ["plano inclinado", "forca de atrito", "coeficiente de atrito", "atrito estatico", "atrito cinetico"] },
  { id: "projetil", title: "Lançamento Oblíquo", disciplines: ["Física"], topics: [], keywords: ["lancamento obliquo", "obliquamente", "alcance horizontal", "projetil", "lancamento horizontal"] },
  { id: "energia", title: "Conservação da Energia", disciplines: ["Física"], topics: ["Trabalho e Energia"], keywords: ["energia mecanica", "energia potencial gravitacional", "montanha-russa", "conservacao da energia"] },
  { id: "pendulo", title: "Pêndulo Simples", disciplines: ["Física"], topics: [], keywords: ["pendulo"] },
  { id: "mola", title: "Sistema Massa-Mola", disciplines: ["Física"], topics: [], keywords: ["\\bmolas?\\b", "constante elastica", "lei de hooke", "massa-mola"] },
  { id: "colisoes", title: "Colisões", disciplines: ["Física"], topics: ["Impulso e Quantidade de Movimento"], keywords: ["colisao", "colidem", "quantidade de movimento", "coeficiente de restituicao"] },
  { id: "empuxo", title: "Hidrostática e Empuxo", disciplines: ["Física"], topics: ["Hidrostática"], keywords: ["empuxo", "arquimedes", "\\bflutua", "pressao hidrostatica", "stevin"] },
  { id: "orbitas", title: "Gravitação e Leis de Kepler", disciplines: ["Física"], topics: ["Gravitação"], keywords: ["\\borbita", "kepler", "satelite", "gravitacao universal"] },
  { id: "circuitos", title: "Circuitos Elétricos", disciplines: ["Física"], topics: ["Eletrodinâmica"], keywords: ["resistor", "resistencia eletrica", "circuito eletrico", "associacao em (serie|paralelo)", "\\bkwh\\b"] },
  { id: "inducao", title: "Indução Eletromagnética", disciplines: ["Física"], topics: ["Eletromagnetismo"], keywords: ["inducao eletromagnetica", "corrente induzida", "faraday", "\\blenz\\b", "transformador", "fluxo magnetico", "dinamo"] },
  { id: "refracao", title: "Refração e Reflexão", disciplines: ["Física"], topics: [], keywords: ["refracao", "refrata", "indice de refracao", "snell", "reflexao total", "fibra optica", "angulo limite"] },
  { id: "lentes", title: "Lentes e Espelhos", disciplines: ["Física"], topics: [], keywords: ["\\blentes?\\b", "espelho (concavo|convexo|esferico)", "espelhos (concavos|convexos|esfericos)", "miopia", "hipermetropia", "presbiopia", "\\blupa\\b", "vergencia"] },
  { id: "ondas", title: "Ondas em uma Corda", disciplines: ["Física"], topics: ["Ondulatória"], keywords: ["onda estacionaria", "ondas estacionarias", "harmonico", "comprimento de onda", "frequencia fundamental"] },
  { id: "calorimetria", title: "Calorimetria", disciplines: ["Física", "Química"], topics: [], keywords: ["calor especifico", "calor latente", "capacidade termica", "equilibrio termico", "calorimetro", "quantidade de calor"] },
  { id: "gases", title: "Gases Ideais", disciplines: ["Química", "Física"], topics: [], keywords: ["gas ideal", "gases ideais", "gas perfeito", "isotermica", "isobarica", "isocorica", "isovolumetrica", "clapeyron", "teoria cinetica"] },
  { id: "ph", title: "pH e Titulação", disciplines: ["Química"], topics: [], keywords: ["\\bph\\b", "\\bpoh\\b", "titulacao", "indicador acido", "solucao tampao", "neutralizacao"] },
  { id: "estequiometria", title: "Estequiometria", disciplines: ["Química"], topics: ["Estequiometria"], keywords: ["reagente limitante", "reagente em excesso", "rendimento da reacao"] },
  { id: "pilhas", title: "Pilhas e Eletrólise", disciplines: ["Química"], topics: ["Eletroquímica"], keywords: ["\\bpilhas?\\b", "eletrolise", "potencial (padrao )?de reducao", "\\banodo", "\\bcatodo", "galvaniza"] },
  { id: "estufa", title: "Efeito Estufa", disciplines: ["Química", "Biologia", "Física"], topics: [], keywords: ["efeito estufa", "aquecimento global", "gases? (de )?efeito estufa", "albedo"] },
  { id: "selecao", title: "Seleção Natural", disciplines: ["Biologia"], topics: ["Evolução"], keywords: ["selecao natural", "darwin", "hardy-weinberg", "deriva genetica"] },
  { id: "genetica", title: "Genética Mendeliana", disciplines: ["Biologia"], topics: ["Genética"], keywords: ["heredograma", "\\balelos?\\b", "genotipo", "daltonismo", "sistema abo", "tipo sanguineo"] },
  { id: "funcoes", title: "Funções", disciplines: ["Matemática"], topics: ["Função Afim", "Função Quadrática", "Função Exponencial"], keywords: ["funcao (afim|quadratica|exponencial|polinomial do (1|2)o grau)", "\\bparabola", "vertice da parabola"] },
  { id: "estatistica", title: "Estatística e Probabilidade", disciplines: ["Matemática"], topics: ["Estatística", "Probabilidade"], keywords: ["media aritmetica", "\\bmediana\\b", "desvio padrao", "distribuicao binomial"] },
  { id: "juros", title: "Matemática Financeira", disciplines: ["Matemática"], topics: ["Matemática Financeira"], keywords: ["\\bjuros\\b", "financiamento", "taxa de juros"] },
];

/** Endereço de um simulador, com parâmetros opcionais que ele aplica ao abrir (ex.: { v0: 20, angulo: 30 }). */
export function labUrl(id: string, params?: Record<string, number | string>): string {
  const query = params ? new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString() : "";
  return `${LAB_PATH}#${id}${query ? `?${query}` : ""}`;
}

export const labModule = (id: string) => LAB_MODULES.find((m) => m.id === id);
