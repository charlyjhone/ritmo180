// Taxonomia do ENEM: áreas e disciplinas. As quatro áreas têm escalas de nota independentes.
export const AREAS = ["LC", "CH", "CN", "MT"] as const;
export type Area = (typeof AREAS)[number];

export const AREA_NAMES: Record<Area, string> = {
  LC: "Linguagens",
  CH: "Ciências Humanas",
  CN: "Ciências da Natureza",
  MT: "Matemática",
};

export const DISCIPLINES: Record<Area, readonly string[]> = {
  LC: ["Português", "Literatura", "Inglês", "Espanhol", "Artes", "Educação Física", "Tecnologias"],
  CH: ["História", "Geografia", "Filosofia", "Sociologia"],
  CN: ["Física", "Química", "Biologia"],
  MT: ["Matemática"],
};

export function areaOfDiscipline(discipline: string): Area | null {
  for (const area of AREAS) if (DISCIPLINES[area].includes(discipline)) return area;
  return null;
}

export const ROLES = ["student", "teacher", "coordinator", "guardian", "network_admin"] as const;
export type Role = (typeof ROLES)[number];

export const GRADES = ["6º ano", "7º ano", "8º ano", "9º ano", "1ª série", "2ª série", "3ª série"] as const;
export type Grade = (typeof GRADES)[number];
