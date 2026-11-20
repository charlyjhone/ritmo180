// Contratos HTTP entre interface e servidor. Entradas validadas com zod; saídas tipadas.
import { z } from "zod";
import { AREAS, GRADES, type Area, type Role } from "./taxonomy.ts";
import { LETTERS, type Letter, type PracticeAnswerKey, type PracticeItem } from "./item.ts";

export const CONFIDENCES = ["sure", "think", "guess"] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const LoginInput = z.object({ email: z.string().email().max(160), password: z.string().min(8).max(200) });

export interface Me {
  id: string;
  name: string;
  role: Role;
  school: { id: string; name: string; brandColor: string; isDemo: boolean; released: boolean } | null;
  grade: string | null;
  className: string | null;
  /** Motivo pelo qual o aluno ainda não pode usar a plataforma. */
  blocked: "school_not_released" | "consent_required" | "password_change" | null;
  /** Visitante sem cadastro: quando o acesso e os dados dele são apagados. */
  guestUntil: number | null;
}

export const ChangePasswordInput = z.object({ current: z.string().min(1).max(200), next: z.string().min(8, "Use pelo menos 8 caracteres.").max(200) });

export interface Person {
  id: string;
  name: string;
  email: string | null;
  role: Role;
  className: string | null;
  /** Turmas do aluno (uma) ou do professor (várias). */
  classes: { id: string; name: string }[];
  /** Só para família: os alunos ligados à conta. */
  students: { id: string; name: string }[];
  /** Só para aluno: quando a escola registrou a autorização assinada pelo responsável. */
  consentAt: number | null;
  active: boolean;
}

export interface SchoolClass {
  id: string;
  name: string;
  grade: string;
}

const personName = z.string().trim().min(3, "Escreva o nome completo.").max(120);
const personEmail = z.string().trim().toLowerCase().email("E-mail inválido.").max(160);
const className = z.string().trim().min(1, "Escreva a turma.").max(40);
const grade = z.enum(GRADES);
const ids = z.array(z.string().uuid()).max(40);

/** A coordenação cadastra uma pessoa por vez. A senha provisória volta uma única vez. */
export const CreatePersonInput = z.discriminatedUnion("role", [
  z.object({ role: z.literal("student"), name: personName, email: personEmail, className, grade, guardianEmail: personEmail, consent: z.boolean() }),
  z.object({ role: z.literal("teacher"), name: personName, email: personEmail, classIds: ids }),
  z.object({ role: z.literal("guardian"), name: personName, email: personEmail, studentIds: ids.min(1, "Escolha pelo menos um aluno.") }),
  z.object({ role: z.literal("coordinator"), name: personName, email: personEmail }),
]);
export type CreatePerson = z.infer<typeof CreatePersonInput>;

/** Só os campos que valem para o perfil da pessoa são aplicados. */
export const UpdatePersonInput = z.object({
  name: personName.optional(),
  className: className.optional(),
  grade: grade.optional(),
  classIds: ids.optional(),
  studentIds: ids.min(1, "Escolha pelo menos um aluno.").optional(),
});
export type UpdatePerson = z.infer<typeof UpdatePersonInput>;

export const ActiveInput = z.object({ active: z.boolean() });

export const CreateCoordinatorInput = z.object({ name: personName, email: personEmail });

export interface CreatedPerson {
  id: string;
  temporaryPassword: string;
}

/** A coordenação registra a autorização assinada pelo responsável, ou a retira. */
export const ConsentInput = z.object({ signed: z.boolean() });

export const DeletionRequestInput = z.object({ studentId: z.string().uuid().optional() });
export const ResolveDeletionInput = z.object({ approved: z.boolean() });

export interface DeletionRequestView {
  id: string;
  student: string;
  requester: string;
  createdAt: number;
}

export interface ItemSuggestionView {
  itemId: string;
  discipline: string;
  topic: string;
  answer: Letter;
  questionHtml: string;
  solutionHtml: string;
  traps: Partial<Record<Letter, string>>;
  hint: string;
}

export const GoalInput = z.object({ questions: z.number().int().min(5).max(500) });

export const PhaseTimesSchema = z.object({
  readMs: z.number().int().min(0).max(7_200_000),
  pathMs: z.number().int().min(0).max(7_200_000),
  calcMs: z.number().int().min(0).max(7_200_000),
  checkMs: z.number().int().min(0).max(7_200_000),
});

