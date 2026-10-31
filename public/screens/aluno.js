// Painel do aluno: indicadores, Raio-X do Tempo, evolução, próximos treinos e lacunas.
import { app, bar, metrics, pageHead, showHeader, timeStrip } from "../ui.js";

const STAGES = ["Precisão", "Fluência", "Reconhecimento", "Velocidade", "Resistência"];
const SKILLS = [
  { name: "Energia e potência elétrica", code: "CN · H5 e H21", stage: 4 },
  { name: "Cinemática e gráficos", code: "CN · H17", stage: 5 },
  { name: "Ondas e som", code: "CN · H1", stage: 3 },
  { name: "Hidrostática e empuxo", code: "CN · H20", stage: 2 },
  { name: "Termologia", code: "CN · H21", stage: 3 },
  { name: "Óptica geométrica", code: "CN · H1", stage: 1 },
];
const GAPS = [
  { name: "Regra de três e proporção", year: "7º ano", impact: "Aparece em 31% dos seus erros de Física e Química", pct: 31 },
  { name: "Leitura de gráficos de linha", year: "8º ano", impact: "Aparece em 24% dos seus erros com texto-base longo", pct: 24 },
  { name: "Notação científica e potências", year: "9º ano", impact: "Aparece em 14% dos seus erros de cálculo", pct: 14 },
];
const NEXT = [
  { mode: "LEITURA", title: "Texto-base com gráfico · 6 textos", why: "Ataca seu maior gargalo de tempo", time: "8 min" },
  { mode: "SPRINT", title: "Regra de três em 60 segundos", why: "Lacuna do 7º ano ligada a 31% dos erros", time: "5 min" },
  { mode: "CORRIDA", title: "8 questões de Energia contra o fantasma", why: "Etapa 4: falta bater o tempo-alvo", time: "12 min" },
];
const WEEKS = [41, 44, 47, 50, 52, 55, 56, 62];

function evolutionChart() {
  const points = WEEKS.map((v, i) => ({
    x: Math.round(60 + i * (500 / 7)),
    y: Math.round(160 - ((v - 30) / 40) * 140),
    label: `S${i + 1}`,
  }));
  return `
    <svg class="chart" viewBox="0 0 600 220" role="img" aria-label="Evolução semanal do Índice Ritmo de 41 a 62 por cento">
      <line x1="40" y1="20" x2="580" y2="20" stroke="#EEF0F4"></line>
      <line x1="40" y1="90" x2="580" y2="90" stroke="#EEF0F4"></line>
      <line x1="40" y1="160" x2="580" y2="160" stroke="#D5DAE4"></line>
      <text x="32" y="24" text-anchor="end" font-size="12" fill="#5B6474">70%</text>
      <text x="32" y="94" text-anchor="end" font-size="12" fill="#5B6474">50%</text>
      <text x="32" y="164" text-anchor="end" font-size="12" fill="#5B6474">30%</text>
      <line x1="40" y1="55" x2="580" y2="55" stroke="#0F7A4A" stroke-dasharray="5 5"></line>
      <text x="580" y="47" text-anchor="end" font-size="12" font-weight="700" fill="#0F7A4A">meta do piloto: 60%</text>
      <polyline points="${points.map((p) => `${p.x},${p.y}`).join(" ")}" fill="none" stroke="#2447D6" stroke-width="3" stroke-linejoin="round"></polyline>
      ${points
        .map(
          (p) => `<circle cx="${p.x}" cy="${p.y}" r="5" fill="#FFFFFF" stroke="#2447D6" stroke-width="3"></circle>
            <text x="${p.x}" y="190" text-anchor="middle" font-size="12" fill="#5B6474">${p.label}</text>`,
        )
        .join("")}
      <text x="562" y="118" text-anchor="end" font-size="14" font-weight="800" fill="#2447D6">62%</text>
    </svg>`;
}

