import { fileURLToPath } from "node:url";
import { buildApp } from "./app.ts";
import { createClaudeLlm } from "./platform/llm.ts";
import { openDatabase } from "./platform/open.ts";

const PORT = Number(process.env.PORT || 5180);
const isProduction = process.env.NODE_ENV === "production";

const db = await openDatabase();
const app = await buildApp(
  { db, llm: createClaudeLlm(), now: Date.now, secureCookies: isProduction, loginAttemptsPerMinute: 10 },
  { webRoot: fileURLToPath(new URL("../../web/dist", import.meta.url)), logger: isProduction },
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await app.close();
    await db.close();
    process.exit(0);
  });
}

await app.listen({ port: PORT, host: process.env.HOST || "127.0.0.1" });
console.log(`Ritmo 180 em http://localhost:${PORT}`);