export const PRACTICE_MODES = ["guided", "exam", "diagnostic"] as const;
export type PracticeModeName = (typeof PRACTICE_MODES)[number];

export type PhaseTimes = z.infer<typeof PhaseTimesSchema>;

export const AttemptInput = z.object({
  /** Gerado no aparelho: reenviar a mesma tentativa não cria duplicata. */
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  itemId: z.string().uuid(),
  mode: z.enum(PRACTICE_MODES),
  choice: z.enum(LETTERS),
  totalMs: z.number().int().min(0).max(14_400_000),
  phases: PhaseTimesSchema.nullable(),
  usedHint: z.boolean(),
  hiddenMs: z.number().int().min(0).max(14_400_000),
  position: z.number().int().min(0).max(500),
  answeredAt: z.number().int().positive(),
  /** Quanta certeza o aluno tinha. Ausente nas tentativas guardadas no aparelho antes desta pergunta existir. */
  confidence: z.enum(CONFIDENCES).nullish(),
});
export type AttemptInput = z.infer<typeof AttemptInput>;

export const MISS_REASONS = ["content", "calc", "reading", "distraction"] as const;
export type MissReason = (typeof MISS_REASONS)[number];
export const MISS_REASON_LABELS: Record<MissReason, string> = { content: "Não sabia o conteúdo", calc: "Errei a conta", reading: "Li errado o enunciado", distraction: "Me distraí" };
export const MissReasonInput = z.object({ attemptId: z.string().uuid(), itemId: z.string().uuid(), reason: z.enum(MISS_REASONS) });
export type MissReasonInput = z.infer<typeof MissReasonInput>;

/** O aluno avisa que a questão parece ter erro; vira um item na fila de revisão do professor. */
export const ITEM_PROBLEMS = ["answer", "statement", "image", "other"] as const;
export type ItemProblem = (typeof ITEM_PROBLEMS)[number];
export const ITEM_PROBLEM_LABELS: Record<ItemProblem, string> = { answer: "O gabarito parece errado", statement: "O enunciado está confuso ou incompleto", image: "Falta imagem, gráfico ou tabela", other: "Outro problema" };
export const ItemReportInput = z.object({ itemId: z.string().uuid(), problem: z.enum(ITEM_PROBLEMS) });
export type ItemReportInput = z.infer<typeof ItemReportInput>;

/** Pede uma questão parecida com a que o aluno acabou de errar. */
export const SiblingRequest = z.object({ sessionId: z.string().uuid(), itemId: z.string().uuid(), exclude: z.array(z.string().uuid()).max(200).default([]) });

export const CONFIDENCE_LABELS: Record<Confidence, string> = { sure: "Tenho certeza", think: "Acho que sim", guess: "Chutei" };

export const SyncInput = z.object({ attempts: z.array(AttemptInput).min(1).max(500) });
export const NextSessionInput = z
  .object({
    mode: z.enum(["guided", "exam"]).default("guided"),
    minutes: z.number().int().min(5).max(90).default(25),
    discipline: z.string().min(1).max(60).optional(),
    topic: z.string().min(1).max(160).optional(),
    /** Refaz só as questões do caderno de erros. */
    mistakes: z.boolean().default(false),
  })
  .refine((input) => !input.topic || input.discipline, { message: "Escolha a disciplina do assunto." });

export interface TrainingCatalog {
  disciplines: { area: Area; discipline: string; questions: number; topics: { topic: string; questions: number }[] }[];
}

export interface PlannedBlockView {
  kind: string;
  title: string;
  reason: string;
  minutes: number;
  itemIds: string[];
}

export interface PracticeSessionPack {
  sessionId: string;
  mode: "guided" | "exam";
  blocks: PlannedBlockView[];
  items: (PracticeItem & { key: PracticeAnswerKey; reason: string })[];
  /** Explica quando faltam questões para o tempo pedido. */
  notice: string | null;
}

export interface SyncResult {
  accepted: string[];
  duplicates: string[];
  rejected: { id: string; reason: string }[];
}

export interface ScoreView {
  area: Area;
  score: number | null;
  low: number | null;
  high: number | null;
  provisional: boolean;
  items: number;
  neededItems: number;
}

export interface TimeBreakdown {
  readMs: number;
  pathMs: number;
  calcMs: number;
  checkMs: number;
  samples: number;
}

