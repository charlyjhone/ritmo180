// Aviso de erro para quem cuida da plataforma: um webhook (Discord, Slack ou ntfy) recebe uma linha curta.
// Não vai dado de aluno: só a rota (o molde, sem ids), o tipo de erro e o começo da mensagem.

export type Alert = (kind: string, text: string) => void;

/** O mesmo tipo de erro avisa no máximo uma vez a cada 15 minutos, para não virar enxurrada. */
export const ALERT_QUIET_MS = 15 * 60_000;
const MAX_TEXT = 300;

/** Tira do texto o que pode ser dado pessoal: valores citados pelo banco, e-mails, ids e números longos. */
export function scrub(text: string): string {
  return text
    .replace(/=\([^)]*\)/g, "=(…)")
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "(e-mail)")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "(id)")
    .replace(/\d{6,}/g, "(número)")
    .replace(/"[^"]{40,}"/g, '"…"');
}

export function createAlerter(url: string | undefined, options: { now?: () => number; send?: typeof fetch; label?: string } = {}): Alert {
  if (!url) return () => {};
  const now = options.now ?? Date.now;
  const send = options.send ?? fetch;
  const label = options.label ?? "Ritmo 180";
  const last = new Map<string, number>();
  const muted = new Map<string, number>();
  const plain = /(^|\.)ntfy\./.test(new URL(url).hostname);
  return (kind, text) => {
    const at = now();
    const previous = last.get(kind);
    if (previous !== undefined && at - previous < ALERT_QUIET_MS) {
      muted.set(kind, (muted.get(kind) ?? 0) + 1);
      return;
    }
    last.set(kind, at);
    const skipped = muted.get(kind) ?? 0;
    muted.delete(kind);
    const line = `⚠️ ${label}: ${scrub(text).replace(/\s+/g, " ").slice(0, MAX_TEXT)}${skipped ? ` (mais ${skipped} iguais nos últimos 15 min)` : ""}`;
    const body = plain ? line : JSON.stringify({ content: line, text: line });
    void send(url, { method: "POST", headers: { "content-type": plain ? "text/plain; charset=utf-8" : "application/json" }, body, signal: AbortSignal.timeout(5_000) }).catch(() => {});
  };
}
