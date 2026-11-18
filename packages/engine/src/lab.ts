// Liga uma questão aos simuladores do Laboratório Virtual que ajudam a entendê-la.
// Regra: primeiro as palavras-chave do enunciado (mais específicas), depois o assunto do banco.
// O catálogo vem de fora (LAB_MODULES em @ritmo/contracts): o motor não depende de outros pacotes.

export interface LabCatalogEntry {
  id: string;
  disciplines: readonly string[];
  topics: readonly string[];
  keywords: readonly string[];
}

export interface LabQuestion {
  discipline: string;
  topic: string;
  /** Texto de apoio e enunciado, em HTML ou texto. */
  text: string;
}

/** Minúsculas, sem acento e sem marcação HTML. */
export function normalizeLabText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

const compiled = new WeakMap<LabCatalogEntry, RegExp[]>();
function patterns(entry: LabCatalogEntry): RegExp[] {
  let p = compiled.get(entry);
  if (!p) {
    p = entry.keywords.map((k) => new RegExp(k));
    compiled.set(entry, p);
  }
  return p;
}

export function labModulesFor(q: LabQuestion, catalog: readonly LabCatalogEntry[], max = 2): string[] {
  const text = normalizeLabText(q.text);
  const scored: { id: string; score: number; order: number }[] = [];
  catalog.forEach((entry, order) => {
    if (!entry.disciplines.includes(q.discipline)) return;
    const hits = patterns(entry).filter((re) => re.test(text)).length;
    const byTopic = entry.topics.includes(q.topic);
    if (!hits && !byTopic) return;
    // Palavra-chave pesa mais que o assunto; várias palavras-chave pesam mais que uma.
    scored.push({ id: entry.id, score: hits * 2 + (byTopic ? 1 : 0), order });
  });
  return scored
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, max)
    .map((s) => s.id);
}

/** Rota do simulador montado que a resolução traz em <span class="lab-ref">pendulo?L=1</span>, se houver. */
export function labRefIn(html: string): { id: string; query: string } | null {
  const m = /<span class="lab-ref">([a-z]+)(?:\?([^<]*))?<\/span>/.exec(html);
  if (!m) return null;
  return { id: m[1]!, query: (m[2] ?? "").replace(/&amp;/g, "&") };
}
