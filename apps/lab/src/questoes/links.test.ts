import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { QUESTOES } from './banco';
import { LINKS, linkDaQuestao } from './links';

const MODS = join(__dirname, '..', 'modules');

/** Nomes que o módulo lê da rota: param('x'…), choice('x'…), get('x') e as chaves de params({…}). */
function nomesAceitos(modulo: string): Set<string> {
  const dir = join(MODS, modulo);
  const src = readdirSync(dir).filter((f) => f.endsWith('Module.tsx')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
  const nomes = new Set<string>();
  for (const m of src.matchAll(/(?:param|choice(?:<\w+>)?|get)\(\s*[`']([A-Za-z0-9]+)/g)) nomes.add(m[1]!);
  for (const m of src.matchAll(/param\(`g\$\{i\}`/g)) for (let i = 0; i < 4; i++) nomes.add(`g${i}`), void m;
  for (const m of src.matchAll(/params\(\{([^}]*)\}/g)) for (const k of m[1]!.matchAll(/(\w+)\s*:/g)) nomes.add(k[1]!);
  // params(DEFAULT) / params(DEFAULTS[kind]): chaves do objeto de padrões
  for (const m of src.matchAll(/const (DEFAULTS?)\b[^=]*=\s*\{([\s\S]*?)\n?\};/g)) for (const k of m[2]!.matchAll(/(\w+)\s*:/g)) nomes.add(k[1]!);
  return nomes;
}

describe('links das questões', () => {
  it('toda questão tem montagem, e toda montagem é de uma questão', () => {
    const ids = new Set(QUESTOES.map((q) => q.id));
    expect(QUESTOES.filter((q) => !(q.id in LINKS)).map((q) => q.id)).toEqual([]);
    expect(Object.keys(LINKS).filter((id) => !ids.has(id))).toEqual([]);
  });

  it('cada parâmetro existe no módulo da questão', () => {
    const erros: string[] = [];
    for (const q of QUESTOES) {
      const aceitos = nomesAceitos(q.modulo);
      for (const k of Object.keys(LINKS[q.id] ?? {})) if (!aceitos.has(k)) erros.push(`${q.id}: ${k}`);
    }
    expect(erros).toEqual([]);
  });

  it('monta a rota com os valores', () => {
    expect(linkDaQuestao({ id: 'pendulo-3', modulo: 'pendulo' })).toBe('#pendulo?L=1&th0=5&g=3.7');
    expect(linkDaQuestao({ id: 'gases-2', modulo: 'gases' })).toBe('#gases');
  });
});
