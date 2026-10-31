// Portal da família: tela de celular, com um resumo para cada filho.
import { app, hideHeader } from "../ui.js";

const DAYS = ["seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTHS = ["fev", "abr", "jun", "ago", "out"];

const KIDS = {
  ana: {
    headline: "Ana está no ritmo certo e melhorou a leitura das questões.",
    stats: [
      ["Índice Ritmo", "62%", "+6 na semana"],
      ["Nota estimada CN", "612", "+38 no ano"],
    ],
    week: [1, 1, 1, 0, 1, 1],
    evoTitle: "Nota estimada em Ciências da Natureza: de 574 para 612",
    evo: [574, 581, 590, 597, 605, 612],
    teacherIni: "PF",
    teacher: "Prof. de Física",
    note: "A Ana resolve as contas muito bem. O foco agora é ler o texto-base com mais objetividade, e ela já ganhou 20 segundos por questão.",
    help: "Pergunte à Ana qual foi a pegadinha do dia. Explicar o próprio erro em voz alta é uma das formas mais eficazes de fixar.",
    agenda: [
      { d: "31", m: "OUT", title: "Simulado 2º dia", sub: "Na escola, das 13h30 às 18h30" },
      { d: "12", m: "NOV", title: "Reunião de resultados", sub: "On-line, às 19h" },
    ],
  },
  lucas: {
    headline: "Lucas está lendo mais rápido, mas faltou treino em dois dias.",
    stats: [
      ["Leitura válida", "151 ppm", "+4 na semana"],
      ["Pré-requisitos", "68%", "+5 no bimestre"],
    ],
    week: [1, 0, 1, 1, 0, 1],
    evoTitle: "Velocidade de leitura com compreensão: de 126 para 151 ppm",
    evo: [126, 131, 138, 142, 147, 151],
    teacherIni: "CO",
    teacher: "Coordenação do Fundamental",
    note: "O Lucas evoluiu bem em interpretação. Pedimos atenção à rotina: 15 minutos por dia fazem mais diferença do que uma hora no fim de semana.",
    help: "Combine um horário fixo de 15 minutos para o treino de leitura, de preferência antes do celular e da TV.",
    agenda: [
      { d: "05", m: "NOV", title: "Diagnóstico de leitura", sub: "Em sala, no 2º horário" },
      { d: "12", m: "NOV", title: "Reunião de resultados", sub: "On-line, às 19h" },
    ],
  },
};

function evoChart(kid) {
  const lo = Math.min(...kid.evo) - 4;
  const hi = Math.max(...kid.evo) + 4;
  const dots = kid.evo.map((v, i) => ({ x: 12 + i * 63, y: Math.round(96 - ((v - lo) / (hi - lo)) * 84) }));
  return `
    <svg class="chart" style="margin-top: 10px" viewBox="0 0 340 120" role="img" aria-label="${kid.evoTitle}">
      <line x1="0" y1="100" x2="340" y2="100" stroke="#E2E5EC"></line>
      <polyline points="${dots.map((p) => `${p.x},${p.y}`).join(" ")}" fill="none" stroke="#2447D6" stroke-width="3" stroke-linejoin="round"></polyline>
      ${dots.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="4" fill="#FFFFFF" stroke="#2447D6" stroke-width="3"></circle>`).join("")}
    </svg>`;
}

const bodyHtml = (kid) => `
  <section class="pcard" aria-label="Resumo da semana">
    <div class="metric-label">Esta semana</div>
    <div class="fam-headline">${kid.headline}</div>
    <div class="fam-stats">
      ${kid.stats.map(([label, value, delta]) => `<div class="fam-stat"><small>${label}</small><div class="mono">${value}</div>${delta}</div>`).join("")}
    </div>
  </section>

  <section class="pcard" aria-label="Dias de treino">
    <div class="card-head"><div class="pcard-title">Treinou ${kid.week.reduce((a, b) => a + b, 0)} de 6 dias</div><div style="font-size: 12px; color: var(--muted)">meta: 5 dias</div></div>
    <div class="week">
      ${DAYS.map(
        (day, i) => `<div>
          <div class="day ${kid.week[i] ? "on" : ""}" role="img" aria-label="${day}: ${kid.week[i] ? "treinou" : "não treinou"}">${kid.week[i] ? "✓" : ""}</div>
          ${day}
        </div>`,
      ).join("")}
    </div>
  </section>

  <section class="pcard" aria-label="Evolução">
    <div class="pcard-title">${kid.evoTitle}</div>
    ${evoChart(kid)}
    <div class="fam-axis">${MONTHS.map((m) => `<span>${m}</span>`).join("")}</div>
  </section>

  <section class="pcard" aria-label="Recado da escola">
    <div class="fam-note">
      <div class="avatar" aria-hidden="true">${kid.teacherIni}</div>
      <div><b>${kid.teacher}</b><p class="fam-text">${kid.note}</p></div>
    </div>
  </section>

  <section class="pcard" aria-label="Como ajudar em casa">
    <div class="pcard-title">Como ajudar em casa</div>
    <p class="fam-text" style="margin-top: 6px; line-height: 1.55">${kid.help}</p>
  </section>

  <section class="pcard" aria-label="Agenda">
    <div class="pcard-title">Próximos compromissos</div>
    <div class="agenda">
      ${kid.agenda
        .map((a) => `<div class="agenda-row"><div class="date"><span class="mono">${a.d}</span>${a.m}</div><div>${a.title}<small>${a.sub}</small></div></div>`)
        .join("")}
    </div>
  </section>

  <a class="btn fam-cta" href="#/direcao">Falar com a coordenação</a>
  <div class="fam-foot">Dados fictícios de demonstração. A família só vê os dados dos próprios filhos.</div>`;

export function renderFamilia() {
  hideHeader();
  app.innerHTML = `
    <div class="fam">
      <div class="fam-head">
        <div class="fam-top">
          <div class="fam-brand">
            <div class="fam-logo">180</div>
            <div><div class="fam-name">Colégio Conceito</div><div class="fam-sub">Portal da família</div></div>
          </div>
          <button class="fam-bell" type="button" aria-label="Notificações" data-demo="Nenhuma notificação nova (demonstração)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path></svg>
          </button>
        </div>
        <div class="fam-tabs" role="tablist" aria-label="Filhos">
          <button type="button" role="tab" data-kid="ana">Ana · 3ª série</button>
          <button type="button" role="tab" data-kid="lucas">Lucas · 8º ano</button>
        </div>
      </div>
      <div class="fam-body" id="fam-body"></div>
    </div>`;

  function pick(id) {
    app.querySelector("#fam-body").innerHTML = bodyHtml(KIDS[id]);
    app.querySelectorAll("[data-kid]").forEach((b) => b.setAttribute("aria-selected", b.dataset.kid === id));
  }

  app.querySelectorAll("[data-kid]").forEach((b) => (b.onclick = () => pick(b.dataset.kid)));
  pick("ana");
}