export interface StudentDashboard {
  student: { name: string; grade: string | null; className: string | null };
  ritmo: { index: number | null; samples: number; weekDelta: number | null; weekly: (number | null)[] };
  time: { avgSeconds: number | null; goalSeconds: number; breakdown: TimeBreakdown | null; diagnosis: string | null; bottleneck: string | null };
  scores: ScoreView[];
  streak: { current: number; best: number };
  skills: { topic: string; discipline: string; stage: number; stageName: string; mastery: number; attempts: number }[];
  gaps: { name: string; grade: string; errorShare: number; errors: number }[];
  plan: PlannedBlockView[];
  diagnosticPending: Area[];
  syncedAttempts: number;
  enem: StudyPlan["enem"];
  goal: { target: number; done: number; trainedToday: boolean };
  reviews: { due: number; upcoming: number };
  /** Conselho a partir dos motivos que o aluno deu para os próprios erros. */
  missAdvice: { dominant: MissReason; share: number; total: number; advice: string; action: { label: string; to: string } } | null;
  /** Cartões de memorização para rever hoje. */
  cards: { due: number };
  assignments: StudentAssignment[];
  challenge: ClassChallenge | null;
  /** Assuntos para rever na reta final; nulo fora dela. */
  finalStretch: { daysLeft: number; topics: { discipline: string; topic: string; mastery: number }[] } | null;
}

export interface StudentAssignment {
  id: string;
  title: string;
  discipline: string;
  topic: string;
  teacher: string;
  dueOn: string | null;
  questions: number;
  done: number;
}

/** Desafio coletivo da semana: premia constância, sem ranking entre colegas. */
export interface ClassChallenge {
  className: string;
  target: number;
  done: number;
  students: number;
  /** Colegas que treinaram em pelo menos 3 dias da semana. */
  steady: number;
  steadyDays: number;
}

export const ReadingSubmit = z.object({
  textId: z.string().uuid(),
  readMs: z.number().int().min(0).max(3_600_000),
  answers: z.array(z.number().int().min(0).max(4)).length(4),
});

export interface ReadingNext {
  text: { id: string; title: string; body: string; words: number; grade: string };
  questions: { kind: string; prompt: string; options: string[] }[];
  history: { validPpm: number | null; firstPpm: number | null; comprehension: number | null; weakKind: string | null; goalPpm: number | null };
}

export interface ReadingResultView {
  ppm: number;
  score: number;
  verdict: "valid" | "low_comprehension" | "implausible_speed";
  goalPpm: number | null;
  review: { kind: string; correct: boolean; why: string }[];
}

export const ExamResponseInput = z.object({
  position: z.number().int().min(0).max(200),
  choice: z.enum(LETTERS).nullable(),
  triage: z.enum(["answered", "later", "skipped"]),
  timeMs: z.number().int().min(0).max(18_000_000),
});

export const CreateExamInput = z.object({
  title: z.string().min(3).max(120),
  classId: z.string().uuid(),
  /** Prova por blocos de área. Sem ela, valem o foco e `questions`, distribuídas entre as áreas disponíveis. */
  parts: z.array(z.object({ area: z.enum(AREAS), discipline: z.string().optional(), count: z.number().int().min(1).max(90) })).min(1).optional(),
  area: z.enum(AREAS).optional(),
  discipline: z.string().min(1).max(80).optional(),
  topic: z.string().min(1).max(160).optional(),
  questions: z.number().int().min(1).max(90).optional(),
}).refine((input) => input.parts || input.questions, { message: "Informe quantas questões a prova deve ter." });

export interface ClassExamReport {
  id: string;
  title: string;
  questions: number;
  createdAt: number;
  /** Do pior para o melhor: é por onde a aula de revisão começa. */
  weakestTopics: { topic: string; correctPct: number }[];
  students: { id: string; name: string; status: "pending" | "started" | "finished"; answered: number; correct: number }[];
}

export const CreateMyExamInput = z
  .object({
    area: z.enum(AREAS).optional(),
    discipline: z.string().min(1).max(60).optional(),
    topic: z.string().min(1).max(160).optional(),
    questions: z.number().int().min(5).max(90),
  })
  .refine((input) => !input.topic || input.discipline, { message: "Escolha a disciplina do assunto." });

export interface ExamSummary {
  id: string;
  title: string;
  questions: number;
  durationMinutes: number;
  /** Montado pelo próprio aluno, e não publicado para a turma. */
  mine: boolean;
  sitting: { id: string; finished: boolean } | null;
}

