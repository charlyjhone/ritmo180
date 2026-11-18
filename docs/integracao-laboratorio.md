# Integração com o Laboratório Virtual

Plano para juntar o Laboratório Virtual ENEM ao Ritmo 180. Escrito em 18/11/2026. **A Fase 1 foi feita em 18/11/2026**. A Fase 2 foi publicada em 18/11/2026; a Fase 3 ainda não começou.

## Por que juntar

O Ritmo 180 mede onde o aluno perde tempo e pontos, mas não tem como ensinar o fenômeno por trás da questão. O Laboratório faz o contrário: tem 25 simuladores de Física, Química, Biologia e Matemática e 125 questões próprias, mas não tem conta de aluno, turma nem nota.

O ciclo que a integração cria:

```text
Ritmo detecta o erro ──► "Ver no simulador" ──► aluno experimenta e resolve
        ▲                                                │
        └──────────── volta ao treino do mesmo assunto ◄─┘
```

## O que já sabemos

| Item | Ritmo 180 | Laboratório |
| --- | --- | --- |
| Interface | React 19, Vite 8, React Router, CSS próprio | React 18, Vite 6, Tailwind 4, rotas por `#hash` |
| Testes | Vitest 5, TypeScript 7 | Vitest 3, TypeScript 5.8, 362 testes |
| Servidor | Fastify entrega a interface e a API no mesmo endereço | site estático, sem servidor |
| Questões | 5.376 publicadas; formato `CanonicalItem` com `source: "authored"` já previsto | 125 autorais, gabaritos conferidos pela física em teste |
| Publicação | Docker + Postgres, ainda não publicado | não publicado |

**Cobertura estimada.** Uma contagem por assunto e palavras-chave no enunciado indica que cerca de metade das 2.868 questões de Natureza e Matemática dos livros (≈1.500) tem pelo menos um simulador relacionado. É uma estimativa grosseira: algumas palavras-chave (por exemplo, "ácido" para o módulo de pH) também pegam questões que não pedem titulação. Os assuntos que mais se beneficiam são Eletrodinâmica, Ondulatória, Termologia, Óptica, Estequiometria, Eletroquímica, Genética, Estatística, Funções e Matemática Financeira.

## Fase 1 — antes do lançamento (18/01/2027) · feita

**Como ficou:**

- O Laboratório está em `apps/lab`, com React 19, Vite 8 e Vitest 5. `npm run check` roda os testes dele junto com os do Ritmo, e `npm run build` compila os dois. A pasta original `../simulador-projetil` continua existindo, mas não é mais a versão em uso.
- O servidor entrega o Laboratório em `/laboratorio/`, com cache longo nos arquivos com hash. O `Dockerfile` copia `apps/lab/dist`. As fontes agora vêm do pacote (`@fontsource`), porque a política de segurança do Ritmo bloqueia o Google Fonts.
- O catálogo fica em `packages/contracts/src/lab.ts`, e um teste do Laboratório confere que ids e títulos batem com o registro dele.
- `labModulesFor` fica em `packages/engine/src/lab.ts`. Nas 2.868 questões de Natureza e Matemática dos livros, ele liga **1.071** a pelo menos um simulador.
- O botão "Ver no simulador" aparece na correção do treino, no resultado do simulado e no caderno de erros. No plano, um dia de assunto com simulador mostra o link "Simulador: …". Os links abrem em outra aba, para o aluno não perder o treino.
- Parâmetros na rota, com o nome da variável de cada módulo: `#pendulo?L=2&g=3.7&th0=10`, `#projetil?v0=30&angleDeg=30`, `#funcoes?kind=exponencial&a=0.5&c=4`, `#estequiometria?reacao=amonia`. Os nomes aceitos são os das chamadas `param('…')`, `params({…})` e `choice('…')` em cada `*Module.tsx`; o mecanismo está em `apps/lab/src/core/params.ts`. `choice` vale para escolhas (material, modo, gás, eletrodo, genótipo) e ignora valores que não estão na lista, para um link errado não quebrar o módulo.

**Ficou para depois:** os links do Ritmo ainda não passam parâmetros, porque as questões do banco não têm os valores estruturados. O `Dockerfile` foi ajustado, mas a imagem não foi compilada aqui (não há Docker nesta máquina).

