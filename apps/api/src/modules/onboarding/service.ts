// Implantação de uma escola, salva a cada passo para ser retomada depois.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { accommodationFactor, DEFAULT_SECONDS_PER_QUESTION } from "@ritmo/engine";
import { GRADES, type OnboardingState, type RosterCommitResult, type RosterPreview, type UpdateOnboarding } from "@ritmo/contracts";
import type { Tx } from "../../platform/db.ts";
import { HttpError } from "../../platform/http.ts";
import { hashPassword, temporaryPassword } from "../identity/index.ts";

const REQUIRED_COLUMNS = ["nome", "email", "turma", "serie", "email_responsavel"];
const email = z.string().email();

interface RosterRow {
  line: number;
  name: string;
  email: string;
  className: string;
  grade: string;
  guardian: string;
  consent: boolean;
}

function parseLine(line: string, separator: string): string[] {
  const out: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === separator && !quoted) {
      out.push(cell.trim());
      cell = "";
    } else cell += ch;
  }
  out.push(cell.trim());
  return out;
}

export function parseRoster(csv: string): { rows: RosterRow[]; preview: RosterPreview } {
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const header = lines[0] ?? "";
  const separator = header.includes(";") ? ";" : ",";
  const columns = parseLine(header, separator).map((c) => c.toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((c) => !columns.includes(c));
  if (missing.length > 0) throw new HttpError(422, "bad_columns", `Faltam colunas na planilha: ${missing.join(", ")}.`);

  const rows: RosterRow[] = [];
  const problems: RosterPreview["problems"] = [];
  const seen = new Set<string>();
  lines.slice(1).forEach((text, index) => {
    const line = index + 2;
    const cells = parseLine(text, separator);
    const get = (name: string) => cells[columns.indexOf(name)] ?? "";
    const row = { line, name: get("nome"), email: get("email").toLowerCase(), className: get("turma"), grade: get("serie"), guardian: get("email_responsavel").toLowerCase(), consent: /^(sim|s|yes)$/i.test(get("consentimento")) };
    const issues: string[] = [];
    if (row.name.length < 3) issues.push("nome incompleto");
    if (!email.safeParse(row.email).success) issues.push("e-mail do aluno inválido");
    else if (seen.has(row.email)) issues.push("e-mail repetido");
    if (!row.className) issues.push("turma vazia");
    if (!(GRADES as readonly string[]).includes(row.grade)) issues.push(`série "${row.grade}" não reconhecida`);
    if (!email.safeParse(row.guardian).success) issues.push("e-mail do responsável inválido");
    if (issues.length > 0) problems.push({ line, name: row.name || "(sem nome)", issue: issues.join(", ") });
    else {
      seen.add(row.email);
      rows.push(row);
    }
  });
  return {
    rows,
    preview: {
      total: lines.length - 1,
      ready: rows.length,
      problems,
      sample: rows.slice(0, 5).map((r) => ({ name: r.name, className: r.className, guardian: r.guardian, status: r.consent ? "Consentimento recebido" : "Aguarda consentimento" })),
    },
  };
}

export async function commitRoster(tx: Tx, schoolId: string, filename: string, csv: string): Promise<RosterCommitResult> {
  const { rows } = parseRoster(csv);
  const credentials = ["nome,email,senha_provisoria"];
  let created = 0;
  let skipped = 0;
  for (const r of rows) {
    const existing = (await tx.query(`SELECT id FROM users WHERE lower(email) = $1`, [r.email]))[0];
    if (existing) {
      skipped++;
      continue;
    }
    const className = r.className;
    await tx.query(`INSERT INTO classes (school_id, name, grade) VALUES ($1,$2,$3) ON CONFLICT (school_id, name) DO NOTHING`, [schoolId, className, r.grade]);
    const classId = (await tx.query(`SELECT id FROM classes WHERE school_id = $1 AND name = $2`, [schoolId, className]))[0]!.id;
    const password = temporaryPassword();
    const { hash, salt } = await hashPassword(password);
    const id = randomUUID();
    await tx.query(`INSERT INTO users (id, school_id, email, name, role, pass_hash, pass_salt, grade) VALUES ($1,$2,$3,$4,'student',$5,$6,$7)`, [id, schoolId, r.email, r.name, hash, salt, r.grade]);
    await tx.query(`INSERT INTO class_students (class_id, student_id, school_id) VALUES ($1,$2,$3)`, [classId, id, schoolId]);
    await tx.query(`INSERT INTO guardian_contacts (student_id, school_id, guardian_email, consent_at) VALUES ($1,$2,$3,$4)`, [id, schoolId, r.guardian, r.consent ? new Date() : null]);
    credentials.push(`"${r.name.replace(/"/g, '""')}",${r.email},${password}`);
    created++;
  }
  await tx.query(`UPDATE schools SET last_roster_file = $2 WHERE id = $1`, [schoolId, filename]);
  return { created, skipped, credentialsCsv: credentials.join("\n") };
}

export async function onboardingState(tx: Tx, schoolId: string): Promise<OnboardingState> {
  const s = (await tx.query(`SELECT *, logo_png IS NOT NULL AS has_logo FROM schools WHERE id = $1`, [schoolId]))[0];
  if (!s) throw new HttpError(404, "not_found", "Escola não encontrada.");
  const counts = (await tx.query(
    `SELECT count(*)::int AS students, count(gc.consent_at)::int AS consented,
       count(*) FILTER (WHERE u.pass_hash IS NULL)::int AS pending
     FROM users u LEFT JOIN guardian_contacts gc ON gc.student_id = u.id WHERE u.role = 'student' AND u.school_id = $1`,
    [schoolId],
  ))[0]!;
  const accommodations = await tx.query(
    `SELECT a.id, u.name, c.name AS class_name, a.kind, a.extra_minutes, a.resources FROM accommodations a
     JOIN users u ON u.id = a.student_id LEFT JOIN class_students cs ON cs.student_id = u.id LEFT JOIN classes c ON c.id = cs.class_id
     WHERE a.school_id = $1 ORDER BY u.name`,
    [schoolId],
  );
  const blockers: string[] = [];
  if (!s.dpa_signed) blockers.push("Assinar o acordo de tratamento de dados");
  if (!s.dpo_contact) blockers.push("Informar o contato do encarregado de dados");
  if (counts.students === 0) blockers.push("Importar os alunos");
  if (!s.diagnostic_date) blockers.push("Agendar o diagnóstico");
  return {
    schoolId,
    school: { name: s.name, city: s.city, grades: s.grades, slug: s.slug, brandColor: s.brand_color, hasLogo: s.has_logo },
    terms: { dpaSigned: s.dpa_signed, dpoContact: s.dpo_contact, dataIsolation: true },
    consent: { accepted: counts.consented, total: counts.students },
    roster: { students: counts.students, pendingEmail: counts.pending, lastFile: s.last_roster_file },
    accommodations: accommodations.map((a) => ({
      id: a.id, student: a.name, className: a.class_name ?? "—", kind: a.kind, extraMinutes: a.extra_minutes,
      targetSeconds: Math.round(DEFAULT_SECONDS_PER_QUESTION * accommodationFactor(a.extra_minutes)), resources: a.resources,
    })),
    diagnostic: { date: s.diagnostic_date ? new Date(s.diagnostic_date).toISOString().slice(0, 10) : null, scope: s.diagnostic_scope },
    released: !!s.released_at,
    blockers,
  };
}

export async function updateOnboarding(tx: Tx, schoolId: string, input: UpdateOnboarding): Promise<void> {
  if (input.school) {
    const { name, slug, brandColor, grades } = input.school;
    await tx.query(`UPDATE schools SET name = $2, slug = $3, brand_color = $4, grades = $5 WHERE id = $1`, [schoolId, name, slug, brandColor, grades]);
  }
  if (input.terms) await tx.query(`UPDATE schools SET dpa_signed = $2, dpo_contact = $3 WHERE id = $1`, [schoolId, input.terms.dpaSigned, input.terms.dpoContact]);
  if (input.diagnostic) await tx.query(`UPDATE schools SET diagnostic_date = $2, diagnostic_scope = $3 WHERE id = $1`, [schoolId, input.diagnostic.date, input.diagnostic.scope]);
}

export async function releaseSchool(tx: Tx, schoolId: string, now: number): Promise<void> {
  const state = await onboardingState(tx, schoolId);
  if (state.blockers.length > 0) throw new HttpError(422, "not_ready", `Antes de liberar: ${state.blockers.join("; ")}.`);
  await tx.query(`UPDATE schools SET released_at = $2 WHERE id = $1`, [schoolId, new Date(now)]);
}

