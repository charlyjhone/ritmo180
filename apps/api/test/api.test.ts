import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LightMyRequestResponse } from "fastify";
import type { ClassExamReport, DeletionRequestView, ExamResultView, ExamSittingView, ExamSummary, ItemSuggestionView, MistakeBook, Person, PracticeSessionPack, StudentDashboard, StudyPlan, SyncResult, TrainingCatalog } from "@ritmo/contracts";
import { normalizeItems, parseCanonicalJson } from "@ritmo/ingest";
import { buildApp } from "../src/app.ts";
import { openPglite } from "../src/platform/db-pglite.ts";
import { databaseRoleProblem, migrate } from "../src/platform/migrate.ts";
import type { Database } from "../src/platform/db.ts";
import { seedDemo, type DemoAccounts } from "../src/seed/demo.ts";
import { importBatch, releaseOfficialItems } from "../src/seed/install.ts";
import { enrichItems, generateItems, reviewItem, reviewQueue } from "../src/modules/content/index.ts";
import type { Llm } from "../src/platform/llm.ts";
import { runCalibration } from "../src/modules/calibration/index.ts";
import { NOT_GUEST_ATTEMPT, removeExpiredGuests } from "../src/modules/identity/index.ts";

const NOW = Date.parse("2026-10-20T15:00:00Z");
const PASSWORD = "senha-de-teste-123";
let db: Database;
let app: Awaited<ReturnType<typeof buildApp>>;
let a: DemoAccounts;

async function login(email: string): Promise<string> {
  const response = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: PASSWORD } });
  expect(response.statusCode).toBe(200);
  return response.cookies[0]!.value;
}

const as = (cookie: string) => ({
  get: (url: string) => app.inject({ method: "GET", url, cookies: { ritmo_session: cookie } }),
  post: (url: string, payload: object = {}) => app.inject({ method: "POST", url, payload, cookies: { ritmo_session: cookie } }),
  put: (url: string, payload: object) => app.inject({ method: "PUT", url, payload, cookies: { ritmo_session: cookie } }),
  patch: (url: string, payload: object) => app.inject({ method: "PATCH", url, payload, cookies: { ritmo_session: cookie } }),
});
const json = <T>(r: LightMyRequestResponse) => r.json<T>();

beforeAll(async () => {
  db = await openPglite();
  await migrate(db);
  a = await seedDemo(db, { now: NOW, password: PASSWORD, studentsPerClass: 6, days: 21 });
  app = await buildApp({ db, llm: null, now: () => NOW, secureCookies: false, loginAttemptsPerMinute: 1000 });
}, 120_000);
afterAll(async () => {
  await app.close();
  await db.close();
});

describe("acesso", () => {
  it("recusa senha errada e exige login", async () => {
    const wrong = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: a.student, password: "errada-errada" } });
    expect(wrong.statusCode).toBe(401);
    expect((await app.inject({ url: "/api/insights/student" })).statusCode).toBe(401);
  });

  it("cada perfil só entra na própria área", async () => {
    const student = as(await login(a.student));
    expect((await student.get("/api/insights/school")).statusCode).toBe(403);
    expect((await student.get("/api/insights/network")).statusCode).toBe(403);
    const guardian = as(await login(a.guardian));
    expect((await guardian.get("/api/insights/school")).statusCode).toBe(403);
    expect((await guardian.get("/api/insights/family")).statusCode).toBe(200);
  });

  it("direção não enxerga outra escola", async () => {
    const coordinator = as(await login(a.coordinator));
    expect((await coordinator.get(`/api/onboarding/${a.schoolId}`)).statusCode).toBe(200);
    expect((await coordinator.get(`/api/onboarding/${a.pendingSchoolId}`)).statusCode).toBe(403);
  });
});

const classmate = () => a.students.find((email) => email !== a.student)!;

describe("simulado do aluno", () => {
  it("monta a prova, impede outra em aberto e devolve a correção completa", async () => {
    const student = as(await login(classmate()));
    const made = json<{ sittingId: string; questions: number }>(await student.post("/api/exams/mine", { discipline: "Física", questions: 5 }));
    expect(made.questions).toBe(5);
    expect((await student.post("/api/exams/mine", { questions: 5 })).statusCode).toBe(409);

    const listed = json<ExamSummary[]>(await student.get("/api/exams")).find((e) => e.sitting?.id === made.sittingId)!;
    expect(listed).toMatchObject({ title: "Simulado de Física", mine: true });
    expect((await as(await login(a.student)).get(`/api/sittings/${made.sittingId}`)).statusCode).toBe(404);

    const view = json<ExamSittingView>(await student.get(`/api/sittings/${made.sittingId}`));
    expect(JSON.stringify(view)).not.toContain("solutionHtml");
    await student.put(`/api/sittings/${made.sittingId}/responses`, { position: 0, choice: "A", triage: "answered", timeMs: 40_000 });
    const result = json<ExamResultView>(await student.post(`/api/sittings/${made.sittingId}/finish`));
    expect(result.review).toHaveLength(5);
    expect(result.review[0]!.choice).toBe("A");
    expect(result.review[1]!.choice).toBeNull();
    expect(result.correct).toBe(result.review.filter((q) => q.choice === q.answer).length);
    expect(result.byTopic.reduce((sum, t) => sum + t.total, 0)).toBe(5);
    expect((await student.post("/api/exams/mine", { topic: "Óptica", questions: 5 })).statusCode).toBe(400);
    expect((await student.post("/api/exams/mine", { discipline: "Física", topic: "Assunto que não existe", questions: 5 })).statusCode).toBe(422);
  });
});

