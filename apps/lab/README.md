# Laboratório Virtual ENEM

Plataforma de simulações de Ciências da Natureza e Matemática feita em React, TypeScript e Tailwind. Tudo está em português do Brasil e em unidades do SI. É uma reconstrução clean-room inspirada no PhET (Univ. do Colorado): nenhum código, arte ou texto do PhET foi copiado.

Cada módulo segue o mesmo contrato:

- canvas a 60 fps;
- passo de integração fixo, independente da taxa de quadros;
- gráficos ao vivo;
- painel **Verificação**, que compara o valor simulado com a fórmula da prova e marca "✓ confere";
- exportação JSON com parâmetros, resultados, verificação, método e a série temporal completa.

## Rodar

```bash
npm install
npm run dev      # http://localhost:5190
npm test         # 362 testes (física + gabaritos)
npm run build
```

Atalhos em todos os módulos: **Espaço** inicia ou pausa, **→** avança um quadro e **R** reinicia.

## Módulos (Fase 1: mecânica)

| Rota | Módulo | Física e verificação |
|---|---|---|
| `#projetil` | Lançamento oblíquo | RK4 com arrasto quadrático. No vácuo, `R = v0²sen2θ/g` e `H = v0²sen²θ/2g` batem a cerca de 1e-12. |
| `#muv` | MUV | Solução exata. Verifica `x(t)`, `v(t)` e Torricelli; tem marcas estroboscópicas. |
| `#newton` | Leis de Newton e atrito | Plano inclinado com atrito estático/cinético e parada exata. Verifica `N` e `a`. |
| `#energia` | Conservação da energia | Pista `y = f(x)` (U, W, rampa) com atrito viscoso e energia térmica. Verifica `v = √(2gΔh)` e `E = E₀`. |
| `#pendulo` | Pêndulo simples | RK4 não linear, período exato pela média aritmético-geométrica (AGM) e comparação com `2π√(L/g)`. |
| `#mola` | Massa-mola | Mola vertical com amortecimento. Verifica `T = 2π√(m/k)` e `Fel = P` no equilíbrio. |
| `#colisoes` | Colisões 1D | Coeficiente de restituição `e`, colisão no instante exato do contato. Verifica a conservação de `p` e a perda `½μ(1−e²)Δv²`. |
| `#empuxo` | Hidrostática e empuxo | Arquimedes e Stevin, 6 fluidos e 6 materiais. Verifica `V_sub/V = ρc/ρf` e `E = P`. |
| `#orbitas` | Gravitação e órbitas | Unidades UA, ano e M☉ (`GM = 4π²`), RK4 com subpasso `∝ r^1,5`. Verifica Kepler II (setores de T/12) e III, e a excentricidade. |

## Módulos (Fase 2: eletricidade, óptica e ondas)

