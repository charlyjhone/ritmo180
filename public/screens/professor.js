// Painel do professor: domínio por habilidade, gargalo de tempo, pegadinhas, alertas e itens sinalizados.
import { app, bar, metrics, pageHead, showHeader, timeStrip } from "../ui.js";

const SKILLS = ["Energia", "Cinemática", "Ondas", "Hidrostática", "Termologia", "Óptica"];
const STUDENTS = [
  ["Ana L.", [82, 91, 64, 48, 66, 38], "62%"],
  ["Bruno S.", [74, 80, 58, 55, 61, 44], "57%"],
  ["Carla M.", [45, 52, 40, 33, 47, 29], "36%"],
  ["Davi R.", [90, 94, 85, 77, 81, 72], "79%"],
  ["Eduarda P.", [68, 72, 70, 62, 58, 51], "60%"],
  ["Felipe T.", [55, 63, 49, 41, 52, 35], "41%"],
  ["Gabriela N.", [79, 85, 76, 60, 73, 46], "66%"],
  ["Heitor C.", [61, 58, 52, 47, 50, 31], "39%"],
];
const TRAPS = [
  { name: "Não converteu W para kW", where: "Energia elétrica · 14 questões", pct: 38 },
  { name: "Esqueceu de multiplicar pelo período", where: "Energia e consumo · 9 questões", pct: 27 },
  { name: "Trocou o raio incidente pelo refratado", where: "Óptica · 6 questões", pct: 22 },
];
const ALERTS = [
  { ini: "FT", name: "Felipe T.", why: "Índice Ritmo caiu 9 pontos em 2 semanas", action: "Ver trilha" },
  { ini: "HC", name: "Heitor C.", why: "Tempo médio 5:10, gargalo no cálculo", action: "Enviar sprints" },
  { ini: "CM", name: "Carla M.", why: "Sem treinar há 6 dias", action: "Avisar família" },
];
const FLAGS = [
  { id: "Item 48213", area: "Óptica · H1", why: "Os três resolvedores independentes divergiram: dois marcaram C e um marcou D." },
  { id: "Item 48877", area: "Termologia · H21", why: "Alunos com nota alta estão caindo na alternativa B mais do que os demais. Pode haver ambiguidade no enunciado." },
];

export function renderProfessor() {
  showHeader({ active: "professor" });
  app.innerHTML = `
    <div class="page">
      ${pageHead(
        "Física · 3ª série A · 32 alunos",
        "Óptica é o ponto fraco da turma, e a leitura é o gargalo de tempo",
        `<div class="page-actions">
          <button class="btn outline" type="button" data-demo="Relatório exportado (demonstração)">Exportar relatório</button>
          <button class="btn" type="button" data-demo="Trilha de Óptica enviada à turma (demonstração)">Enviar trilha de Óptica à turma</button>
        </div>`,
      )}

      ${metrics("Indicadores da turma", [
        { label: "Índice Ritmo da turma", value: "54%", note: "+4 pontos no mês", tone: "up" },
        { label: "Tempo médio por questão", value: "3:44", valueTone: "amber", note: "Meta: 3:00" },
        { label: "Nota TRI estimada · CN", value: "571", note: "+22 desde o diagnóstico", tone: "up" },
        { label: "Alunos ativos na semana", value: "29 / 32", note: "3 sem treinar há 5+ dias", tone: "down" },
      ])}

      <section class="card" aria-labelledby="heat-title">
        <div class="card-head">
          <h2 class="lg" id="heat-title">Domínio por habilidade: Óptica abaixo de 50% para 6 dos 8 alunos destacados</h2>
          <div class="heat-legend"><span>0%</span><i class="h0"></i><i class="h1"></i><i class="h2"></i><i class="h3"></i><i class="h4"></i><span>100%</span></div>
        </div>
        <div class="table-wrap" style="margin-top: 16px">
          <table class="heat">
            <thead>
              <tr><th scope="col">Aluno</th>${SKILLS.map((k) => `<th scope="col">${k}</th>`).join("")}<th scope="col">Índice Ritmo</th></tr>
            </thead>
            <tbody>
              ${STUDENTS.map(
                ([name, values, index]) => `<tr>
                  <th scope="row">${name}</th>
                  ${values.map((v) => `<td class="mono h${Math.min(4, Math.floor(v / 20))}">${v}%</td>`).join("")}
                  <td class="mono idx">${index}</td>
                </tr>`,
              ).join("")}
            </tbody>
          </table>
        </div>
      </section>

      <div class="grid-2">
        <section class="card" aria-labelledby="gar-title">
          <h2 id="gar-title">Raio-X da turma: 1:41 por questão só na leitura</h2>
          ${timeStrip(
            "Leitura 1 minuto e 41, caminho 55 segundos, cálculo 58 segundos, conferência 10 segundos",
            [
              ["Leitura 1:41", 45, "read"],
              ["Caminho 0:55", 24.5, "path"],
              ["Cálculo 0:58", 26, "calc"],
              ["", 4.5, "check"],
            ],
            true,
          )}
          <p class="sub" style="margin-top: 14px; line-height: 1.55">Sugestão do motor: 10 minutos de leitura direcionada no início de duas aulas por semana. A turma ganha mais tempo aqui do que acelerando o cálculo.</p>
        </section>

        <section class="card" aria-labelledby="peg-title">
          <h2 id="peg-title">Pegadinhas que mais pegam a turma</h2>
          <div class="stack" style="gap: 14px">
            ${TRAPS.map(
              (t) => `<div>
                <div class="row-head"><span>${t.name}</span><span class="mono">${t.pct}%</span></div>
                <div style="font-size: 12px; color: var(--muted); margin: 2px 0 6px">${t.where}</div>
                ${bar(t.pct * 2, "amber")}
              </div>`,
            ).join("")}
          </div>
        </section>
      </div>

      <div class="grid-2">
        <section class="card" aria-labelledby="alert-title">
          <h2 id="alert-title">Alunos que precisam de atenção agora</h2>
          <div class="stack" style="gap: 10px">
            ${ALERTS.map(
              (a) => `<div class="row-box" style="padding: 12px 14px">
                <div class="avatar" aria-hidden="true" style="font-size: 13px; margin: 0">${a.ini}</div>
                <div class="grow"><div class="row-title">${a.name}</div><div class="row-sub" style="margin-top: 0">${a.why}</div></div>
                <button class="btn soft slim" type="button" data-demo="${a.action}: ${a.name} (demonstração)">${a.action}</button>
              </div>`,
            ).join("")}
          </div>
        </section>

        <section class="card" aria-labelledby="rev-title">
          <h2 id="rev-title">Questões sinalizadas para sua revisão: 2</h2>
          <p class="sub">Só chegam aqui as questões que a validação automática ou a estatística de uso sinalizou.</p>
          <div class="stack" style="gap: 10px">
            ${FLAGS.map(
              (f) => `<div class="flag">
                <div class="flag-head mono">${f.id}<span>${f.area}</span></div>
                <p>${f.why}</p>
                <div class="btn-row">
                  <button class="btn slim" type="button" data-demo="${f.id} aberto para revisão (demonstração)">Revisar</button>
                  <button class="btn outline slim" type="button" data-demo="${f.id} descartado (demonstração)">Descartar item</button>
                </div>
              </div>`,
            ).join("")}
          </div>
        </section>
      </div>
    </div>`;
}