describe("caderno de erros e plano", () => {
  it("guarda o erro, deixa refazer e tira a questão ao acertar", async () => {
    const student = as(await login(classmate()));
    const pack = json<PracticeSessionPack>(await student.post("/api/practice/sessions", { minutes: 15 }));
    const item = pack.items[0]!;
    const attempt = (choice: string, sessionId: string, answeredAt: number) => ({
      id: randomUUID(), sessionId, itemId: item.id, mode: "guided", choice, totalMs: 100_000,
      phases: { readMs: 40_000, pathMs: 20_000, calcMs: 30_000, checkMs: 10_000 }, usedHint: false, hiddenMs: 0, position: 0, answeredAt,
    });
    const wrong = item.alternatives.find((x) => x.letter !== item.key.answer)!.letter;
    await student.post("/api/practice/sync", { attempts: [attempt(wrong, pack.sessionId, NOW - 60_000)] });

    const book = json<MistakeBook>(await student.get("/api/practice/mistakes"));
    const entry = book.questions.find((q) => q.itemId === item.id)!;
    expect(entry).toMatchObject({ choice: wrong, answer: item.key.answer });
    const filtered = json<MistakeBook>(await student.get(`/api/practice/mistakes?${new URLSearchParams({ disciplina: item.discipline, assunto: item.topic })}`));
    expect(filtered.questions.every((q) => q.topic === item.topic)).toBe(true);

    const redo = json<PracticeSessionPack>(await student.post("/api/practice/sessions", { minutes: 90, mistakes: true }));
    expect(redo.items.map((i) => i.id)).toContain(item.id);
    expect(redo.items.every((i) => book.questions.some((q) => q.itemId === i.id) || book.total > book.questions.length)).toBe(true);
    await student.post("/api/practice/sync", { attempts: [attempt(item.key.answer, redo.sessionId, NOW)] });
    expect(json<MistakeBook>(await student.get("/api/practice/mistakes")).questions.map((q) => q.itemId)).not.toContain(item.id);
  });

  it("mostra a contagem e o foco de cada dia até o ENEM", async () => {
    const student = as(await login(a.student));
    const plan = json<StudyPlan>(await student.get("/api/practice/plan"));
    expect(plan.enem).toMatchObject({ year: 2026, nextDay: "2026-11-08", daysLeft: 19 });
    expect(plan.days[0]!.date).toBe("2026-10-20");
    expect(plan.days.filter((d) => d.kind === "exam").map((d) => d.date)).toEqual(["2026-11-08"]);
    expect(plan.days.find((d) => d.date === "2026-11-07")!.kind).toBe("light");
    expect(json<StudentDashboard>(await student.get("/api/insights/student")).enem?.daysLeft).toBe(19);
  });
});

