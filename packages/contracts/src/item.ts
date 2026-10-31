// Formato canônico de questão: todo importador converte a sua origem para isto antes de entrar no banco.
import { z } from "zod";
import { AREAS, DISCIPLINES } from "./taxonomy.ts";

export const ITEM_SOURCES = ["inep_official", "authored", "ai_generated", "third_party"] as const;
export type ItemSource = (typeof ITEM_SOURCES)[number];

export const LETTERS = ["A", "B", "C", "D", "E"] as const;
export type Letter = (typeof LETTERS)[number];

export const IrtSchema = z.object({
  a: z.number().positive().max(10),
  b: z.number().min(-6).max(6),
  c: z.number().min(0).max(0.6),
});

export const AlternativeSchema = z.object({
  letter: z.enum(LETTERS),
  html: z.string().min(1),
  /** Por que alguém marcaria esta alternativa errada. */
  trap: z.string().optional(),
});

export const CanonicalItemSchema = z
  .object({
    externalId: z.string().min(1).max(120),
    source: z.enum(ITEM_SOURCES),
    area: z.enum(AREAS),
    discipline: z.string().min(1),
    topic: z.string().min(1).max(160),
    skill: z.string().regex(/^H\d{1,2}$/).optional(),
    competency: z.string().regex(/^C\d$/).optional(),
    year: z.number().int().min(1998).max(2100).optional(),
    application: z.string().max(60).optional(),
    contextHtml: z.string().default(""),
    stemHtml: z.string().min(1),
    alternatives: z.array(AlternativeSchema).length(5),
    answer: z.enum(LETTERS),
    solutionHtml: z.string().default(""),
    hint: z.string().optional(),
    prerequisites: z.array(z.string()).default([]),
    irt: IrtSchema.optional(),
    /** Só itens com direitos confirmados podem ser publicados. */
    rightsCleared: z.boolean(),
    rightsNote: z.string().optional(),
  })
  .superRefine((item, ctx) => {
    if (!DISCIPLINES[item.area].includes(item.discipline)) {
      ctx.addIssue({ code: "custom", path: ["discipline"], message: `Disciplina "${item.discipline}" não pertence à área ${item.area}.` });
    }
    const letters = item.alternatives.map((a) => a.letter).join("");
    if (letters !== "ABCDE") ctx.addIssue({ code: "custom", path: ["alternatives"], message: "As alternativas devem ser A, B, C, D e E, nesta ordem." });
  });

export type CanonicalItem = z.infer<typeof CanonicalItemSchema>;

/** Questão como chega à tela do aluno em treino. */
export interface PracticeItem {
  id: string;
  area: (typeof AREAS)[number];
  discipline: string;
  topic: string;
  skill: string | null;
  contextHtml: string;
  stemHtml: string;
  alternatives: { letter: Letter; html: string }[];
  targetSeconds: number;
  wordCount: number;
}

/** Parte só entregue em treino, para corrigir sem internet. Nunca vai para simulado. */
export interface PracticeAnswerKey {
  answer: Letter;
  solutionHtml: string;
  hint: string | null;
  traps: Partial<Record<Letter, string>>;
}
