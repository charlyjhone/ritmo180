import { describe, expect, it } from 'vitest';
import { LAB_MODULES } from '@ritmo/contracts';
import { MODULES } from './registry';

describe('catálogo compartilhado com o Ritmo 180', () => {
  it('tem os mesmos simuladores, com os mesmos títulos', () => {
    const disponiveis = MODULES.filter((m) => m.component);
    expect(LAB_MODULES.map((m) => m.id).sort()).toEqual(disponiveis.map((m) => m.id).sort());
    for (const m of disponiveis) {
      const c = LAB_MODULES.find((x) => x.id === m.id)!;
      expect(c.title, m.id).toBe(m.title);
      expect(c.disciplines[0], m.id).toBe(m.area === 'Química' && m.id === 'calorimetria' ? 'Física' : m.area);
    }
  });
});
