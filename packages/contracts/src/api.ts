// Contratos HTTP entre interface e servidor. Entradas validadas com zod; saídas tipadas.
import { z } from "zod";
import { AREAS, type Area, type Role } from "./taxonomy.ts";
import { LETTERS, type Letter, type PracticeAnswerKey, type PracticeItem } from "./item.ts";

export const LoginInput = z.object({ email: z.string().email().max(160), password: z.string().min(8).max(200) });

export interface Me {
  id: string;
  name: string;
  role: Role;
  school: { id: string; name: string; brandColor: string; isDemo: boolean; released: boolean } | null;
  grade: string | null;
  className: string | null;
  /** Motivo pelo qual o aluno ainda não pode usar a plataforma. */
  blocked: "school_not_released" | "consent_required" | null;
}

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
});
export type AttemptInput = z.infer<typeof AttemptInput>;

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
  parts: z.array(z.object({ area: z.enum(AREAS), discipline: z.string().optional(), count: z.number().int().min(1).max(90) })).min(1),
});

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
  total: number;
  topics: { discipline: string; topic: string; count: number }[];
  questions: (ReviewedQuestion & { itemId: string; times: number; lastWrongAt: number })[];
}

export interface StudyPlan {
  enem: { year: number; nextDay: string; daysLeft: number; days: readonly string[] } | null;
  days: { date: string; kind: "focus" | "simulado" | "light" | "exam"; discipline?: string; topic?: string }[];
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
  alerts: { studentId: string; name: string; why: string; action: "ver_trilha" | "enviar_sprints" | "avisar_familia" }[];
  flags: { id: string; itemId: string; label: string; area: string; why: string }[];
  assignableTopics: { topic: string; discipline: string; items: number }[];
}

export const CreateAssignment = z.object({ classId: z.string().uuid(), topic: z.string().min(1), title: z.string().min(3).max(120), studentId: z.string().uuid().optional() });
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
  roster: { students: number; pendingEmail: number; lastFile: string | null };
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