export function renderAluno() {
  showHeader({ active: "aluno", avatar: "AL" });
  app.innerHTML = `
    <div class="page">
      ${pageHead("3ª série · Turma A · Ciências da Natureza", "Olá, Ana. Hoje o foco é ler mais rápido.", `<a class="btn" href="#/treino">Começar treino do dia · 25 min</a>`, "t34")}

      ${metrics("Indicadores principais", [
        { xl: true, label: "Índice Ritmo", value: "62%", note: "+6 pontos nesta semana", tone: "up", hint: "Questões certas dentro do tempo-alvo" },
        { xl: true, label: "Tempo médio por questão", value: "3:24", valueTone: "amber", note: "Meta: 3:00", extra: `<div style="margin-top: 12px">${bar(88, "amber")}</div>` },
        { xl: true, label: "Nota TRI estimada · CN", value: "612", note: "+38 desde o diagnóstico", tone: "up", hint: "Faixa provável: 590 a 634" },
        { xl: true, label: "Sequência de treino", value: "12 dias", note: "Recorde pessoal: 19 dias" },
      ])}

      <section class="card" aria-labelledby="raio-x-title">
        <div class="card-head">
          <h2 class="lg" id="raio-x-title">Raio-X do Tempo: 45% do seu tempo vai na leitura do texto-base</h2>
          <span class="note">Média das últimas 40 questões · 3:24 por questão</span>
        </div>
        ${timeStrip("Leitura 1 minuto e 32, decisão do caminho 48 segundos, cálculo 51 segundos, conferência 13 segundos", [
          ["Leitura 1:32", 45, "read"],
          ["Caminho 0:48", 23.5, "path"],
          ["Cálculo 0:51", 25, "calc"],
          ["0:13", 6.5, "check"],
        ])}
        <div class="legend">
          <span>Leitura: até entender o que a questão pede</span>
          <span>Caminho: até escolher a lei ou fórmula</span>
          <span>Cálculo: até marcar a resposta</span>
          <span>Conferência: revisão final</span>
        </div>
        <div class="engine">
          <div>
            <b>Diagnóstico do motor</b>
            <p>Seu cálculo já está no ritmo de quem tira 700. O tempo extra está na leitura de textos longos com gráfico. Três semanas de treino de leitura direcionada devem trazer sua média para perto de 3:00.</p>
          </div>
          <a class="btn amber" href="#/treino">Treinar leitura · 8 min</a>
        </div>
      </section>

      <div class="grid-2">
        <section class="card" aria-labelledby="evol-title">
          <h2 id="evol-title">Índice Ritmo subiu de 41% para 62% em 8 semanas</h2>
          ${evolutionChart()}
        </section>

        <section class="card" aria-labelledby="prox-title">
          <h2 id="prox-title">Próximos treinos escolhidos pelo motor</h2>
          <div class="stack">
            ${NEXT.map(
              (t) => `<div class="row-box">
                <div class="tag mono">${t.mode}</div>
                <div class="grow"><div class="row-title">${t.title}</div><div class="row-sub">${t.why}</div></div>
                <div class="mono note b">${t.time}</div>
              </div>`,
            ).join("")}
          </div>
        </section>
      </div>

      <div class="grid-2">
        <section class="card" aria-labelledby="hab-title">
          <h2 id="hab-title">Suas habilidades de Física no Método Ritmo</h2>
          <div class="stages">${STAGES.map((s, i) => `<span>${i + 1} ${s}</span>`).join("<span>·</span>")}</div>
          <div style="margin-top: 12px">
            ${SKILLS.map(
              (s) => `<div class="skill">
                <div class="skill-name">${s.name}<small>${s.code}</small></div>
                <div class="dots" role="img" aria-label="Etapa ${s.stage} de 5">${[1, 2, 3, 4, 5].map((n) => `<i class="${n <= s.stage ? "on" : ""}"></i>`).join("")}</div>
                <div class="skill-stage">${s.stage} · ${STAGES[s.stage - 1]}</div>
              </div>`,
            ).join("")}
          </div>
        </section>

        <section class="card" aria-labelledby="pre-title">
          <h2 id="pre-title">Pré-requisitos do Fundamental que ainda pesam</h2>
          <p class="sub">O motor rastreou seus erros de Ensino Médio até a habilidade de origem. Fechar estas lacunas acelera várias questões ao mesmo tempo.</p>
          <div class="stack">
            ${GAPS.map(
              (g) => `<div class="gap-box">
                <div class="row-head"><span class="row-title">${g.name}</span><span class="pill warn tight">${g.year}</span></div>
                <div class="note">${g.impact}</div>
                ${bar(g.pct * 2, "amber", "h6")}
              </div>`,
            ).join("")}
          </div>
        </section>
      </div>
    </div>`;
}