/** Questão com a resposta do aluno, usada na correção da prova e no caderno de erros. */
export interface ReviewedQuestion {
  discipline: string;
  topic: string;
  contextHtml: string;
  stemHtml: string;
  alternatives: { letter: Letter; html: string; trap?: string }[];
  answer: Letter;
  choice: Letter | null;
  solutionHtml: string;
}

export interface MistakeBook {
  /** Questões para rever hoje: erros a refazer e revisões espaçadas vencidas. */
  total: number;
  topics: { discipline: string; topic: string; count: number }[];
  /** Questões que já foram refeitas e voltam numa data futura. */
  upcoming: { count: number; nextDueAt: number | null };
  questions: (ReviewedQuestion & {
    itemId: string;
    /** Quantas vezes errou. */
    times: number;
    lastWrongAt: number | null;
    /** `redo`: refazer; `spaced`: revisão espaçada, a `step + 1` de REVIEW_STEPS. */
    kind: "redo" | "spaced";
    step: number;
    sureMiss: boolean;
    guessed: boolean;
  })[];
}

export const REVIEW_STEPS = 3;

export interface StudyPlan {
  /** `estimated` indica que o edital ainda não saiu. */
  enem: { year: number; nextDay: string; daysLeft: number; days: readonly string[]; estimated: boolean } | null;
  /** Nos últimos 30 dias o plano só revisa assuntos já vistos que ainda pesam. */
  finalStretch: boolean;
  days: { date: string; kind: "focus" | "simulado" | "light" | "exam"; discipline?: string; topic?: string; areas?: readonly Area[]; done?: boolean }[];
}

export interface ExamSittingView {
  id: string;
  title: string;
  startedAt: number;
  durationSeconds: number;
  secondsPerQuestion: number;
  items: Omit<PracticeItem, "targetSeconds">[];
  responses: { position: number; choice: Letter | null; triage: "answered" | "later" | "skipped"; timeMs: number }[];
  serverNow: number;
}

export interface ExamResultView {
  title: string;
  scores: ScoreView[];
  avgSeconds: number;
  secondsPerQuestion: number;
  answered: number;
  total: number;
  fatigue: { label: string; accuracy: number | null }[];
  whatIf: { gain: number; title: string; detail: string }[];
  incoherent: { number: number; difficulty: string; hit: boolean; time: string; note: string }[];
  correct: number;
  byTopic: { discipline: string; topic: string; correct: number; total: number; avgSeconds: number }[];
  review: (ReviewedQuestion & { number: number; seconds: number })[];
}

export const DiagnosticAnswer = z.object({ itemId: z.string().uuid(), choice: z.enum(LETTERS), totalMs: z.number().int().min(0).max(3_600_000) });

export interface DiagnosticStep {
  sessionId: string;
  done: boolean;
  answered: number;
  item: Omit<PracticeItem, "targetSeconds"> | null;
  score: ScoreView | null;
  unavailable: string | null;
}

export interface ClassRef {
  id: string;
  name: string;
  grade: string;
  subject: string | null;
  students: number;
}

export interface TeacherDashboard {
  class: ClassRef;
  headline: string;
  metrics: { ritmo: number | null; ritmoDelta: number | null; avgSeconds: number | null; goalSeconds: number; score: ScoreView | null; activeWeek: number; total: number; inactive: number };
  heat: { topics: string[]; rows: { studentId: string; name: string; cells: (number | null)[]; ritmo: number | null }[] };
  time: TimeBreakdown | null;
  suggestion: string | null;
  traps: { name: string; where: string; share: number }[];
  alerts: { studentId: string; name: string; why: string; action: "ver_trilha" | "enviar_sprints" | "avisar_familia"; severity: "high" | "medium"; talk: string }[];
  /** Habilidades da Matriz do ENEM em que a turma mais erra. */
  skills: { area: Area; skill: string; accuracy: number; answers: number; topics: string[] }[];
  assignments: { id: string; title: string; topic: string; dueOn: string | null; questions: number; completed: number; total: number; studentName: string | null }[];
  challenge: ClassChallenge;
  flags: { id: string; itemId: string; label: string; area: string; why: string }[];
  assignableTopics: { topic: string; discipline: string; items: number }[];
}

