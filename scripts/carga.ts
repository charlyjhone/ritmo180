// Teste de carga: uma turma inteira abrindo o painel e começando o treino ao mesmo tempo.
//
// Local (padrão): sobe a plataforma na memória com uma turma de demonstração e mede o servidor sozinho.
//   npm run carga
// Remoto: mede um servidor publicado com contas de teste reais (use uma escola de teste, nunca alunos de verdade).
//   CARGA_URL=https://... CARGA_EMAILS=a@x,b@x CARGA_SENHA=... npm run carga
//
// Opções: CARGA_ALUNOS (padrão 40) e CARGA_RODADAS (quantas vezes cada aluno repete o roteiro, padrão 3).
import { openPglite } from "../apps/api/src/platform/db-pglite.ts";
import { migrate } from "../apps/api/src/platform/migrate.ts";
import { buildApp } from "../apps/api/src/app.ts";
import { seedDemo } from "../apps/api/src/seed/demo.ts";

const STUDENTS = Number(process.env.CARGA_ALUNOS || 40);
const ROUNDS = Number(process.env.CARGA_RODADAS || 3);
/** O roteiro de um aluno que chega para estudar: painel, plano, catálogo, cartões e um treino novo. */
const SCRIPT: { name: string; method: "GET" | "POST"; url: string; body?: object }[] = [
  { name: "painel", method: "GET", url: "/api/insights/student" },
  { name: "plano", method: "GET", url: "/api/practice/plan" },
  { name: "catálogo", method: "GET", url: "/api/practice/catalog" },
  { name: "cartões", method: "GET", url: "/api/study/cards" },
  { name: "começar treino", method: "POST", url: "/api/practice/sessions", body: {} },
];

type Call = (method: "GET" | "POST", url: string, cookie: string | null, body?: object) => Promise<{ status: number; cookie?: string }>;

async function localTarget(): Promise<{ call: Call; emails: string[]; password: string; close: () => Promise<void> }> {
  const password = "carga-local-123";
  const db = await openPglite();
  await migrate(db);
  const accounts = await seedDemo(db, { now: Date.now(), password, studentsPerClass: STUDENTS, days: 21 });
  const app = await buildApp({ db, llm: null, now: Date.now, secureCookies: false, loginAttemptsPerMinute: 10_000 });
  const call: Call = async (method, url, cookie, body) => {
    const r = await app.inject({ method, url, payload: body, cookies: cookie ? { ritmo_session: cookie } : {} });
    return { status: r.statusCode, cookie: r.cookies.find((c) => c.name === "ritmo_session")?.value };
  };
  return { call, emails: accounts.students.slice(0, STUDENTS), password, close: async () => { await app.close(); await db.close(); } };
}

function remoteTarget(base: string): { call: Call; emails: string[]; password: string; close: () => Promise<void> } {
  const emails = (process.env.CARGA_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  const password = process.env.CARGA_SENHA ?? "";
  if (!emails.length || !password) throw new Error("No modo remoto, informe CARGA_EMAILS e CARGA_SENHA de contas de teste.");
  const call: Call = async (method, url, cookie, body) => {
    const r = await fetch(new URL(url, base), { method, headers: { "content-type": "application/json", ...(cookie ? { cookie: `ritmo_session=${cookie}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const set = r.headers.getSetCookie().find((c) => c.startsWith("ritmo_session="));
    await r.arrayBuffer();
    return { status: r.status, cookie: set?.split(";")[0]!.split("=")[1] };
  };
  return { call, emails, password, close: async () => {} };
}

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;

const base = process.env.CARGA_URL;
const target = base ? remoteTarget(base) : await localTarget();
console.log(base ? `Medindo ${base}` : "Medindo o servidor local, na memória (o banco de produção fica de fora desta medida)");

// Login um a um, como os alunos chegando na sala; cada conta remota pode servir a vários alunos simulados.
const cookies: string[] = [];
for (const email of target.emails.slice(0, STUDENTS)) {
  const r = await target.call("POST", "/api/auth/login", null, { email, password: target.password });
  if (r.status !== 200 || !r.cookie) throw new Error(`Login falhou (${r.status}) para uma das contas.`);
  cookies.push(r.cookie);
}

const times = new Map<string, number[]>();
const errors = new Map<string, number>();
const started = performance.now();
await Promise.all(Array.from({ length: STUDENTS }, async (_, i) => {
  const cookie = cookies[i % cookies.length]!;
  for (let round = 0; round < ROUNDS; round++) {
    for (const step of SCRIPT) {
      const t0 = performance.now();
      const r = await target.call(step.method, step.url, cookie, step.body).catch(() => ({ status: 0 }));
      const ms = performance.now() - t0;
      (times.get(step.name) ?? times.set(step.name, []).get(step.name)!).push(ms);
      if (r.status >= 400 || r.status === 0) errors.set(step.name, (errors.get(step.name) ?? 0) + 1);
    }
  }
}));
const total = (performance.now() - started) / 1000;
await target.close();

const all = [...times.values()].flat().sort((x, y) => x - y);
console.log(`\n${STUDENTS} alunos ao mesmo tempo, ${ROUNDS} rodadas cada: ${all.length} pedidos em ${total.toFixed(1)} s (${(all.length / total).toFixed(0)} por segundo)\n`);
console.log("etapa".padEnd(16), "mediana".padStart(9), "p95".padStart(9), "pior".padStart(9), "erros".padStart(7));
for (const [name, list] of times) {
  const s = [...list].sort((x, y) => x - y);
  console.log(name.padEnd(16), `${pct(s, 50).toFixed(0)} ms`.padStart(9), `${pct(s, 95).toFixed(0)} ms`.padStart(9), `${s.at(-1)!.toFixed(0)} ms`.padStart(9), String(errors.get(name) ?? 0).padStart(7));
}
console.log("geral".padEnd(16), `${pct(all, 50).toFixed(0)} ms`.padStart(9), `${pct(all, 95).toFixed(0)} ms`.padStart(9), `${all.at(-1)!.toFixed(0)} ms`.padStart(9), String([...errors.values()].reduce((a, b) => a + b, 0)).padStart(7));
