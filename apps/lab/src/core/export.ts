import type { Sample } from './stepper';

const r = (v: number, d = 6) => (Number.isFinite(v) ? Number(v.toFixed(d)) : v);

/** Baixa um objeto como arquivo .json. */
export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function stamp() {
  return new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
}

/** Monta o pacote padrão de exportação de um módulo. */
export function buildModuleExport(opts: {
  modulo: string;
  titulo: string;
  parametros: Record<string, number | string | boolean>;
  unidades: Record<string, string>;
  resultados?: Record<string, number | string | null>;
  verificacao?: Array<{ grandeza: string; teorico: number; simulado: number }>;
  metodo: string;
  serie: Sample[];
}) {
  return {
    aplicativo: 'Laboratório Virtual ENEM',
    versao: '2.0.0',
    modulo: opts.modulo,
    titulo: opts.titulo,
    exportadoEm: new Date().toISOString(),
    metodo: opts.metodo,
    unidades: opts.unidades,
    parametros: opts.parametros,
    resultados: opts.resultados ?? {},
    verificacao: (opts.verificacao ?? []).map((v) => ({ ...v, erroAbsoluto: Math.abs(v.simulado - v.teorico) })),
    totalPontos: opts.serie.length,
    serie: opts.serie.map((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, r(v)]))),
  };
}
