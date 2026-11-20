import { fileURLToPath } from "node:url";
import { buildApp } from "./app.ts";
import { createClaudeLlm } from "./platform/llm.ts";
import { openDatabase } from "./platform/open.ts";
import { createAlerter } from "./platform/alerts.ts";
import { removeExpiredGuests } from "./modules/identity/index.ts";

const PORT = Number(process.env.PORT || 5180);
const isProduction = process.env.NODE_ENV === "production";
const guestAccess = process.env.RITMO_VISITANTE !== "desligado";
const behindProxy = isProduction || process.env.RITMO_PROXY === "sim";
const GUEST_CLEANUP_MS = 6 * 3_600_000;

// RITMO_ALERTA_URL: webhook do Discord, do Slack ou um tópico do ntfy.sh que recebe os avisos de erro.
const alert = createAlerter(process.env.RITMO_ALERTA_URL);
process.on("unhandledRejection", (reason) => {
  console.error("Promessa rejeitada sem tratamento", reason);
  alert("unhandled", `erro sem tratamento no servidor: ${reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason)}`);
});

const db = await openDatabase();
const app = await buildApp(
  { db, llm: createClaudeLlm(), now: Date.now, secureCookies: isProduction, loginAttemptsPerMinute: 10, guestAccess, behindProxy, alert },
  {
    webRoot: fileURLToPath(new URL("../../web/dist", import.meta.url)),
    labRoot: fileURLToPath(new URL("../../lab/dist", import.meta.url)),
    logger: isProduction,
  },
);

const cleanup = () => void removeExpiredGuests(db, Date.now()).catch((error) => {
  console.error("Limpeza de visitantes falhou", error);
  alert("guest-cleanup", `a limpeza de visitantes falhou: ${error instanceof Error ? error.message : String(error)}`);
});
cleanup();
setInterval(cleanup, GUEST_CLEANUP_MS).unref();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await app.close();
    await db.close();
    process.exit(0);
  });
}

await app.listen({ port: PORT, host: process.env.HOST || "127.0.0.1" });
if (isProduction) alert("start", "servidor iniciado (deploy novo ou reinício depois de uma queda).");
console.log(`Ritmo 180 em http://localhost:${PORT}`);
