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