| Rota | Módulo | Física e verificação |
|---|---|---|
| `#circuitos` | Circuitos elétricos | Série, paralelo e misto resolvidos por análise nodal (MNA, eliminação de Gauss), conferidos contra `Req` e o balanço `ε·i = ΣR·i²`. Capacitor RC por RK4: τ medido a 63,2% e balanço de energia. Consumo em kWh e R$. |
| `#inducao` | Indução eletromagnética | Gerador (espira girando): fem medida como −ΔΦ/Δt, conferida contra `ε_máx = NBAω` e a frequência. Ímã atravessando bobina (fluxo de dipolo): pico em `z = −a/2` e lei de Lenz. |
| `#refracao` | Refração e reflexão | Snell conferida pelo princípio de Fermat (mínimo do caminho óptico). Fresnel (`R + T = 1`), ângulo crítico, Brewster, modo de frentes de onda. |
| `#lentes` | Lentes e espelhos | Imagem pela interseção dos raios notáveis, conferida pela equação de Gauss e pelo aumento; vergência em dioptrias. |
| `#ondas` | Ondas em uma corda | Diferenças finitas com Courant 1 (exato, d'Alembert). Mede `λ = v/f`, `T = 1/f` e `v = √(T/μ)` pelo pulso. Pontas fixa, livre e sem fim; harmônicos. |

As Fases 3 e 4 (termologia, química, biologia e matemática) aparecem na página inicial como "em produção".

## Módulos (Fase 3: termologia e química)

| Rota | Módulo | Método e verificação |
|---|---|---|
| `#calorimetria` | Calorimetria | Entalpia por corpo com platô de fusão do gelo; troca G·ΔT por RK4. Confere T de equilíbrio (ΣQ = 0), calor cedido = recebido e fração líquida. |
| `#gases` | Gases ideais | Partículas com velocidades de Maxwell–Boltzmann; pressão medida pelo impulso nas paredes. Confere `P = NkT/V` (~0,1%) e `T` pela energia cinética. Tabela PV/NT. |
| `#ph` | pH e titulação | pH exato pelo balanço de cargas (bissecção). Confere `V_eq` pela máxima inclinação, pH inicial contra a fórmula do livro e pH = pKa na meia-equivalência. Três indicadores. |
| `#estequiometria` | Estequiometria | Grau de avanço ξ com cinética de 1ª ordem. Confere Lavoisier, Σν·M e massa de produto pelo reagente limitante e rendimento. |
| `#pilhas` | Pilhas e eletrólise | 8 metais; ddp por Nernst, carga por RK4, massas por Faraday; fonte oposta força a eletrólise. Confere Nernst global, `Δm = M∫I dt/(nF)` e balanço de elétrons. |
| `#estufa` | Efeito estufa | Modelo de uma camada (superfície e atmosfera) com CO₂ → ε por 5,35·ln(C/280). Confere `Ts = Te(2/(2−ε))^¼`, `Ta = Ts/2^¼` e absorvido = OLR. |

## Módulos (Fase 4: biologia e matemática)

| Rota | Módulo | Método e verificação |
|---|---|---|
| `#selecao` | Seleção natural | Mariposas indivíduo a indivíduo: predação por fenótipo, acasalamento ao acaso (Wright–Fisher) e mutação; ambiente muda durante a simulação. Confere a fórmula clássica de q', p(C) contra o modelo determinístico (±3σ de deriva) e Hardy–Weinberg. |
| `#genetica` | Genética mendeliana | Mono e diibridismo, dominância incompleta, ABO e ligada ao X. Punnett exato, descendentes sorteados, χ². Confere regra do produto e proporções (±3σ). |
| `#funcoes` | Funções | Afim, quadrática e exponencial com tangente. Confere Bhaskara contra varredura + bissecção, Girard, vértice pela taxa numérica nula, razão e tempo de duplicação. |
| `#estatistica` | Estatística e probabilidade | Tabuleiro de Galton com binomial e normal. Média, mediana, moda e desvio. Confere np e npq exatos e as medidas amostrais (±3σ). |
| `#juros` | Matemática financeira | Juros simples × compostos com aportes; Price × SAC mês a mês. Confere montantes, taxa equivalente, Σ amortizações = PV e juros totais do SAC. |

## Questões estilo ENEM

`#questoes` (ou `#questoes/<módulo>`) traz 125 questões originais de múltipla escolha, cinco por experimento: 70 de Física, 30 de Química, 10 de Biologia e 15 de Matemática. Não são itens oficiais do INEP. Cada uma tem resolução comentada com os erros típicos das alternativas e um roteiro para conferir o resultado no simulador. Cada módulo mostra o link "Questões (n)" no cabeçalho. O progresso fica no `localStorage` de quem usa.

`#simulado` sorteia de 5 a 45 questões, por área ou de todas, e dá 2, 3 ou 4 minutos por questão (3 é o ritmo da prova). Não há correção até a entrega; quando o tempo acaba, a prova é entregue sozinha. O relatório mostra o aproveitamento por área e por experimento, aponta o que revisar primeiro e traz o gabarito comentado. Os 10 últimos resultados ficam no navegador.

O gabarito é testado: `src/questoes/questoes.test.ts` recalcula a resposta de cada questão numérica com o `physics.ts` do módulo e exige que a alternativa marcada seja a mais próxima (erro ≤ 2%, ou a tolerância da questão). O teste também confere a estrutura e o equilíbrio das letras. Para acrescentar uma questão, inclua-a em `src/questoes/{fisica,quimica,biomat}{,2}.ts` com `valores` e uma entrada em `RESPOSTAS`.

## Estrutura

```
src/core/stepper.ts      useStepper: passo fixo, amostragem exata, tEnd, reinício por condições iniciais; rk4; período por cruzamento de zero
src/core/canvas.ts       cores, HiDPI, fitView (escala igual em x e y), grade, setas, rótulos, barras
src/core/TimeChart.tsx   gráfico temporal em canvas
src/core/export.ts       exportação JSON padronizada
src/shell/               página inicial, layout comum dos módulos (ModuleShell)
src/ui/controls.tsx      Slider, Chip, Toggle, Playback, VerifyTable, ExportButton…
src/modules/registry.ts  catálogo de módulos (lazy-load por rota)
src/modules/<id>/        physics.ts (pura, testada) + <Id>Module.tsx
src/modules/physics.test.ts  testes da Fase 1
src/modules/fase2.test.ts    testes da Fase 2
src/modules/fase3.test.ts    testes da Fase 3
src/modules/fase4.test.ts    testes da Fase 4
src/questoes/             banco de questões, página e teste dos gabaritos
```

Para criar um módulo novo: escreva `physics.ts` como funções puras com testes, monte a tela com `useStepper`, `ModuleShell`, `Scene`, `TimeChart` e `VerifyTable`, e registre o módulo em `registry.ts` com `component: lazy(...)`.
