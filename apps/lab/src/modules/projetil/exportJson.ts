import { analyticVacuum, type TrajectoryResult } from './simulate';

const r = (v: number, d = 6) => Number(v.toFixed(d));

export function buildExport(res: TrajectoryResult) {
  const p = res.params;
  const vacuum = p.cd === 0;
  const ref = analyticVacuum(p);
  return {
    aplicativo: 'Simulador de Lançamento Oblíquo',
    versao: '1.0.0',
    exportadoEm: new Date().toISOString(),
    unidades: { t: 's', x: 'm', y: 'm', vx: 'm/s', vy: 'm/s', v0: 'm/s', angulo: '°', g: 'm/s²', massa: 'kg', diametro: 'm', densidadeAr: 'kg/m³' },
    metodo: {
      integrador: 'Runge–Kutta de 4ª ordem (passo fixo)',
      passo_s: r(res.dt, 9),
      eventos: 'ápice e impacto localizados por bisseção',
      modeloArrasto: 'F = ½·ρ·Cd·A·|v|·v, A = π·d²/4',
    },
    parametrosIniciais: {
      v0: p.v0,
      angulo: p.angleDeg,
      g: p.g,
      coeficienteArrasto: p.cd,
      massa: p.mass,
      diametro: p.diameter,
      densidadeAr: p.airDensity,
    },
    resultados: {
      alcance: r(res.summary.range),
      alturaMaxima: r(res.summary.maxHeight),
      tempoTotal: r(res.summary.flightTime),
      tempoApice: r(res.summary.apexTime),
      velocidadeImpacto: r(res.summary.impactSpeed),
      anguloImpacto: r(res.summary.impactAngleDeg, 4),
    },
    validacaoVacuo: vacuum
      ? {
          formulaAlcance: 'R = v0²·sen(2θ)/g',
          formulaAltura: 'H = v0²·sen²(θ)/(2g)',
          alcanceTeorico: r(ref.range, 9),
          alturaTeorica: r(ref.maxHeight, 9),
          erroAlcance: Math.abs(res.summary.range - ref.range),
          erroAltura: Math.abs(res.summary.maxHeight - ref.maxHeight),
        }
      : null,
    totalPontos: res.points.length,
    trajetoria: res.points.map((q) => ({ t: r(q.t), x: r(q.x), y: r(q.y), vx: r(q.vx), vy: r(q.vy) })),
  };
}

export function downloadJson(res: TrajectoryResult) {
  const data = buildExport(res);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
  const a = document.createElement('a');
  a.href = url;
  a.download = `lancamento_v0-${res.params.v0}_ang-${res.params.angleDeg}_${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