export const CreateAssignment = z.object({
  classId: z.string().uuid(),
  topic: z.string().min(1),
  title: z.string().min(3).max(120),
  studentId: z.string().uuid().optional(),
  questions: z.number().int().min(1).max(100).default(10),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use uma data válida.").optional(),
});
export const ResolveFlag = z.object({ resolution: z.enum(["kept", "retired"]) });
export const NotifyFamily = z.object({ studentId: z.string().uuid(), message: z.string().min(3).max(500) });

export interface SchoolDashboard {
  school: { name: string };
  headline: string;
  metrics: { activeWeek: number; enrolled: number; ritmoHigh: number | null; ritmoDelta: number | null; prereqNinth: number | null; flagsOpen: number };
  grades: { grade: string; prereq: number | null; ppm: number | null; comprehension: number | null; ritmo: number | null; students: number }[];
  insight: string | null;
  gaps: { name: string; grade: string; students: number; areas: string }[];
  areas: { area: Area; name: string; score: number | null; delta: number | null; provisional: boolean; students: number }[];
  classes: { name: string; students: number; active: number; ritmo: number | null; avgSeconds: number | null; delta: number | null }[];
  messages: { id: string; from: string; student: string; body: string; at: number; read: boolean }[];
  dataNotice: string | null;
  /** Uso da plataforma: onde os alunos param e o que usam, para acompanhar o piloto. */
  usage: SchoolUsage;
}

export interface SchoolUsage {
  /** Do cadastro ao hábito, cada etapa contada em alunos. */
  funnel: { label: string; students: number; note: string }[];
  /** Alunos que usaram cada ferramenta nos últimos 7 dias. */
  tools: { label: string; students: number }[];
  /** Já treinaram, mas não nos últimos 7 dias. */
  stalled: number;
  /** Alunos com conta ativa que já fizeram o diagnóstico de alguma área. */
  diagnostic: number;
}

export interface FamilyChild {
  id: string;
  name: string;
  grade: string | null;
  headline: string;
  stats: { label: string; value: string; delta: string | null }[];
  week: { day: string; trained: boolean }[];
  goalDays: number;
  evolution: { title: string; points: { label: string; value: number }[] } | null;
  note: { from: string; initials: string; body: string } | null;
  help: string;
  agenda: { day: string; month: string; title: string; detail: string }[];
}

export const FamilyMessageInput = z.object({ studentId: z.string().uuid(), body: z.string().min(3).max(1000) });

export interface NetworkDashboard {
  headline: string;
  metrics: { schools: number; onboarding: number; activeStudents: number; activeDelta: number; items: number; official: number; generated: number; authored: number; responses: number };
  funnel: { name: string; count: number; note: string }[];
  schools: { id: string; name: string; city: string; grades: string; active: number | null; ritmo: number | null; ownBrand: boolean; status: string; isDemo: boolean }[];
  bank: { area: Area; name: string; official: number; calibrated: number; calibrating: number; catalogOnly: number }[];
  calibration: { model: string; calibrated: number; calibrating: number; reclassified: number; discarded: number };
  integrity: { share: number; tooFast: number; awayThenPerfect: number; guessStreak: number; responses: number };
  /** Assuntos com poucas questões publicadas: onde o próximo lote de conteúdo rende mais. */
  thinTopics: { threshold: number; total: number; topics: { discipline: string; topic: string; items: number; hasLesson: boolean }[] };
}

export const CreateSchool = z.object({
  name: z.string().min(3).max(120),
  city: z.string().min(2).max(120),
  grades: z.string().min(2).max(60),
});

export interface OnboardingState {
  schoolId: string;
  school: { name: string; city: string; grades: string; slug: string; brandColor: string; hasLogo: boolean };
  terms: { dpaSigned: boolean; dpoContact: string; dataIsolation: boolean };
  consent: { accepted: number; total: number };
  roster: { students: number; teachers: number; pendingEmail: number; lastFile: string | null };
  /** Contas da coordenação: a rede cadastra pela implantação, e a coordenação cuida do resto em Pessoas. */
  coordinators: { id: string; name: string; email: string }[];
  accommodations: { id: string; student: string; className: string; kind: string; extraMinutes: number; targetSeconds: number; resources: string }[];
  students: { id: string; name: string; className: string }[];
  diagnostic: { date: string | null; scope: string };
  released: boolean;
  blockers: string[];
}

