// Painel da direção: trilha vertical do 6º ano à 3ª série, lacunas da escola, notas por área e turmas.
import { app, bar, metrics, pageHead, showHeader } from "../ui.js";

const SERIES = [
  ["6º ano", 58, 128, 61, "—"],
  ["7º ano", 63, 142, 64, "—"],
  ["8º ano", 66, 155, 67, "—"],
  ["9º ano", 71, 168, 70, "38%"],
  ["1ª série", 69, 176, 68, "41%"],
  ["2ª série", 74, 189, 72, "48%"],
  ["3ª série", 78, 201, 75, "54%"],
];
const GAPS = [
  { name: "Proporção e regra de três", year: "7º ano", n: "214", areas: "MT, CN" },
  { name: "Leitura de gráficos e tabelas", year: "8º ano", n: "187", areas: "MT, CN, CH" },
  { name: "Notação científica e potências", year: "9º ano", n: "162", areas: "CN, MT" },
  { name: "Inferência em textos argumentativos", year: "9º ano", n: "139", areas: "LC, CH" },
];
const AREAS = [
  { name: "Linguagens", v: 548, d: "+19" },
  { name: "Ciências Humanas", v: 556, d: "+15" },
  { name: "Ciências da Natureza", v: 571, d: "+22" },
  { name: "Matemática", v: 589, d: "+27" },
];
const CLASSES = [
  { name: "3ª série A", n: 32, active: 29, idx: "54%", time: "3:44", trend: "+4 pontos", up: true },
  { name: "3ª série B", n: 30, active: 28, idx: "51%", time: "3:52", trend: "+3 pontos", up: true },
  { name: "2ª série A", n: 34, active: 31, idx: "49%", time: "4:05", trend: "+6 pontos", up: true },
  { name: "2ª série B", n: 33, active: 27, idx: "46%", time: "4:12", trend: "−1 ponto", up: false },
  { name: "1ª série A", n: 35, active: 33, idx: "42%", time: "4:31", trend: "+2 pontos", up: true },
  { name: "1ª série B", n: 34, active: 30, idx: "40%", time: "4:40", trend: "+1 ponto", up: true },
];

export function renderDirecao() {
  showHeader({ active: "direcao" });
  app.innerHTML = `
    <div class="page">
      ${pageHead(
        "Direção e coordenação · do 6º ano à 3ª série · outubro",
        "A leitura cresce todo ano, mas os pré-requisitos estacionam na entrada do Ensino Médio",
        `<div class="page-actions">
          <label class="field-sm">Unidade
            <select><option>Colégio Conceito</option><option>Todas as unidades</option></select>
          </label>
          <button class="btn" type="button" data-demo="Relatório para reunião gerado (demonstração)">Relatório para reunião</button>
        </div>`,
      )}

      ${metrics("Indicadores da escola", [
        { label: "Alunos ativos na semana", value: "612", note: "90% dos 680 matriculados" },
        { label: "Índice Ritmo · Ensino Médio", value: "48%", note: "+5 pontos no bimestre", tone: "up" },
        { label: "Pré-requisitos dominados · 9º ano", value: "71%", note: "Meta para entrar no EM: 80%" },
        { label: "Questões em revisão pelos professores", value: "2", note: "sinalizadas neste mês, ambas em Física" },
      ])}

      <section class="card" aria-labelledby="trilha-title">
        <h2 class="lg" id="trilha-title">Trilha vertical: do 6º ano à 3ª série</h2>
        <p class="sub">Leitura medida em palavras por minuto com pelo menos 70% de compreensão. Índice Ritmo a partir do 9º ano, com questões adaptadas.</p>
        <div class="table-wrap" style="margin-top: 16px">
          <table class="tbl min-820">
            <thead>
              <tr><th scope="col">Série</th><th scope="col" class="w-34">Pré-requisitos do ENEM dominados</th><th scope="col">Leitura (ppm)</th><th scope="col">Interpretação</th><th scope="col">Índice Ritmo</th></tr>
            </thead>
            <tbody>
              ${SERIES.map(([name, pre, ppm, interp, idx]) => {
                const entry = name === "1ª série";
                return `<tr class="${entry ? "alert" : ""}">
                  <th scope="row">${name}</th>
                  <td><div class="pre-bar">${bar(pre, entry ? "amber" : "", "h12")}<span class="mono">${pre}%</span></div></td>
                  <td class="mono b">${ppm}</td>
                  <td class="mono b">${interp}%</td>
                  <td class="mono b">${idx}</td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
        <div class="advice" style="margin-top: 16px"><strong>Leitura do motor:</strong> a queda de 71% para 69% entre o 9º ano e a 1ª série vem de Química e Física, que estreiam com pré-requisitos de proporção e notação científica ainda frágeis. Reforçar essas duas habilidades no 9º ano é a ação de maior impacto.</div>
      </section>

      <div class="grid-2">
        <section class="card" aria-labelledby="lac-title">
          <h2 id="lac-title">Pré-requisitos com mais lacunas na escola</h2>
          <div class="table-wrap">
            <table class="tbl">
              <thead><tr><th scope="col">Habilidade</th><th scope="col">Origem</th><th scope="col">Alunos com lacuna</th><th scope="col">Áreas do ENEM afetadas</th></tr></thead>
              <tbody>
                ${GAPS.map((g) => `<tr><td class="b">${g.name}</td><td class="soft">${g.year}</td><td class="mono b">${g.n}</td><td class="soft">${g.areas}</td></tr>`).join("")}
              </tbody>
            </table>
          </div>
        </section>

        <section class="card" aria-labelledby="tri-title">
          <h2 id="tri-title">Nota TRI estimada da 3ª série por área</h2>
          <div class="stack" style="gap: 16px; margin-top: 18px">
            ${AREAS.map(
              (a) => `<div>
                <div class="row-head" style="margin-bottom: 6px"><span>${a.name}</span><span class="mono">${a.v} <span style="color: var(--ok)">${a.d}</span></span></div>
                ${bar(Math.round(((a.v - 300) / 500) * 100), "", "h10")}
              </div>`,
            ).join("")}
          </div>
          <p style="margin: 14px 0 0; font-size: 12px; color: var(--muted)">Escala de 300 a 800. Variação desde o diagnóstico de fevereiro.</p>
        </section>
      </div>

      <section class="card" aria-labelledby="turmas-title">
        <h2 id="turmas-title">Comparativo de turmas do Ensino Médio</h2>
        <div class="table-wrap">
          <table class="tbl min-720">
            <thead><tr><th scope="col">Turma</th><th scope="col">Alunos</th><th scope="col">Ativos</th><th scope="col">Índice Ritmo</th><th scope="col">Tempo médio</th><th scope="col">No bimestre</th></tr></thead>
            <tbody>
              ${CLASSES.map(
                (c) => `<tr>
                  <td class="b">${c.name}</td>
                  <td class="mono">${c.n}</td>
                  <td class="mono">${c.active}</td>
                  <td class="mono b">${c.idx}</td>
                  <td class="mono">${c.time}</td>
                  <td class="${c.up ? "good" : "bad"}">${c.trend}</td>
                </tr>`,
              ).join("")}
            </tbody>
          </table>
        </div>
      </section>
    </div>`;
}
