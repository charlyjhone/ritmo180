# Importar questões

```bash
npm run ingest -- caminho/do/arquivo.xlsx
```

Reimportar o mesmo arquivo é seguro: a questão é reconhecida pelo `id` e não é duplicada. O comando informa quantas foram aceitas e por que cada uma foi recusada. Para salvar as recusas em um arquivo, adicione `--relatorio recusadas.json`.

## Formatos aceitos

- **Planilha `.xlsx`:** uma questão por linha.
- **JSON:** veja `packages/ingest/examples/exemplo-disciplinas.json`, com exemplos de Matemática, Humanas e Linguagens.
- **Banco ENEM (`Banco_ENEM*.xlsx`):** importa os metadados. As questões ficam catalogadas e só vão para o treino quando receberem o texto.

PDFs de prova não entram direto. Eles precisam primeiro ser convertidos para um desses formatos.

## Colunas da planilha

| Coluna | Obrigatória | Exemplo |
| --- | --- | --- |
| `id` | Sim | `enem-2023-mt-142` |
| `disciplina` | Sim | `Matemática` |
| `assunto` | Sim | `Porcentagem` |
| `enunciado` | Sim | Comando da questão |
| `a`, `b`, `c`, `d`, `e` | Sim | Alternativas |
| `gabarito` | Sim | `C` |
| `origem` | Sim | `enem`, `autoral` ou `terceiro` |
| `direitos_ok` | Sim | `sim` |
| `texto_base` | Não | Texto de apoio |
| `habilidade`, `competencia` | Não | `H17`, `5` |
| `ano`, `aplicacao` | Não | `2023`, `regular` |
| `resolucao`, `dica` | Não | Explicação e pista do tutor |
| `erro_a` … `erro_e` | Não | Por que cada alternativa errada engana |
| `irt_a`, `irt_b`, `irt_c` | Não | Parâmetros oficiais do Inep |

## O que muda o resultado

- **Direitos:** questão sem `direitos_ok` não é publicada. Provas oficiais do ENEM são públicas. Material de cursinho, editora ou apostila precisa de autorização.
- **Parâmetros TRI:** com `irt_a`, `irt_b` e `irt_c`, a questão já vale para a nota. Sem eles, ela entra em calibração e serve só para treino até juntar 200 respostas.
- **Erros comentados:** `erro_a` a `erro_e` alimentam o feedback de pegadinha e o painel do professor.
- **Imagens:** a planilha aceita texto. Questões com figura devem vir em JSON, com a imagem em SVG ou `data:`.

## Importar livros em PDF

O PDF vira um JSON canônico em duas etapas. Elas precisam de Python com `pypdfium2`, `pypdf` e `pillow`, além do banco de metadados `banco_ENEM_2009_2025_v2.json` e dos mapas de distratores.

```bash
python3 scripts/extrair_figuras_livros.py "pasta dos PDFs" caminho/banco_ENEM_2009_2025_v2.json data/importacao/livros
```

```bash
python3 scripts/montar_questoes_livros.py "pasta do banco" data/importacao/livros data/importacao/questoes-livros.json data/importacao/revisar-livros.json
```

```bash
npm run ingest -- data/importacao/questoes-livros.json --relatorio data/importacao/recusadas.json
```

- A primeira etapa recorta as figuras e localiza cada questão no PDF. A segunda repara o texto, posiciona as figuras e aplica o gabarito oficial.
- O que não pode ser conferido automaticamente vai para `revisar-livros.json`, com o motivo, e não entra no banco.
- Tudo entra com `rightsCleared: false`, portanto em revisão e invisível para os alunos.

## Publicar depois de confirmar os direitos

```bash
npm run content:liberar -- "Nome de quem confirmou"
```

O comando publica as questões oficiais em revisão e registra o nome em cada uma. Use-o só depois de confirmar que o material pode ser usado.

## Banco local

O banco embutido em `data/pg` aceita um processo por vez. Importar ou publicar com o servidor ligado pode corrompê-lo, por isso esses comandos recusam rodar enquanto `data/pg.lock` aponta para um processo ativo. Desligue o servidor antes.