export const UpdateOnboardingInput = z.object({
  school: z.object({ name: z.string().min(3).max(120), slug: z.string().regex(/^[a-z0-9-]{2,40}$/), brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/), grades: z.string().min(2).max(60) }).optional(),
  terms: z.object({ dpaSigned: z.boolean(), dpoContact: z.string().max(160) }).optional(),
  diagnostic: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), scope: z.string().max(60) }).optional(),
});

export type UpdateOnboarding = z.infer<typeof UpdateOnboardingInput>;

export const ImportRoster = z.object({ filename: z.string().max(160), csv: z.string().min(1).max(5_000_000) });

export interface RosterPreview {
  total: number;
  ready: number;
  problems: { line: number; name: string; issue: string }[];
  sample: { name: string; className: string; guardian: string; status: string }[];
}

export interface RosterCommitResult {
  created: number;
  /** Professores criados; os que já existiam só ganham as turmas novas. */
  teachers: number;
  skipped: number;
  /** CSV com as senhas provisórias. Mostrado uma única vez, nunca guardado em texto. */
  credentialsCsv: string;
}

export const AccommodationInput = z.object({ studentId: z.string().uuid(), kind: z.string().min(2).max(80), extraMinutes: z.number().int().min(0).max(120), resources: z.string().max(160) });

export const HintRequest = z.object({ itemId: z.string().uuid(), stage: z.enum(["command", "path"]), question: z.string().max(400).optional() });
export interface HintResponse {
  hint: string;
  source: "ai" | "item" | "none";
}

/** Aula rápida de um assunto: explicação, exemplo resolvido e erros comuns do ENEM. */
export interface LessonContent {
  title: string;
  explanationHtml: string;
  exampleHtml: string;
  pitfallsHtml: string;
}

export interface LessonView {
  area: Area;
  discipline: string;
  topic: string;
  /** Nulo enquanto a aula não foi aprovada pela rede. */
  lesson: LessonContent | null;
  questions: number;
  /** Domínio do aluno no assunto, de 0 a 100; nulo se ainda não treinou. */
  mastery: number | null;
  prerequisites: {
    discipline: string;
    topic: string;
    why: string;
    mastery: number | null;
    /** `weak`: domínio abaixo de 60%; `untested`: ainda não treinou; `ok`: em dia. */
    status: "weak" | "untested" | "ok";
    hasLesson: boolean;
  }[];
  /** O Raio-X do aluno aponta o cálculo como gargalo: as bases de Matemática pesam mais. */
  calcBottleneck: boolean;
}

export interface LessonIndex {
  disciplines: { area: Area; discipline: string; topics: { topic: string; questions: number; hasLesson: boolean; mastery: number | null; weakPrerequisites: number }[] }[];
}

export interface LessonSuggestionView extends LessonContent {
  discipline: string;
  topic: string;
}

/** Cartão de memorização tirado de uma aula revisada. */
export interface CardView {
  key: string;
  discipline: string;
  topic: string;
  front: string;
  back: string;
  status: "new" | "learning";
}

export interface CardDeck {
  due: CardView[];
  /** Total de cartões das aulas publicadas. */
  total: number;
  learned: number;
  learning: number;
  topics: { discipline: string; topic: string; due: number }[];
}

export const CardReviewInput = z.object({
  reviews: z.array(z.object({ id: z.string().uuid(), key: z.string().min(3).max(400), remembered: z.boolean(), at: z.number().int().positive() })).min(1).max(300),
});
export type CardReview = z.infer<typeof CardReviewInput>["reviews"][number];

export const CourseGoalInput = z.object({
  course: z.string().trim().min(2, "Diga o curso.").max(120),
  institution: z.string().trim().max(160).default(""),
  cutoff: z.number().min(300, "A nota de corte vai de 300 a 1000.").max(1000, "A nota de corte vai de 300 a 1000."),
});

export interface CourseGoalView {
  goal: { course: string; institution: string; cutoff: number } | null;
  /** Média das notas estimadas nas áreas já medidas. Não inclui a redação. */
  estimate: number | null;
  measured: Area[];
  gap: number | null;
}

export interface Milestone {
  id: string;
  title: string;
  startsOn: string;
  endsOn: string | null;
  note: string;
}

export const MilestoneInput = z.object({
  title: z.string().trim().min(3).max(120),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use uma data válida."),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  note: z.string().trim().max(300).default(""),
});

/** Todas as aulas publicadas, para estudar sem internet. Não traz dado de aluno. */
export interface LessonBundle {
  lessons: (LessonContent & { discipline: string; topic: string })[];
}
