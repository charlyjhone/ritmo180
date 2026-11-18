import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { labRefIn } from '@ritmo/engine';
import { normalizeItems } from '@ritmo/ingest';
import { QUESTOES } from './banco';
import { DIREITOS_CONFIRMADOS } from './direitos';
import { armadilhas, paraRitmo } from './exportar';

const ARQUIVO = join(__dirname, '..', '..', '..', '..', 'content', 'laboratorio.json');
const itens = QUESTOES.map(paraRitmo);
const texto = `${JSON.stringify(itens, null, 1)}\n`;

// npm run content:laboratorio regrava o arquivo; nos outros casos o teste só confere.
if (process.env.LAB_EXPORTAR === '1') writeFileSync(ARQUIVO, texto);

describe('exportação para o Ritmo 180', () => {
  it('todas as questões passam pela importação sem rejeição', () => {
    const lote = normalizeItems(itens);
    expect(lote.rejected).toEqual([]);
    expect(lote.items).toHaveLength(QUESTOES.length);
  });

  it('a limpeza de HTML mantém a rota do simulador na resolução', () => {
    const lote = normalizeItems(itens);
    const q = lote.items.find((i) => i.externalId === 'lab-pendulo-3')!;
    expect(labRefIn(q.solutionHtml)).toEqual({ id: 'pendulo', query: 'L=1&th0=5&g=3.7' });
  });

  it('só sai publicável com a confirmação de direitos registrada em direitos.ts', () => {
    expect(itens.every((i) => i.source === 'authored' && i.rightsCleared === (DIREITOS_CONFIRMADOS !== null))).toBe(true);
  });

  it('as armadilhas citam a alternativa errada, nunca a correta', () => {
    const q = QUESTOES.find((x) => x.id === 'projetil-1')!;
    expect(armadilhas(q)[0]).toBe('17,3 m usa sen 30° no lugar de sen 60°.');
    expect(armadilhas(q)[q.correta]).toBeUndefined();
  });

  it('content/laboratorio.json está atualizado (rode npm run content:laboratorio)', () => {
    expect(existsSync(ARQUIVO) && readFileSync(ARQUIVO, 'utf8') === texto).toBe(true);
  });
});
