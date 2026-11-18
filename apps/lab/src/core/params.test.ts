import { describe, expect, it } from 'vitest';
import { choice, param, params, routeId } from './params';

describe('parâmetros na rota', () => {
  it('separa o id do experimento dos parâmetros', () => {
    expect(routeId('projetil?v0=20&angleDeg=30')).toBe('projetil');
    expect(routeId('pendulo')).toBe('pendulo');
  });
  it('lê números, aceita vírgula e ignora o que não é número', () => {
    expect(param('v0', 5, 'projetil?v0=20')).toBe(20);
    expect(param('L', 1, 'pendulo?L=0,5')).toBe(0.5);
    expect(param('L', 1, 'pendulo?L=abc')).toBe(1);
    expect(param('L', 1, 'pendulo')).toBe(1);
    expect(param('L', 1, 'pendulo?L=')).toBe(1);
  });
  it('aplica só às chaves numéricas do objeto de padrões', () => {
    const d = { v0: 10, angleDeg: 45, drag: false };
    expect(params(d, 'projetil?v0=20&angleDeg=30&drag=1&extra=9')).toEqual({ v0: 20, angleDeg: 30, drag: false });
  });

  it('choice aceita só opções válidas', () => {
    expect(choice('gasId', 'N2', ['He', 'N2', 'CO2'], 'gases?gasId=CO2')).toBe('CO2');
    expect(choice('gasId', 'N2', ['He', 'N2'], 'gases?gasId=XX')).toBe('N2');
    expect(choice('gasId', 'N2', ['He', 'N2'], 'gases')).toBe('N2');
  });
});