describe("treino", () => {
  it("deixa o aluno treinar a disciplina e o assunto que escolher", async () => {
    const student = as(await login(a.student));
    const { disciplines } = json<TrainingCatalog>(await student.get("/api/practice/catalog"));
    const fisica = disciplines.find((d) => d.discipline === "Física")!;
    expect(fisica.area).toBe("CN");
    expect(fisica.topics.reduce((sum, t) => sum + t.questions, 0)).toBe(fisica.questions);

    const byDiscipline = json<PracticeSessionPack>(await student.post("/api/practice/sessions", { minutes: 15, discipline: "Física" }));
    expect(byDiscipline.items.length).toBeGreaterThan(0);
    expect(new Set(byDiscipline.items.map((i) => i.discipline))).toEqual(new Set(["Física"]));

    const topic = fisica.topics[0]!.topic;
    const byTopic = json<PracticeSessionPack>(await student.post("/api/practice/sessions", { minutes: 15, discipline: "Física", topic }));
    expect(new Set(byTopic.items.map((i) => i.topic))).toEqual(new Set([topic]));

    expect((await student.post("/api/practice/sessions", { topic })).statusCode).toBe(400);
    const empty = json<PracticeSessionPack>(await student.post("/api/practice/sessions", { discipline: "Física", topic: "Assunto que não existe" }));
    expect(empty.items).toEqual([]);
    expect(empty.notice).toContain("desta escolha");
  });

  it("corrige no servidor, ignora reenvio e atualiza o painel", async () => {
    const student = as(await login(a.student));
    const before = json<StudentDashboard>(await student.get("/api/insights/student"));
    const pack = json<PracticeSessionPack>(await student.post("/api/practice/sessions", { mode: "guided", minutes: 15 }));
    expect(pack.items.length).toBeGreaterThan(0);
    const item = pack.items[0]!;
    const wrong = item.alternatives.find((x) => x.letter !== item.key.answer)!.letter;
    const attempt = {
      id: randomUUID(), sessionId: pack.sessionId, itemId: item.id, mode: "guided", choice: wrong, totalMs: 150_000,
      phases: { readMs: 60_000, pathMs: 30_000, calcMs: 50_000, checkMs: 10_000 }, usedHint: false, hiddenMs: 0, position: 0, answeredAt: NOW,
    };
    const first = json<SyncResult>(await student.post("/api/practice/sync", { attempts: [attempt] }));
    expect(first.accepted).toEqual([attempt.id]);
    const second = json<SyncResult>(await student.post("/api/practice/sync", { attempts: [attempt] }));
    expect(second.duplicates).toEqual([attempt.id]);
    const after = json<StudentDashboard>(await student.get("/api/insights/student"));
    expect(after.syncedAttempts).toBe(before.syncedAttempts + 1);
    const stored = await db.system((tx) => tx.query(`SELECT correct FROM attempts WHERE id = $1`, [attempt.id]));
    expect(stored[0]!.correct).toBe(false);
  });

  it("recusa sessão de outro aluno", async () => {
    const student = as(await login(a.student));
    const other = as(await login(a.students.find((s) => s !== a.student)!));
    const pack = json<PracticeSessionPack>(await student.post("/api/practice/sessions", { minutes: 15 }));
    const item = pack.items[0]!;
    const result = json<SyncResult>(await other.post("/api/practice/sync", {
      attempts: [{ id: randomUUID(), sessionId: pack.sessionId, itemId: item.id, mode: "guided", choice: "A", totalMs: 90_000, phases: null, usedHint: false, hiddenMs: 0, position: 0, answeredAt: NOW }],
    }));
    expect(result.rejected).toHaveLength(1);
  });

  it("marca tentativa rápida demais e tira do índice", async () => {
    const student = as(await login(a.student));
    const pack = json<PracticeSessionPack>(await student.post("/api/practice/sessions", { minutes: 15 }));
    const item = pack.items[0]!;
    const id = randomUUID();
    await student.post("/api/practice/sync", { attempts: [{ id, sessionId: pack.sessionId, itemId: item.id, mode: "guided", choice: item.key.answer, totalMs: 500, phases: null, usedHint: false, hiddenMs: 0, position: 0, answeredAt: NOW }] });
    const row = (await db.system((tx) => tx.query(`SELECT valid, flags FROM attempts WHERE id = $1`, [id])))[0]!;
    expect(row.valid).toBe(false);
    expect(row.flags).toContain("too_fast");
  });

  it("diagnóstico adaptativo encerra com nota", async () => {
    const student = as(await login(a.student));
    let step = json<any>(await student.post("/api/practice/diagnostic/CN"));
    expect(step.item).not.toBeNull();
    for (let i = 0; i < 40 && !step.done; i++) {
      step = json<any>(await student.post(`/api/practice/diagnostic/session/${step.sessionId}/answer`, { itemId: step.item.id, choice: "A", totalMs: 120_000 }));
    }
    expect(step.done).toBe(true);
    expect(step.score.area).toBe("CN");
    expect(step.answered).toBeGreaterThanOrEqual(12);
  });

  it("explica quando a área ainda não tem questões calibradas", async () => {
    const student = as(await login(a.student));
    const step = json<any>(await student.post("/api/practice/diagnostic/MT"));
    expect(step.unavailable).toMatch(/calibradas/);
  });
});

describe("simulado", () => {
  it("não entrega gabarito, controla o tempo e devolve análise", async () => {
    const student = as(await login(a.student));
    const exams = json<any[]>(await student.get("/api/exams"));
    expect(exams).toHaveLength(1);
    const { sittingId } = json<any>(await student.post(`/api/exams/${exams[0].id}/start`));
    const sitting = await student.get(`/api/sittings/${sittingId}`);
    expect(sitting.body).not.toMatch(/"answer"|"key"|"trap"/);
    const view = sitting.json<any>();
    for (let position = 0; position < view.items.length; position++) {
      const put = await student.put(`/api/sittings/${sittingId}/responses`, { position, choice: position % 5 === 4 ? null : "B", triage: position % 5 === 4 ? "skipped" : "answered", timeMs: 150_000 });
      expect(put.statusCode).toBe(200);
    }
    const result = json<any>(await student.post(`/api/sittings/${sittingId}/finish`));
    expect(result.total).toBe(view.items.length);
    expect(result.answered).toBeLessThan(result.total);
    expect(result.fatigue).toHaveLength(3);
    const late = await student.put(`/api/sittings/${sittingId}/responses`, { position: 0, choice: "A", triage: "answered", timeMs: 1000 });
    expect(late.statusCode).toBe(409);
  });
});

describe("leitura", () => {
  it("calcula a velocidade e recusa leitura implausível", async () => {
    const student = as(await login(a.student));
    const next = json<any>(await student.get("/api/reading/next"));
    expect(next.questions[0].answer).toBeUndefined();
    const result = json<any>(await student.post("/api/reading/submit", { textId: next.text.id, readMs: 3000, answers: [0, 0, 0, 0] }));
    expect(result.verdict).toBe("implausible_speed");
  });
});

