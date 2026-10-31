// Índice do Banco ENEM 2009-2025: parâmetros oficiais, assunto e habilidade, sem o texto das questões.
import ExcelJS from "exceljs";
import { areaOfDiscipline, type Area, type Letter } from "@ritmo/contracts";

export interface BancoEntry {
  externalId: string;
  area: Area;
  discipline: string;
  topic: string;
  skill?: string;
  year?: number;
  application?: string;
  answer?: Letter;
  irt?: { a: number; b: number; c: number };
}

const SHEET = "Itens";
const COLUMN = { id: 1, area: 2, topic: 3, year: 4, application: 5, answer: 8, duplicateOf: 11, skill: 14, a: 17, b: 18, c: 19 };

export function bancoRow(cell: (column: number) => unknown): BancoEntry | null {
  const externalId = cell(COLUMN.id);
  const discipline = String(cell(COLUMN.area) ?? "");
  const area = areaOfDiscipline(discipline);
  if (typeof externalId !== "string" || !area || cell(COLUMN.duplicateOf)) return null;
  const [a, b, c] = [cell(COLUMN.a), cell(COLUMN.b), cell(COLUMN.c)];
  const answer = String(cell(COLUMN.answer) ?? "");
  return {
    externalId,
    area,
    discipline,
    topic: String(cell(COLUMN.topic)),
    skill: /^H\d+$/.test(String(cell(COLUMN.skill) ?? "")) ? String(cell(COLUMN.skill)) : undefined,
    year: typeof cell(COLUMN.year) === "number" ? (cell(COLUMN.year) as number) : undefined,
    application: cell(COLUMN.application) ? String(cell(COLUMN.application)) : undefined,
    answer: /^[A-E]$/.test(answer) ? (answer as Letter) : undefined,
    irt: typeof a === "number" && typeof b === "number" && typeof c === "number" ? { a, b, c } : undefined,
  };
}

export async function parseBanco(path: string): Promise<BancoEntry[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const sheet = workbook.getWorksheet(SHEET);
  if (!sheet) throw new Error(`A planilha não tem a aba "${SHEET}".`);
  const entries: BancoEntry[] = [];
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    const entry = bancoRow((column) => row.getCell(column).value);
    if (entry) entries.push(entry);
  });
  return entries;
}
