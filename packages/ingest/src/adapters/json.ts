// Arquivo já no formato canônico: lista de questões ou { "items": [...] }.
export function parseCanonicalJson(text: string): unknown[] {
  const data = JSON.parse(text) as unknown;
  if (Array.isArray(data)) return data;
  const items = (data as { items?: unknown } | null)?.items;
  if (Array.isArray(items)) return items;
  throw new Error('O JSON precisa ser uma lista de questões ou um objeto com a chave "items".');
}
