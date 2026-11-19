# Arquitetura

O objetivo é poder trocar uma parte sem quebrar as outras. As regras abaixo são verificadas por `scripts/architecture.test.ts`, então uma violação reprova os testes.

## Camadas

```text
apps/web ───────► @ritmo/contracts, @ritmo/engine
apps/api ───────► @ritmo/contracts, @ritmo/engine, @ritmo/ingest
packages/ingest ► @ritmo/contracts
packages/engine   sem dependências internas, sem banco, sem rede
```

- **Motor:** funções puras. Recebe fatos, devolve decisões. Toda regra de TRI, tempo-alvo, Índice Ritmo e seleção de questões mora aqui.
- **Contratos:** tudo que cruza a rede. Uma mudança incompatível aparece como erro de tipo nos dois lados.
- **Módulos da API:** `apps/api/src/modules/<nome>`. Um módulo só importa o `index.ts` de outro, nunca seus arquivos internos.
- **Plataforma:** `apps/api/src/platform`. Banco, HTTP e Claude ficam atrás de interfaces. Os módulos não conhecem o fornecedor.

## Módulos

| Módulo | Responsabilidade |
| --- | --- |
| `identity` | Login, sessão, perfis |
| `catalog` | Questões publicadas |
| `content` | Geração por IA e revisão humana |
| `practice` | Treino, sincronização e diagnóstico |
| `reading` | Leitura com compreensão |
| `exam` | Simulado e resultado |
| `insights` | Painéis por perfil, somente leitura |
| `onboarding` | Implantação da escola |
| `calibration` | Calibração TRI |

## Dados

- **Isolamento:** cada consulta de escola roda com Row Level Security no Postgres, usando um papel sem privilégios. Um erro de código não expõe dados de outra escola. A rede só lê visões agregadas.
- **Respostas são imutáveis:** a tabela de tentativas só aceita inclusão. O resumo do aluno é uma projeção e pode ser recalculado a qualquer momento.
- **Migrações:** ficam em `apps/api/migrations` e rodam na ordem do nome.

## Offline

O treino é baixado para o aparelho. As respostas entram em uma fila no IndexedDB com um identificador criado no próprio aparelho, então reenviar não cria duplicata. A fila é enviada quando a internet volta. O simulado exige conexão.

## Notas

A nota só é mostrada com pelo menos 10 questões calibradas respondidas em condição de prova. Treino guiado alimenta o Raio-X e o domínio, mas não a nota. LC e CH ainda usam escala provisória e aparecem marcadas assim.

Uma questão nova entra em calibração e só recebe parâmetros próprios com 200 respostas ou mais, comparadas a questões-âncora com parâmetros conhecidos.

## Como mudar algo com segurança

| Mudança | Onde mexer |
| --- | --- |
| Regra pedagógica | `packages/engine`, com teste no mesmo pacote |
| Novo formato de questão | Novo adaptador em `packages/ingest/src/adapters` |
| Nova disciplina | `packages/contracts/src/taxonomy.ts` |
| Trocar o banco | Implementar a interface `Database` em `platform` |
| Trocar o modelo de IA | Variável `RITMO_MODEL` ou novo adaptador de `Llm` |
| Nova tela | Novo arquivo em `apps/web/src/features` e rota em `main.tsx` |