**Plano original:**

Objetivo: o aluno do Ritmo chega ao simulador certo com um clique. Nenhuma tabela nova no banco.

1. **Trazer o Laboratório para o monorepo** como `apps/lab`. Atualizar para as mesmas versões do Ritmo (React 19, Vite 8, Vitest 5, TypeScript 7). Os 362 testes do Laboratório e uma passada no navegador por módulo confirmam que nada quebrou.
2. **Publicar no mesmo endereço**, em `/laboratorio/`. O Vite do Laboratório passa a usar `base: "/laboratorio/"`. O `Dockerfile` compila os dois, e o Fastify entrega `apps/lab/dist` nesse prefixo. As rotas por `#hash` continuam funcionando sem configuração extra.
3. **Catálogo de módulos em `@ritmo/contracts`**: id, título, disciplina e assuntos de cada simulador, só dados. O registro do Laboratório passa a ler o título e o tema dali, para não haver duas listas divergentes.
4. **Ligação questão → simulador no motor**: função pura `labModulesFor(item)` em `packages/engine`. Primeiro usa o assunto (`Dinâmica` → Leis de Newton, `Eletroquímica` → Pilhas…) e depois palavras-chave do enunciado (pêndulo, mola, lente, titulação…). Ela tem teste próprio com exemplos reais, incluindo casos que **não** devem ser ligados.
5. **Botão "Ver no simulador"** em `question-review.tsx`, que aparece na correção do treino, no resultado do simulado e no caderno de erros. No plano de estudos, um assunto fraco com simulador ganha o atalho "Praticar no laboratório".
6. **Links com parâmetros**: o Laboratório passa a aceitar `#projetil?v0=20&angulo=30`, por exemplo, e abre o experimento já montado. Isso também transforma o "Confira no simulador" das 125 questões em um clique.

Riscos: atualizar o Laboratório para React 19 e Vite 8. O código é pequeno e bem testado, mas cada módulo precisa de uma conferência visual. Se der problema, a saída é manter o Laboratório com as versões atuais e compilá-lo à parte no `Dockerfile`; os passos 2 a 6 não mudam.

## Fase 2 — questões autorais no banco · publicada

**Como ficou (18/11/2026):**

- `apps/lab/src/questoes/exportar.ts` converte cada questão em `CanonicalItem`: `externalId: "lab-<id>"`, `source: "authored"`, `application: "Laboratório Virtual"`, enunciado em `contextHtml` + `stemHtml`, resolução e roteiro em `solutionHtml`.
- Assunto do Ritmo por simulador, usando os nomes do banco dos livros (pêndulo e mola em Ondulatória, calorimetria e gases em Termologia, pH em Soluções, efeito estufa em Química Ambiental; funções pelo tipo, estatística ou probabilidade pelo assunto da questão).
- 56 alternativas erradas ganharam `trap`: a oração da resolução que começa pelo texto da alternativa ("80 m vem de esquecer o fator ½"). Contas intermediárias que só citam o valor não contam; três casos fracos foram excluídos à mão.
- A resolução termina com o roteiro e um `<span class="lab-ref">pendulo?L=1&g=3.7</span>`, que passa pela limpeza de HTML. O Ritmo lê esse marcador (`labRefIn` no motor) e troca o botão "Ver no simulador" pelo simulador já montado ("Monte no laboratório"). O marcador fica oculto no CSS.
- `npm run content:laboratorio` gera `content/laboratorio.json`. O teste `exportar.test.ts` falha se o arquivo estiver desatualizado, se alguma questão for rejeitada pela importação ou se a rota sumir na limpeza.
- Importado no banco local em 18/11/2026: 125 criadas, 0 rejeitadas. Os direitos foram confirmados no mesmo dia (registro em `direitos.ts`) e o lote reimportado: 125 publicadas, com calibração provisória (sem TRI até 200 respostas por questão).

**Como publicar (e republicar depois de mudanças).** `npm run content:liberar` só libera questões oficiais do INEP, então não serve para este lote. A confirmação fica registrada no código: preencher `DIREITOS_CONFIRMADOS` em `apps/lab/src/questoes/direitos.ts` (nome e data), rodar `npm run content:laboratorio` e `npm run ingest -- content/laboratorio.json` com o servidor desligado. As questões passam a `published`, com a nota de quem confirmou.

