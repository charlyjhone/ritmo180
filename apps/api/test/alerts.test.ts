import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { ALERT_QUIET_MS, createAlerter, scrub } from "../src/platform/alerts.ts";
import type { Database } from "../src/platform/db.ts";

function recorder() {
  const sent: { url: string; body: string; type: string }[] = [];
  const send = (async (url: string, init: RequestInit) => {
    sent.push({ url, body: String(init.body), type: String((init.headers as Record<string, string>)["content-type"]) });
    return new Response(null);
  }) as unknown as typeof fetch;
  return { sent, send };
}

describe("aviso de erro", () => {
  it("sem endereço configurado não envia nada", () => {
    expect(() => createAlerter(undefined)("x", "y")).not.toThrow();
  });

  it("manda para o webhook e segura repetições por 15 minutos", () => {
    let now = 0;
    const { sent, send } = recorder();
    const alert = createAlerter("https://discord.com/api/webhooks/1/abc", { now: () => now, send });
    alert("500 GET /api/x", "erro 500 em GET /api/x");
    alert("500 GET /api/x", "erro 500 em GET /api/x");
    alert("500 GET /api/x", "erro 500 em GET /api/x");
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0]!.body).content).toContain("erro 500 em GET /api/x");
    now += ALERT_QUIET_MS;
    alert("500 GET /api/x", "erro 500 em GET /api/x");
    expect(sent).toHaveLength(2);
    expect(JSON.parse(sent[1]!.body).content).toContain("mais 2 iguais");
  });

  it("no ntfy manda texto simples", () => {
    const { sent, send } = recorder();
    createAlerter("https://ntfy.sh/ritmo-alertas", { send })("start", "servidor iniciado");
    expect(sent[0]!.type).toContain("text/plain");
    expect(sent[0]!.body).toContain("servidor iniciado");
  });

  it("tira e-mails, valores citados pelo banco, ids e números longos", () => {
    const text = scrub('duplicate key: Key (email)=(ana.souza@escola.com.br) id 3f2b1c4d-1a2b-4c3d-8e9f-0a1b2c3d4e5f cpf 12345678900 de joao@x.com');
    expect(text).not.toMatch(/ana\.souza|joao@|3f2b1c4d|12345678900/);
    expect(text).toContain("(e-mail)");
  });

  it("um erro 500 do servidor dispara o aviso com a rota, sem os dados", async () => {
    const fail = () => Promise.reject(new Error("conexão caiu para ana@escola.com"));
    const db = { tenant: fail, network: fail, system: fail, close: async () => {} } as unknown as Database;
    const alerts: string[] = [];
    const app = await buildApp({ db, llm: null, now: Date.now, secureCookies: false, loginAttemptsPerMinute: 10, alert: (_kind, text) => alerts.push(text) });
    const response = await app.inject({ method: "GET", url: "/api/health" });
    await app.close();
    expect(response.statusCode).toBe(500);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain("GET /api/health");
  });
});
