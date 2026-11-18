import { fileURLToPath } from "node:url";
import { buildApp } from "./app.ts";
import { createClaudeLlm } from "./platform/llm.ts";
import { openDatabase } from "./platform/open.ts";
import { removeExpiredGuests } from "./modules/identity/index.ts";

const PORT = Number(process.env.PORT || 5180);
const isProduction = process.env.NODE_ENV === "production";
const guestAccess = process.env.RITMO_VISITANTE !== "desligado";
const behindProxy = isProduction || process.env.RITMO_PROXY === "sim";
const GUEST_CLEANUP_MS = 6 * 3_600_000;

const db = await openDatabase();
const app = await buildApp(
  { db, llm: createClaudeLlm(), now: Date.now, secureCookies: isProduction, loginAttemptsPerMinute: 10, guestAccess, behindProxy },
  {
    webRoot: fileURLToPath(new URL("../../web/dist", import.meta.url)),
    logger: isProduction,
  },
);

const cleanup = () => void removeExpiredGuests(db, Date.now()).catch((error) => console.error("Limpeza de visitantes falhou", error));
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
console.log(`Ritmo 180 em http://localhost:${PORT}`);