describe("painéis", () => {
  it("professor vê mapa, gargalo e pode enviar trilha", async () => {
    const teacher = as(await login(a.teacher));
    const classes = json<any[]>(await teacher.get("/api/teacher/classes"));
    expect(classes.length).toBeGreaterThan(1);
    const board = json<any>(await teacher.get(`/api/teacher/classes/${classes[3].id}`));
    expect(board.heat.rows.length).toBe(classes[3].students);
    expect(board.time).not.toBeNull();
    const sent = await teacher.post("/api/teacher/assignments", { classId: classes[3].id, topic: "Eletricidade", title: "Trilha de Eletricidade" });
    expect(sent.statusCode).toBe(200);
  });

  it("recado do professor aparece para a família do aluno", async () => {
    const guardian = as(await login(a.guardian));
    const [child] = json<any[]>(await guardian.get("/api/insights/family"));
    const sent = await as(await login(a.teacher)).post("/api/teacher/notify-family", { studentId: child.id, message: "Vamos retomar a rotina." });
    expect(sent.statusCode).toBe(200);
    const [after] = json<any[]>(await guardian.get("/api/insights/family"));
    expect(after.note.body).toBe("Vamos retomar a rotina.");
  });

  it("questão descartada pelo professor sai do banco e do treino", async () => {
    const item = await db.system(async (tx) => (await tx.query(`SELECT id FROM items WHERE status = 'published' AND discipline = 'Física' LIMIT 1`))[0]!.id as string);
    await db.system((tx) => tx.query(`INSERT INTO item_flags (item_id, reason) VALUES ($1, 'teste de sinalização')`, [item]));
    const teacher = as(await login(a.teacher));
    const classes = json<any[]>(await teacher.get("/api/teacher/classes"));
    const board = json<any>(await teacher.get(`/api/teacher/classes/${classes[3].id}`));
    const flag = board.flags.find((f: any) => f.itemId === item);
    expect((await teacher.post(`/api/teacher/flags/${flag.id}`, { resolution: "retired" })).statusCode).toBe(200);
    const status = await db.system(async (tx) => (await tx.query(`SELECT status FROM items WHERE id = $1`, [item]))[0]!.status);
    expect(status).not.toBe("published");
  });

  it("família escreve para a coordenação e a direção recebe", async () => {
    const guardian = as(await login(a.guardian));
    const [child] = json<any[]>(await guardian.get("/api/insights/family"));
    expect((await guardian.post("/api/family/messages", { studentId: child.id, body: "Mensagem de teste." })).statusCode).toBe(200);
    const school = json<any>(await as(await login(a.coordinator)).get("/api/insights/school"));
    expect(school.messages.some((m: any) => m.body === "Mensagem de teste.")).toBe(true);
    expect(school.dataNotice).toMatch(/simulados/);
  });

  it("família não escreve sobre aluno de quem não é responsável", async () => {
    const guardian = as(await login(a.guardian));
    const other = await db.system(async (tx) => (await tx.query(`SELECT u.id FROM users u WHERE u.role = 'student' AND u.id NOT IN (SELECT student_id FROM guardian_links) LIMIT 1`))[0]!.id);
    expect((await guardian.post("/api/family/messages", { studentId: other, body: "Oi, tudo bem?" })).statusCode).toBe(403);
  });

  it("rede vê totais sem dado de aluno", async () => {
    const network = await as(await login(a.network)).get("/api/insights/network");
    const board = network.json<any>();
    expect(board.metrics.responses).toBeGreaterThan(100);
    expect(network.body).not.toContain(a.student);
  });
});

describe("implantação", () => {
  const CSV = `nome;email;turma;serie;email_responsavel;consentimento
Maria Clara;maria@horizonte.test;1ª A;1ª série;mae@horizonte.test;sim
Sem Termo;sem@horizonte.test;1ª A;1ª série;pai@horizonte.test;não
X;invalido;;9;nada;`;

  it("bloqueia liberação incompleta e libera só com consentimento", async () => {
    const network = as(await login(a.network));
    const id = a.pendingSchoolId;
    expect((await network.post(`/api/onboarding/${id}/release`)).statusCode).toBe(422);
    const preview = json<any>(await network.post(`/api/onboarding/${id}/roster/preview`, { filename: "a.csv", csv: CSV }));
    expect(preview.ready).toBe(2);
    expect(preview.problems).toHaveLength(1);
    const commit = json<any>(await network.post(`/api/onboarding/${id}/roster`, { filename: "a.csv", csv: CSV }));
    expect(commit.created).toBe(2);
    await network.patch(`/api/onboarding/${id}`, { terms: { dpaSigned: true, dpoContact: "dpo@horizonte.test" }, diagnostic: { date: "2026-11-05", scope: "Todas" } });

    const lines = commit.credentialsCsv.split("\n") as string[];
    const signIn = async (line: string) => {
      const [, email, password] = line.split(",");
      const r = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password } });
      const client = as(r.cookies[0]!.value);
      expect((await client.get("/api/insights/student")).json<any>().code).toBe("password_change");
      expect((await client.post("/api/auth/password", { current: password, next: "minha-senha-nova" })).statusCode).toBe(200);
      return client;
    };
    const consented = await signIn(lines[1]!);
    const noConsent = await signIn(lines[2]!);
    expect((await consented.get("/api/insights/student")).json<any>().code).toBe("school_not_released");
    expect((await network.post(`/api/onboarding/${id}/release`)).statusCode).toBe(200);
    expect((await consented.get("/api/insights/student")).statusCode).toBe(200);
    expect((await noConsent.get("/api/insights/student")).json<any>().code).toBe("consent_required");
  });
});

