# Publicar o Ritmo 180

O servidor roda em qualquer serviço que aceite um contêiner Docker e um Postgres 16 ou mais novo. Ele entrega a interface e a API no mesmo endereço, e precisa de HTTPS na frente: em produção, o cookie de sessão só funciona em HTTPS.

## 1. Banco

As políticas de isolamento entre escolas escondem as linhas de quem não tem permissão. Por isso, o papel usado pelo servidor precisa de `BYPASSRLS` e de pertencer a `app_user`. Sem isso o servidor se recusa a subir e diz o que falta.

Com um administrador do banco, rode:

```sql
CREATE ROLE app_user NOLOGIN;
CREATE ROLE ritmo LOGIN PASSWORD 'troque-esta-senha' BYPASSRLS;
GRANT app_user TO ritmo;
CREATE DATABASE ritmo OWNER ritmo;
```

Alguns serviços gerenciados não deixam criar papel com `BYPASSRLS`. Confira isso antes de contratar.

## 2. Servidor

Configure as variáveis de `.env.example`. As tabelas são criadas sozinhas na primeira subida.

```bash
docker build -t ritmo180 .
docker run --env-file .env -p 8080:8080 ritmo180
```

Confira em `https://seu-endereco/api/health`. A resposta `{"ok":true}` indica que o servidor alcançou o banco.

## 3. Primeira conta da rede

```bash
DATABASE_URL=... npm run conta:admin -- voce@escola.com.br "Seu nome"
```

A senha provisória aparece só no terminal e precisa ser trocada no primeiro acesso. Para recuperar uma conta da rede, use `npm run conta:senha -- email`.

Depois, tudo é feito no site:

- Na página **Rede**, crie a escola. Na **Implantação** dela, cadastre a conta da coordenação e importe a planilha de alunos (e, se quiser, de professores, com a coluna `perfil`).
- A coordenação cadastra professores, famílias e alunos avulsos na página **Pessoas**, onde também edita turmas, desativa contas e gera senha provisória para quem perdeu o acesso.

`npm run db:seed` cria só dados de demonstração e é recusado em produção.

## 4. Questões

O banco de produção começa vazio. Importe do seu computador, apontando para ele:

```bash
DATABASE_URL=... npm run ingest -- data/importacao/questoes-livros.json
DATABASE_URL=... npm run content:liberar -- "Nome de quem confirmou os direitos"
```

As 125 questões do Laboratório Virtual já saem publicadas, porque os direitos estão registrados em `apps/lab/src/questoes/direitos.ts`:

```bash
DATABASE_URL=... npm run ingest -- content/laboratorio.json
```

## 5. Backup

Agende uma vez por dia, em uma máquina com `pg_dump`. O script confere a cópia e mantém as 14 mais recentes.

```bash
DATABASE_URL=... scripts/backup-postgres.sh /caminho/dos/backups
```

Guarde os backups fora do serviço do banco. Teste a restauração antes do lançamento e depois de tempos em tempos.

## Antes de receber alunos

- Revisão jurídica da página `/privacidade` e do contrato com a escola.
- Datas do ENEM 2027 em `packages/engine/src/plan.ts`, quando sair o edital. Tire `estimated` da edição.
- Teste de carga com o número de alunos previsto.
