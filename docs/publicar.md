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

No plano gratuito do Supabase não há backup para baixar. Rode, no terminal onde a `DATABASE_URL` está configurada:

```bash
npm run backup
```

O comando copia todas as tabelas (menos as sessões de login) num instante só, grava em `~/Ritmo180-copias/` e restaura a cópia num banco vazio na memória para provar que ela volta inteira. Sai `COPIA_RITMO ok` quando deu certo. Para conferir de novo uma cópia antiga:

```bash
npm run backup -- conferir ~/Ritmo180-copias/NOME-DO-ARQUIVO.json.gz
```

O arquivo tem dados pessoais de alunos. Fica só no seu computador, legível só pelo seu usuário; não mande por e-mail nem suba para a nuvem sem criptografia. Faça uma cópia por semana durante o piloto e uma por dia com alunos usando.

Numa máquina com `pg_dump`, `DATABASE_URL=... scripts/backup-postgres.sh /caminho/dos/backups` faz a cópia no formato do Postgres e mantém as 14 mais recentes. No plano Pro do Supabase o backup diário passa a ser automático.

## 6. Aula nova para revisão

Aulas escritas em `content/aulas/` entram na fila de revisão da rede, sem publicar:

```bash
npm run content:aulas:importar
```

Depois, no painel da rede, leia e aprove cada uma.

## 7. Apostilas autorais para revisão

As apostilas em PDF (Física 30, Simulado de CN e Geografia 40) viram questões com `scripts/importar_apostilas.py`. Gráficos, tabelas e equações entram como recorte do próprio PDF. Só roda no Mac, porque lê o PDF com o PDFKit:

```bash
python3 -I scripts/importar_apostilas.py ~/Documents/"ENEM NOTA MIL" data/importacao/apostilas-autorais.json
```

Com `--revisar`, as questões novas vão para a fila de revisão da rede em vez de serem publicadas; uma questão já aprovada ou recusada mantém a decisão se for importada de novo:

```bash
DATABASE_URL=... npm run ingest -- data/importacao/apostilas-autorais.json --revisar
```

Depois, no painel da rede, confira enunciado, figura, alternativas e resolução de cada uma antes de aprovar.

## Antes de receber alunos

- Revisão jurídica da página `/privacidade` e do contrato com a escola.
- Datas do ENEM 2027 em `packages/engine/src/plan.ts`, quando sair o edital. Tire `estimated` da edição.
- Teste de carga com o número de alunos previsto: `npm run carga` mede o servidor sozinho; com `CARGA_URL`, `CARGA_EMAILS` e `CARGA_SENHA` de contas de uma escola de teste, mede o servidor publicado.

## Conexão cifrada com o banco

No Supabase o servidor confere o certificado do banco com a raiz `apps/api/certs/supabase-root-2021.pem`, que é a mesma do arquivo `prod-ca-2021.crt` do painel (SHA-256 `80:70:25:AD:…:E6:CA:FA`). O `sslmode` da `DATABASE_URL` é ignorado nesse caso. Em outro provedor, aponte a raiz em `DATABASE_SSL_CA_FILE`. Em emergência, `DATABASE_SSL_VERIFY=off` volta ao comportamento antigo.

## Aviso de erro

Com `RITMO_ALERTA_URL` configurada no Render, o servidor manda uma linha curta quando dá erro 500, quando há erro sem tratamento e quando reinicia. Serve um webhook do Discord, do Slack ou um tópico do ntfy.sh (aplicativo grátis no celular). O mesmo erro avisa no máximo uma vez a cada 15 minutos, e e-mails, ids e valores citados pelo banco saem do texto.

Para saber se o site saiu do ar, use também um monitor externo (UptimeRobot, por exemplo) chamando `/api/health` a cada 5 minutos.
