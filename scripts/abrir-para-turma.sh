#!/bin/sh
# Abre o Ritmo 180 deste computador para uma turma, por um link público temporário do Cloudflare.
# Os alunos entram com e-mail e senha; só entra quem tem a autorização do responsável registrada.
# "npm run turma -- visitante" libera também o acesso sem cadastro. Ctrl+C fecha tudo e o link para de funcionar.
# O computador precisa ficar ligado e conectado durante a aula.
set -eu
cd "$(dirname "$0")/.."
PATH="$HOME/.local/node/bin:$HOME/.local/bin:$PATH"
PORT="${PORT:-5180}"
VISITANTE=desligado
PATH_ALUNO=""
if [ "${1:-}" = "visitante" ]; then VISITANTE=ligado; PATH_ALUNO="/visitante"; fi
LOG="$(mktemp -t ritmo-tunel)"

if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
  echo "Já há um servidor na porta $PORT. Feche o Ritmo 180 aberto e rode este comando de novo."
  exit 1
fi
command -v cloudflared >/dev/null || { echo "Instale o cloudflared antes: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"; exit 1; }

echo "Montando o site..."
npm run -s build >/dev/null

RITMO_PROXY=sim RITMO_VISITANTE="$VISITANTE" PORT="$PORT" node apps/api/src/main.ts &
SERVER=$!
# caffeinate impede o Mac de dormir no meio da aula.
caffeinate -i -w "$SERVER" &
cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$PORT" >"$LOG" 2>&1 &
TUNNEL=$!
trap 'kill "$TUNNEL" "$SERVER" 2>/dev/null; rm -f "$LOG"; echo; echo "Ritmo 180 fechado para a turma."' INT TERM EXIT

URL=""
for _ in $(seq 1 60); do
  URL="$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG" | head -1 || true)"
  [ -n "$URL" ] && curl -fsS "$URL/api/health" >/dev/null 2>&1 && break
  URL=""
  sleep 1
done
[ -n "$URL" ] || { echo "O link público não respondeu. Veja a internet deste computador."; cat "$LOG"; exit 1; }

echo
echo "Link para os alunos (mande no grupo):"
echo
echo "  $URL$PATH_ALUNO"
echo
echo "Deixe esta janela aberta durante a aula. Ctrl+C fecha o acesso."
wait "$SERVER"