describe("conteúdo com IA", () => {
  const fake: Llm = {
    async json<T>(request: { schema: any }) {
      if (request.schema.properties.stemHtml) {
        return {
          contextHtml: "<p>Um ciclista percorre uma pista reta a velocidade constante.</p>", stemHtml: "<p>Qual grandeza permanece constante?</p>",
          alternatives: ["A", "B", "C", "D", "E"].map((letter, i) => ({ letter, html: `Opção ${i}`, trap: letter === "C" ? "" : "Erro comum" })),
          answer: "C", solutionHtml: "<p>Resolução.</p>", hint: "Pense na definição.",
        } as T;
      }
      return { answer: "C" } as T;
    },
  };

  it("só publica depois da revisão de uma pessoa", async () => {
    const report = await generateItems(db, fake, { area: "CN", discipline: "Física", topic: "Mecânica", count: 1 });
    expect(report.toReview).toBe(1);
    const queue = await db.system(reviewQueue);
    const id = queue[0]!.id;
    expect((await db.system((tx) => tx.query(`SELECT status FROM items WHERE id = $1`, [id])))[0]!.status).toBe("review");
    await db.system((tx) => reviewItem(tx, id, true, "Prof"));
    expect((await db.system((tx) => tx.query(`SELECT status FROM items WHERE id = $1`, [id])))[0]!.status).toBe("published");
  });
});

describe("complemento com IA", () => {
  it("sugere para questão oficial sem resolução, recusa figura e só preenche o que está vazio", async () => {
    const [example] = parseCanonicalJson(readFileSync(new URL("../../../packages/ingest/examples/exemplo-disciplinas.json", import.meta.url), "utf8")) as Record<string, unknown>[];
    const official = { ...example, source: "inep_official", rightsCleared: true, solutionHtml: "" };
    const batch = normalizeItems([
      { ...official, externalId: "ia-texto" },
      { ...official, externalId: "ia-figura", stemHtml: `<p>Veja a figura.</p><img src="data:image/png;base64,AAAA" alt="Figura">` },
    ]);
    expect(batch.rejected).toEqual([]);
    await importBatch(db, batch, "json", "teste");
    await releaseOfficialItems(db, "Teste");
    const idOf = (external: string) => db.system(async (tx) => (await tx.query(`SELECT id, answer, solution_html, alternatives FROM items WHERE external_id = $1`, [external]))[0]!);
    const target = await idOf("ia-texto");
    await db.system((tx) => tx.query(`UPDATE items SET solution_html = 'ja tem' WHERE status = 'published' AND solution_html = '' AND external_id NOT IN ('ia-texto', 'ia-figura')`));
    const prompts: string[] = [];
    const llm: Llm = {
      async json<T>(request: { prompt: string }) {
        prompts.push(request.prompt);
        return { solutionHtml: "<p>Passo a passo.</p><script>alert(1)</script>", hint: "Comece pelo enunciado.", traps: ["A", "B", "C", "D", "E"].map((letter) => ({ letter, trap: `Erro ${letter}` })) } as T;
      },
    };
    expect(await enrichItems(db, llm, 10)).toEqual({ suggested: 1, failed: 0 });
    expect(prompts[0]).toContain(`Gabarito oficial: ${target.answer}`);
    expect(await enrichItems(db, llm, 10)).toEqual({ suggested: 0, failed: 0 });

    expect((await as(await login(a.teacher)).get("/api/content/suggestions")).statusCode).toBe(403);
    const network = as(await login(a.network));
    const [suggestion] = json<ItemSuggestionView[]>(await network.get("/api/content/suggestions"));
    expect(suggestion!.itemId).toBe(target.id);
    expect(suggestion!.solutionHtml).not.toContain("script");
    expect(suggestion!.traps[target.answer as "A"]).toBeUndefined();
    expect((await idOf("ia-texto")).solution_html).toBe("");
    expect((await network.post(`/api/content/suggestions/${target.id}`, { approved: true })).statusCode).toBe(200);
    const updated = await idOf("ia-texto");
    expect(updated.solution_html).toContain("Passo a passo");
    expect(updated.alternatives.find((x: { letter: string }) => x.letter !== updated.answer).trap).toBeTruthy();
    expect(json<ItemSuggestionView[]>(await network.get("/api/content/suggestions"))).toEqual([]);
  });
});

describe("banco de produção", () => {
  it("recusa o papel que não enxergaria as linhas por causa do RLS", async () => {
    await expect(db.system(databaseRoleProblem)).resolves.toBeNull();
    const asRole = (attributes: string, member: boolean) => db.system(async (tx) => {
      const name = `papel_${randomUUID().replaceAll("-", "")}`;
      await tx.exec(`CREATE ROLE ${name} NOLOGIN ${attributes}`);
      if (member) await tx.exec(`GRANT app_user TO ${name}`);
      await tx.exec(`SET LOCAL ROLE ${name}`);
      const problem = await databaseRoleProblem(tx);
      await tx.exec(`RESET ROLE`);
      return problem;
    });
    expect(await asRole("NOBYPASSRLS", true)).toContain("BYPASSRLS");
    expect(await asRole("BYPASSRLS", false)).toContain("membro de app_user");
    expect(await asRole("BYPASSRLS", true)).toBeNull();
  });
});

describe("liberação de conteúdo", () => {
  it("só publica questão oficial depois da confirmação e registra quem confirmou", async () => {
    const [example] = parseCanonicalJson(readFileSync(new URL("../../../packages/ingest/examples/exemplo-disciplinas.json", import.meta.url), "utf8")) as Record<string, unknown>[];
    const batch = normalizeItems([{ ...example, externalId: "livro-teste-1", source: "inep_official", rightsCleared: false }]);
    expect(batch.rejected).toEqual([]);
    await importBatch(db, batch, "json", "teste");
    const row = () => db.system(async (tx) => (await tx.query(`SELECT status, rights_cleared, rights_note FROM items WHERE external_id = 'livro-teste-1'`))[0]!);
    expect((await row()).status).toBe("review");
    expect(await releaseOfficialItems(db, "Coordenação")).toBeGreaterThan(0);
    const released = await row();
    expect(released.status).toBe("published");
    expect(released.rights_cleared).toBe(true);
    expect(released.rights_note).toContain("Direitos confirmados por Coordenação.");
  });
});