**Conferido no treino:** em Química › Química Ambiental, a questão do Laboratório mostra o roteiro destacado e o botão "Monte no laboratório", que abre `/laboratorio/#estufa?albedo=0.25`; o marcador da rota não aparece.

**Plano original:**

Objetivo: as 125 questões do Laboratório entram no treino do Ritmo.

1. **Script de exportação** (`apps/lab/scripts/exportar-ritmo.ts`) que converte o formato do Laboratório em `CanonicalItem`:
   - `source: "authored"` e `externalId: "lab-<id>"`;
   - área, disciplina e assunto pela tabela do catálogo (`projetil` → Física / Cinemática);
   - alternativas em HTML, resposta em letra e `solutionHtml` com a resolução e o link para o simulador;
   - `trap` em cada alternativa errada, a partir das explicações que já existem na resolução.
2. **O arquivo gerado** (`content/laboratorio.json`) entra pelo adaptador JSON existente: `npm run ingest -- content/laboratorio.json`. O teste do Laboratório que recalcula os gabaritos continua sendo a fonte da verdade, e o JSON nunca é editado à mão.
3. **Liberação**: mesmo sendo conteúdo próprio, o lote só é publicado com `npm run content:liberar`, depois da sua confirmação, como todo lote novo.
4. **Sem TRI no início**: as questões entram em calibração e não contam para a nota até terem respostas suficientes (200 por questão, comparadas às âncoras). No treino guiado elas já contam para o Raio-X e o domínio.

**Roteiros revisados em 18/11/2026.** Cada uma das 125 questões tem a sua montagem em `apps/lab/src/questoes/links.ts`, e o botão "Abrir…" (no treino e no gabarito do simulado) abre o simulador já com esses valores. O teste `links.test.ts` confere que toda questão tem montagem e que cada parâmetro existe no módulo. No navegador, os 125 links abriram sem erro; 57 já mostram a resposta no painel ao abrir, e outros 20 foram rodados até o valor esperado (MUV, energia, pêndulo, mola, empuxo, estequiometria, seleção, ondas, Newton). O restante é leitura manual (pausar num ponto, passar o mouse), extrapolação prevista no próprio roteiro (por exemplo, 5 Hz → 60 Hz) ou questão conceitual. A revisão achou seis roteiros que usavam g = 10 m/s² sem dizer (newton-2, newton-4, newton-5, energia-4, energia-5, empuxo-3; neste último o painel mostrava 157 N em vez de 160 N); eles agora pedem g = 10, e o link já vem com esse valor.

## Fase 3 — depois do lançamento

Objetivo: um produto só, com o progresso do laboratório na conta do aluno.

1. **Mesma sessão**: como o Laboratório estará no mesmo endereço, ele pode ler `/api/me` e mostrar o nome do aluno, com um link de volta ao Ritmo.
2. **Módulo `lab` na API**: registra o que o aluno fez no laboratório (questões respondidas, simulados, módulos abertos). A tabela só aceita inclusões, como a de tentativas, e segue o isolamento por escola. O progresso deixa de ficar só no navegador.
3. **Painéis**: o aluno vê o laboratório no painel dele; o professor vê quais simuladores a turma usou e o aproveitamento nas questões autorais.
4. **Visual**: decidir se o Laboratório mantém o tema escuro próprio, que funciona bem para os gráficos e cenas, ou adota as fontes e cores do Ritmo. Em qualquer caso, o cabeçalho passa a ser o mesmo.
5. **Uso sem internet**: o Ritmo já baixa o treino para o aparelho. O Laboratório, por ser estático, pode ser guardado em cache do mesmo jeito.

## Decisões que são suas

- Começar a Fase 1 agora ou depois de concluir o que falta para o lançamento.
- Nome e lugar no menu: "Laboratório", "Simuladores" ou outro.
- Se o simulado cronometrado do Laboratório continua existindo, ou se o simulado do Ritmo passa a ser o único (recomendação: manter só o do Ritmo depois da Fase 2, para não ter dois).
