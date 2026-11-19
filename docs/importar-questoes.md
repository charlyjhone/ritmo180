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

## Importar Linguagens e Humanas

Estes livros não têm banco de texto: enunciado, alternativas e figuras vêm do PDF, e o gabarito vem das tabelas por seção no fim de cada livro.

```bash
cd scripts
python3 montar_livros_humanas.py "pasta dos PDFs" caminho/Banco_LC_CH_Indice_e_Radar.xlsx ../data/importacao/humanas ../data/importacao/questoes-humanas.json ../data/importacao/revisar-humanas.json
cd ..
npm run ingest -- data/importacao/questoes-humanas.json --relatorio data/importacao/recusadas-humanas.json
```

- A planilha do Inep traz TRI, habilidade e gabarito oficial. A ligação é feita pelo começo do texto, e o bloco de 2024 pelo número da questão.
- O gabarito oficial escolhe a tabela de cada seção. Uma seção que não confere vai para o relatório.
- O comentário só entra se falar do mesmo assunto da questão. Ele é texto da editora, não do Inep.
- Questão sem ligação ao Inep, como as da aplicação PPL, entra sem TRI e é calibrada pelo uso.

## Publicar depois de confirmar os direitos

```bash
npm run content:liberar -- "Nome de quem confirmou"
```

O comando publica as questões oficiais em revisão e registra o nome em cada uma. Use-o só depois de confirmar que o material pode ser usado.

## Banco local

O banco embutido em `data/pg` aceita um processo por vez. Importar ou publicar com o servidor ligado pode corrompê-lo, por isso esses comandos recusam rodar enquanto `data/pg.lock` aponta para um processo ativo. Desligue o servidor antes.

## Completar resoluções e TRI

Dois passos opcionais, que rodam sobre os JSON já montados e só acrescentam o que falta. Depois deles, reimporte e libere de novo.

`scripts/completar_resolucoes.py` liga os Gabaritos Comentados de Física, Química, Biologia e Matemática às questões sem resolução. Só aceita o comentário com palavras raras em comum, a resposta numérica citada e sem outra questão disputando o mesmo comentário. Descarta o que perdeu fórmulas, que no PDF são imagens. Nunca troca uma resolução existente.

`scripts/ligar_tri_inep.py` acrescenta os parâmetros oficiais. Precisa de duas coisas dos microdados do Inep: a tabela `ITENS_PROVA` de cada ano, salva como `itens_ANO.csv`, e os cadernos azuis, salvos como `ANO_apN_dN_*.pdf`. Os dois podem ser lidos do zip por HTTP Range, sem baixar o arquivo inteiro. O caminho é texto da questão → caderno → posição → item, e a ligação só vale se o gabarito oficial for igual. Os zips não trazem as provas PPL de 2011 a 2014 nem as de 2024.