describe("contas", () => {
  it("troca a senha, exige a senha atual e derruba as outras sessões", async () => {
    const email = a.students.at(-1)!;
    const first = await login(email);
    const second = as(await login(email));
    const client = as(first);
    expect((await client.post("/api/auth/password", { current: "errada-errada", next: "nova-senha-123" })).statusCode).toBe(422);
    expect((await client.post("/api/auth/password", { current: PASSWORD, next: "curta" })).statusCode).toBe(400);
    expect((await client.post("/api/auth/password", { current: PASSWORD, next: "nova-senha-123" })).statusCode).toBe(200);
    expect((await second.get("/api/me")).statusCode).toBe(401);
    expect((await client.get("/api/me")).statusCode).toBe(200);
    expect((await client.post("/api/auth/password", { current: "nova-senha-123", next: PASSWORD })).statusCode).toBe(200);
  });

  it("a coordenação gera senha provisória e a pessoa precisa trocá-la", async () => {
    const coordinator = as(await login(a.coordinator));
    const people = json<Person[]>(await coordinator.get(`/api/school/people?q=${encodeURIComponent(a.teacher)}`));
    expect(people).toHaveLength(1);
    const old = as(await login(a.teacher));
    const { temporaryPassword } = json<{ temporaryPassword: string }>(await coordinator.post(`/api/school/people/${people[0]!.id}/reset-password`));
    expect((await old.get("/api/me")).statusCode).toBe(401);
    const signedIn = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: a.teacher, password: temporaryPassword } });
    const teacher = as(signedIn.cookies[0]!.value);
    expect(json<any>(await teacher.get("/api/me")).blocked).toBe("password_change");
    expect((await teacher.get("/api/teacher/classes")).statusCode).toBe(403);
    await teacher.post("/api/auth/password", { current: temporaryPassword, next: PASSWORD });
    expect((await teacher.get("/api/teacher/classes")).statusCode).toBe(200);
    expect((await as(await login(a.teacher)).post(`/api/school/people/${people[0]!.id}/reset-password`)).statusCode).toBe(403);
  });
});

describe("autorização dos responsáveis", () => {
  it("a coordenação retira e registra o termo, e o acesso do aluno acompanha", async () => {
    const email = classmate();
    const coordinator = as(await login(a.coordinator));
    const [person] = json<Person[]>(await coordinator.get(`/api/school/people?q=${encodeURIComponent(email)}`));
    expect(person!.consentAt).not.toBeNull();
    const student = as(await login(email));
    expect((await coordinator.post(`/api/school/people/${person!.id}/consent`, { signed: false })).statusCode).toBe(200);
    expect(json<any>(await student.get("/api/me")).blocked).toBe("consent_required");
    expect((await student.get("/api/insights/student")).statusCode).toBe(403);
    expect((await as(await login(a.teacher)).post(`/api/school/people/${person!.id}/consent`, { signed: true })).statusCode).toBe(403);
    expect((await coordinator.post(`/api/school/people/${person!.id}/consent`, { signed: true })).statusCode).toBe(200);
    expect(json<any>(await student.get("/api/me")).blocked).toBeNull();
    const [after] = json<Person[]>(await coordinator.get(`/api/school/people?q=${encodeURIComponent(email)}`));
    expect(after!.consentAt).toBe(NOW);
  });
});

