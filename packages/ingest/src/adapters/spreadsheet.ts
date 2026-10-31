// Planilha de questões, uma por linha. O modelo está em docs/importar-questoes.md.
import ExcelJS from "exceljs";
import { areaOfDiscipline } from "@ritmo/contracts";

const REQUIRED = ["id", "disciplina", "assunto", "enunciado", "a", "b", "c", "d", "e", "gabarito", "origem", "direitos_ok"];
const SOURCES: Record<string, string> = { inep: "inep_official", enem: "inep_official", autoral: "authored", terceiro: "third_party" };

const paragraph = (text: string) => (text.trim() ? `<p>${text.trim().replace(/\n+/g, "</p><p>")}</p>` : "");
const number = (value: string | undefined) => (value ? Number(value.replace(",", ".")) : undefined);

export function rowToCandidate(row: Record<string, string>): unknown {
  const discipline = row["disciplina"] ?? "";
  const [a, b, c] = [number(row["irt_a"]), number(row["irt_b"]), number(row["irt_c"])];
  return {
    externalId: row["id"],
    source: SOURCES[(row["origem"] ?? "").toLowerCase()] ?? row["origem"],
    area: areaOfDiscipline(discipline),
    discipline,
    topic: row["assunto"],
    skill: row["habilidade"] || undefined,
    competency: row["competencia"] || undefined,
    year: number(row["ano"]),
    application: row["aplicacao"] || undefined,
    contextHtml: paragraph(row["texto_base"] ?? ""),
    stemHtml: paragraph(row["enunciado"] ?? ""),
    alternatives: (["a", "b", "c", "d", "e"] as const).map((letter) => ({
      letter: letter.toUpperCase(),
      html: row[letter] ?? "",
      trap: row[`erro_${letter}`] || undefined,
    })),
    answer: (row["gabarito"] ?? "").toUpperCase(),
    solutionHtml: paragraph(row["resolucao"] ?? ""),
    hint: row["dica"] || undefined,
    irt: a !== undefined && b !== undefined && c !== undefined ? { a, b, c } : undefined,
    rightsCleared: /^(sim|s|true|1)$/i.test(row["direitos_ok"] ?? ""),
    rightsNote: row["direitos_nota"] || undefined,
  };
}

const cellText = (value: ExcelJS.CellValue): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "richText" in value) return value.richText.map((r) => r.text).join("");
  if (typeof value === "object" && "result" in value) return String(value.result ?? "");
  return String(value).trim();
};

export async function parseSpreadsheet(path: string): Promise<unknown[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("A planilha está vazia.");
  const header = (sheet.getRow(1).values as ExcelJS.CellValue[]).map((v) => cellText(v).toLowerCase());
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length > 0) throw new Error(`Faltam colunas: ${missing.join(", ")}.`);
  const rows: unknown[] = [];
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    const record: Record<string, string> = {};
    header.forEach((name, column) => {
      if (name) record[name] = cellText(row.getCell(column).value);
    });
    rows.push(rowToCandidate(record));
  });
  return rows;
}
