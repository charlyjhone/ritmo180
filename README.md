# Ritmo 180

Plataforma de treino de tempo e leitura para o ENEM, para várias escolas. Mede em que fase da questão o aluno perde tempo, escolhe o próximo treino e estima a nota por TRI de 3 parâmetros.

Não há integração com CRM nesta fase.

## Rodar localmente

Requer Node 24.

```bash
npm install
npm run build
npm run db:seed
npm start
```

Abra `http://localhost:5180`. Os acessos de demonstração ficam em `data/credenciais-demonstracao.txt`, fora do Git.

Para desenvolver a interface com recarga automática, rode `npm run dev:api` e `npm run dev:web` e abra `http://localhost:5181`.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run check` | Tipos e todos os testes |
| `npm run build` | Compila a interface |
| `npm run db:seed` | Cria a escola de demonstração |
| `npm run ingest -- <arquivo>` | Importa questões. Veja [docs/importar-questoes.md](docs/importar-questoes.md) |
| `npm run db:calibrate` | Recalibra as questões com respostas suficientes |

## Configuração

| Variável | Uso | Padrão |
| --- | --- | --- |
| `PORT` | Porta do servidor | `5180` |
| `DATABASE_URL` | Postgres de produção | PGlite em `data/pg` |
| `ANTHROPIC_API_KEY` | Liga o tutor e a geração de questões | Desligados |
| `RITMO_MODEL` | Modelo do Claude | `claude-opus-5-5` |

Sem a chave da Anthropic, o tutor usa a dica escrita na questão e a geração fica indisponível.

## Estrutura

```text
apps/api          Servidor, banco, módulos de negócio
apps/web          Interface React, instalável e com treino offline
packages/engine   Motor pedagógico e TRI, sem banco e sem rede
packages/contracts  Tipos e validações compartilhados
packages/ingest   Leitura e validação de questões
content           Conteúdo autoral
docs              Arquitetura e importação
```

As regras que mantêm as partes independentes estão em [docs/arquitetura.md](docs/arquitetura.md).