describe("visitante", () => {
  const DAY = 86_400_000;
  let guestApp: Awaited<ReturnType<typeof buildApp>>;
  beforeAll(async () => {
    guestApp = await buildApp({ db, llm: null, now: () => NOW, secureCookies: false, loginAttemptsPerMinute: 1000, guestAccess: true });
  });
  afterAll(() => guestApp.close());
  const enter = async () => (await guestApp.inject({ method: "POST", url: "/api/auth/visitante" })).cookies[0]!.value;
  const guest = (cookie: string) => ({
    get: (url: string) => guestApp.inject({ method: "GET", url, cookies: { ritmo_session: cookie } }),
    post: (url: string, payload: object = {}) => guestApp.inject({ method: "POST", url, payload, cookies: { ritmo_session: cookie } }),
  });

  it("fica desligado quando a escola não libera", async () => {
    expect((await app.inject({ method: "POST", url: "/api/auth/visitante" })).statusCode).toBe(404);
    expect(json<any>(await app.inject({ url: "/api/auth/opcoes" })).visitante).toBe(false);
    expect(json<any>(await guestApp.inject({ url: "/api/auth/opcoes" })).visitante).toBe(true);
  });

  it("entra sem dado pessoal, treina e não vê nada da escola", async () => {
    const visitor = guest(await enter());
    const me = json<any>(await visitor.get("/api/me"));
    expect(me).toMatchObject({ role: "student", blocked: null, guestUntil: NOW + 7 * DAY });
    expect(me.name).toMatch(/^Visitante \d{4}$/);
    const stored = await db.system((tx) => tx.query(`SELECT email, pass_hash FROM users WHERE id = $1`, [me.id]));
    expect(stored[0]).toEqual({ email: null, pass_hash: null });
    expect((await visitor.get("/api/insights/school")).statusCode).toBe(403);
    expect((await visitor.get(`/api/onboarding/${a.schoolId}`)).statusCode).toBe(403);
    const pack = json<PracticeSessionPack>(await visitor.post("/api/practice/sessions", { minutes: 15 }));
    expect(pack.items.length).toBeGreaterThan(0);
    expect((await visitor.get("/api/insights/student")).statusCode).toBe(200);
  });

  it("não entra na estatística das questões", async () => {
    const visitor = guest(await enter());
    const pack = json<PracticeSessionPack>(await visitor.post("/api/practice/sessions", { minutes: 15 }));
    const item = pack.items[0]!;
    const attempt = {
      id: randomUUID(), sessionId: pack.sessionId, itemId: item.id, mode: "guided", choice: item.key.answer, totalMs: 90_000,
      phases: { readMs: 40_000, pathMs: 20_000, calcMs: 20_000, checkMs: 10_000 }, usedHint: false, hiddenMs: 0, position: 0, answeredAt: NOW,
    };
    expect(json<SyncResult>(await visitor.post("/api/practice/sync", { attempts: [attempt] })).accepted).toEqual([attempt.id]);
    await runCalibration(db, NOW);
    const [stats] = await db.system((tx) => tx.query(`SELECT responses FROM item_stats WHERE item_id = $1`, [item.id]));
    const [real] = await db.system((tx) => tx.query(`SELECT count(*)::int AS n FROM attempts a WHERE item_id = $1 AND ${NOT_GUEST_ATTEMPT}`, [item.id]));
    expect(stats?.responses ?? 0).toBe(real!.n);
  });

  it("deixa uma turma inteira entrar junta pela mesma rede", async () => {
    const strict = await buildApp({ db, llm: null, now: () => NOW, secureCookies: false, loginAttemptsPerMinute: 10, guestAccess: true });
    const entries = await Promise.all(Array.from({ length: 20 }, () => strict.inject({ method: "POST", url: "/api/auth/visitante" })));
    expect(entries.map((r) => r.statusCode)).toEqual(Array(20).fill(200));
    await strict.close();
  });

  it("sair apaga o visitante e o que ele fez", async () => {
    const cookie = await enter();
    const visitor = guest(cookie);
    const { id } = json<any>(await visitor.get("/api/me"));
    await visitor.post("/api/practice/sessions", { minutes: 15 });
    expect((await visitor.post("/api/auth/logout")).statusCode).toBe(200);
    expect(await db.system((tx) => tx.query(`SELECT 1 FROM users WHERE id = $1`, [id]))).toEqual([]);
    expect(await db.system((tx) => tx.query(`SELECT 1 FROM practice_sessions WHERE student_id = $1`, [id]))).toEqual([]);
  });

  it("perde o acesso e é apagado quando o prazo acaba", async () => {
    const cookie = await enter();
    const later = await buildApp({ db, llm: null, now: () => NOW + 8 * DAY, secureCookies: false, loginAttemptsPerMinute: 1000, guestAccess: true });
    expect((await later.inject({ url: "/api/me", cookies: { ritmo_session: cookie } })).statusCode).toBe(401);
    await later.close();
    expect(await removeExpiredGuests(db, NOW + 8 * DAY)).toBeGreaterThan(0);
    expect(await db.system((tx) => tx.query(`SELECT 1 FROM users WHERE guest_expires_at IS NOT NULL`))).toEqual([]);
    expect((await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: a.student, password: PASSWORD } })).statusCode).toBe(200);
  });
});

describe("privacidade", () => {
  it("entrega a cópia dos dados e só ao próprio aluno ou ao responsável dele", async () => {
    const student = as(await login(a.student));
    const copy = json<any>(await student.get("/api/privacy/my-data"));
    expect(copy.pessoa.email).toBe(a.student);
    expect(copy.respostas.length).toBeGreaterThan(0);
    const guardian = as(await login(a.guardian));
    const [child] = json<{ id: string }[]>(await guardian.get("/api/insights/family"));
    expect((await guardian.get(`/api/privacy/my-data?studentId=${child!.id}`)).statusCode).toBe(200);
    const stranger = await db.system(async (tx) => (await tx.query(`SELECT id FROM users WHERE role = 'student' AND school_id = $1 AND id <> $2 LIMIT 1`, [a.schoolId, child!.id]))[0]!);
    expect((await guardian.get(`/api/privacy/my-data?studentId=${stranger.id}`)).statusCode).toBe(403);
    expect((await as(await login(a.coordinator)).get("/api/privacy/my-data")).statusCode).toBe(403);
  });

  it("a exclusão aprovada apaga a identidade e mantém as respostas sem nome", async () => {
    const email = a.students.at(-2)!;
    const student = as(await login(email));
    expect((await student.post("/api/privacy/deletion-requests")).statusCode).toBe(200);
    expect((await student.post("/api/privacy/deletion-requests")).statusCode).toBe(409);
    const coordinator = as(await login(a.coordinator));
    const [request] = json<DeletionRequestView[]>(await coordinator.get("/api/school/deletion-requests"));
    const id = await db.system(async (tx) => (await tx.query(`SELECT id FROM users WHERE email = $1`, [email]))[0]!.id);
    const before = await db.system((tx) => tx.query(`SELECT count(*)::int AS n FROM attempts WHERE student_id = $1`, [id]));
    expect((await coordinator.post(`/api/school/deletion-requests/${request!.id}`, { approved: true })).statusCode).toBe(200);
    const user = await db.system(async (tx) => (await tx.query(`SELECT name, email, pass_hash, anonymized_at FROM users WHERE id = $1`, [id]))[0]!);
    expect(user).toMatchObject({ name: "Aluno removido", email: null, pass_hash: null });
    expect(user.anonymized_at).not.toBeNull();
    expect((await student.get("/api/me")).statusCode).toBe(401);
    expect(await db.system((tx) => tx.query(`SELECT count(*)::int AS n FROM attempts WHERE student_id = $1`, [id]))).toEqual(before);
    expect((await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: PASSWORD } })).statusCode).toBe(401);
    expect(json<DeletionRequestView[]>(await coordinator.get("/api/school/deletion-requests"))).toEqual([]);
  });
});

describe("simulado do professor", () => {
  it("publica com foco, respeita a turma e mostra quem entregou", async () => {
    const teacher = as(await login(a.teacher));
    const [klass] = json<{ id: string }[]>(await teacher.get("/api/teacher/classes"));
    const made = json<{ id: string; questions: number }>(await teacher.post("/api/exams", { title: "Prova de Física", classId: klass!.id, discipline: "Física", questions: 4 }));
    expect(made.questions).toBe(4);
    expect((await teacher.post("/api/exams", { title: "Sem tamanho", classId: klass!.id })).statusCode).toBe(400);

    const other = await db.system(async (tx) => (await tx.query(`SELECT c.id FROM classes c WHERE c.school_id = $1 AND c.id NOT IN (SELECT class_id FROM class_teachers WHERE teacher_id = (SELECT id FROM users WHERE email = $2)) LIMIT 1`, [a.schoolId, a.teacher]))[0]);
    if (other) expect((await teacher.get(`/api/teacher/classes/${other.id}/exams`)).statusCode).toBe(403);
    expect((await as(await login(a.student)).get(`/api/teacher/classes/${klass!.id}/exams`)).statusCode).toBe(403);

    const enrolled = await db.system(async (tx) => (await tx.query(`SELECT u.email FROM class_students cs JOIN users u ON u.id = cs.student_id WHERE cs.class_id = $1 AND u.email IS NOT NULL LIMIT 1`, [klass!.id]))[0]!.email);
    const student = as(await login(enrolled));
    const { sittingId } = json<{ sittingId: string }>(await student.post(`/api/exams/${made.id}/start`));
    await student.put(`/api/sittings/${sittingId}/responses`, { position: 0, choice: "A", triage: "answered", timeMs: 30_000 });
    await student.post(`/api/sittings/${sittingId}/finish`);

    const reports = json<ClassExamReport[]>(await teacher.get(`/api/teacher/classes/${klass!.id}/exams`));
    const report = reports.find((r) => r.id === made.id)!;
    const row = report.students.find((s) => s.status === "finished")!;
    expect(row.answered).toBe(1);
    expect(report.weakestTopics.length).toBeGreaterThan(0);
  });
});

describe("meta semanal", () => {
  it("guarda a meta e conta as questões da semana", async () => {
    const student = as(await login(a.student));
    expect(json<StudentDashboard>(await student.get("/api/insights/student")).goal.target).toBe(35);
    expect((await student.put("/api/practice/goal", { questions: 70 })).statusCode).toBe(200);
    expect((await student.put("/api/practice/goal", { questions: 1 })).statusCode).toBe(400);
    const { goal } = json<StudentDashboard>(await student.get("/api/insights/student"));
    expect(goal.target).toBe(70);
    expect(goal.done).toBeGreaterThanOrEqual(0);
    await student.put("/api/practice/goal", { questions: 35 });
  });
});

describe("servidor", () => {
  it("responde HEAD e devolve 404 para rota inexistente", async () => {
    expect((await app.inject({ method: "HEAD", url: "/api/health" })).statusCode).toBe(200);
    expect((await app.inject({ url: "/api/nao-existe" })).statusCode).toBe(404);
  });
});

describe("laboratório virtual", () => {
  it("serve o laboratório em /laboratorio/ ao lado da interface", async () => {
    const { mkdtempSync, writeFileSync, mkdirSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const web = mkdtempSync(join(tmpdir(), "ritmo-web-"));
    const lab = mkdtempSync(join(tmpdir(), "ritmo-lab-"));
    writeFileSync(join(web, "index.html"), "<p>ritmo</p>");
    writeFileSync(join(lab, "index.html"), "<p>laboratorio</p>");
    mkdirSync(join(lab, "assets"));
    writeFileSync(join(lab, "assets", "app-abc.js"), "console.log(1)");
    const site = await buildApp({ db, llm: null, now: () => NOW, secureCookies: false, loginAttemptsPerMinute: 1000 }, { webRoot: web, labRoot: lab });
    try {
      const sem = await site.inject({ url: "/laboratorio" });
      expect(sem.statusCode).toBe(301);
      expect(sem.headers.location).toBe("/laboratorio/");
      const pagina = await site.inject({ url: "/laboratorio/" });
      expect(pagina.statusCode).toBe(200);
      expect(pagina.body).toContain("laboratorio");
      const js = await site.inject({ url: "/laboratorio/assets/app-abc.js" });
      expect(js.headers["cache-control"]).toContain("immutable");
      expect((await site.inject({ url: "/laboratorio/nao-existe.js" })).statusCode).toBe(404);
      expect((await site.inject({ url: "/treino" })).body).toContain("ritmo");
    } finally {
      await site.close();
    }
  });
});
