// Simulado no modo prova: mapa de 90 questões com triagem e, depois, o resultado comentado.
import { app, bar, metrics, pageHead, showHeader } from "../ui.js";

const LABEL = { done: "respondida", later: "adiada", skip: "pulada" };

function initialMarks() {
  const marks = {};
  for (let n = 91; n <= 125; n++) marks[n] = "done";
  [97, 104, 118].forEach((n) => (marks[n] = "later"));
  [112, 121].forEach((n) => (marks[n] = "skip"));
  return marks;
}

const THIRDS = [
  { name: "1º terço · questões 91 a 120", v: 78 },
  { name: "2º terço · questões 121 a 150", v: 71 },
  { name: "3º terço · questões 151 a 180", v: 62 },
];
const WHAT_IF = [
  { gain: "+12", title: "Revisar as fáceis antes de entregar", detail: "Você errou 97 e 104, consideradas fáceis, e sobraram 6 minutos" },
  { gain: "+6", title: "Pular a 160 em vez de insistir", detail: "Gastou 9:40 nela e errou. Esse tempo cabia em 3 questões médias" },
  { gain: "+3", title: "Não chutar a 172", detail: "Chute em questão difícil quase não soma na TRI" },
];
const INCOHERENT = [
  { q: "97", diff: "Fácil", res: "Errou", time: "1:10", note: 'Leu "massa" como "peso" no comando', ok: false },
  { q: "104", diff: "Fácil", res: "Errou", time: "0:52", note: "Conta certa, unidade errada na alternativa", ok: false },
  { q: "129", diff: "Difícil", res: "Acertou", time: "2:15", note: "Acerto pouco provável para sua faixa: a TRI dá menos peso", ok: true },
  { q: "160", diff: "Difícil", res: "Errou", time: "9:40", note: "Tempo muito acima do alvo sem retorno", ok: false },
];

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const cells = (from, to) => range(from, to).map((n) => `<button class="cell" type="button" data-n="${n}">${n}</button>`).join("");

const examHtml = () => `
  ${metrics("Situação da prova", [
    { label: "Tempo restante", value: "2:41:30", note: "Inclui 30 min reservados ao cartão" },
    { label: "Ritmo", value: "+6 min", valueTone: "ok", note: "adiantado em relação a 3:00 por questão" },
    { label: "Respondidas", value: `<span id="answered"></span>`, note: `<span id="pending"></span>` },
  ])}

  <section class="card" aria-labelledby="mapa-title">
    <div class="card-head">
      <h2 id="mapa-title">Mapa da prova</h2>
      <div class="map-legend">
        <span><i class="done"></i>Respondida</span>
        <span><i class="later"></i>Adiada</span>
        <span><i class="skip"></i>Pulada</span>
        <span><i class="current"></i>Atual</span>
      </div>
    </div>
    <div class="map-area">CIÊNCIAS DA NATUREZA · 91 A 135</div>
    <div class="cells">${cells(91, 135)}</div>
    <div class="map-area">MATEMÁTICA · 136 A 180</div>
    <div class="cells">${cells(136, 180)}</div>
  </section>

  <section class="card" aria-labelledby="tri-title">
    <h2 id="tri-title"></h2>
    <p class="sub">Antes de resolver, decida em poucos segundos. Na TRI, garantir as fáceis vale mais do que brigar com as difíceis.</p>
    <div class="btn-row" style="gap: 10px">
      <button class="btn" type="button" data-mark="done">Resolver agora</button>
      <button class="btn later" type="button" data-mark="later">Adiar para o fim</button>
      <button class="btn soft" type="button" data-mark="skip">Pular de propósito</button>
    </div>
  </section>`;

const resultHtml = () => `
  ${metrics("Notas estimadas", [
    { label: "Nota TRI estimada · CN", value: "618", note: "Faixa provável: 596 a 640" },
    { label: "Nota TRI estimada · MT", value: "642", note: "Faixa provável: 619 a 665" },
    { label: "Tempo médio por questão", value: "2:58", note: "Dentro do ritmo da prova", tone: "up" },
    { label: "Ganho possível com estratégia", value: "+21", valueTone: "brand", note: "pontos em CN, sem estudar mais nada" },
  ])}

  <div class="grid-2">
    <section class="card" aria-labelledby="fadiga-title">
      <h2 id="fadiga-title">Curva de fadiga: o acerto cai 16 pontos no último terço</h2>
      <div class="stack" style="gap: 16px; margin-top: 20px">
        ${THIRDS.map(
          (t) => `<div>
            <div class="row-head" style="margin-bottom: 6px"><span>${t.name}</span><span class="mono">${t.v}%</span></div>
            ${bar(t.v, t.v < 65 ? "amber" : "", "h12")}
          </div>`,
        ).join("")}
      </div>
      <p class="sub" style="margin-top: 16px; line-height: 1.55">Próximo passo do motor: blocos de resistência de 45 questões nas próximas duas semanas.</p>
    </section>

    <section class="card" aria-labelledby="e-se-title">
      <h2 id="e-se-title">E se você tivesse feito diferente?</h2>
      <div class="stack">
        ${WHAT_IF.map(
          (w) => `<div class="row-box">
            <div class="tag big mono">${w.gain}</div>
            <div class="grow"><div class="row-title">${w.title}</div><div class="row-sub">${w.detail}</div></div>
          </div>`,
        ).join("")}
      </div>
    </section>
  </div>

  <section class="card" aria-labelledby="incoer-title">
    <h2 id="incoer-title">Questões que a TRI lê como incoerência</h2>
    <p class="sub">Errar questões fáceis enquanto acerta difíceis reduz a nota mais do que o número de acertos sugere.</p>
    <div class="table-wrap">
      <table class="tbl min-640">
        <thead><tr><th scope="col">Questão</th><th scope="col">Dificuldade</th><th scope="col">Você</th><th scope="col">Tempo gasto</th><th scope="col">O que aconteceu</th></tr></thead>
        <tbody>
          ${INCOHERENT.map(
            (r) => `<tr>
              <td class="mono b">${r.q}</td>
              <td>${r.diff}</td>
              <td class="${r.ok ? "good" : "bad"}">${r.res}</td>
              <td class="mono">${r.time}</td>
              <td class="soft">${r.note}</td>
            </tr>`,
          ).join("")}
        </tbody>
      </table>
    </div>
  </section>`;

export function renderSimulado() {
  showHeader({ active: "simulado" });
  const base = initialMarks();
  let marks = { ...base };
  let current = 126;
  let view = "exam";

  const headline = () => (view === "exam" ? `Questão ${current}: decida se resolve, adia ou pula` : "Você terminou no ritmo, mas deixou 21 pontos na mesa");

  // Atualiza o mapa no lugar, para o foco do teclado continuar na questão clicada.
  function paint() {
    app.querySelector("#headline").textContent = headline();
    if (view !== "exam") return;
    const count = (mark) => Object.values(marks).filter((m) => m === mark).length;
    app.querySelector("#answered").textContent = `${count("done")} / 90`;
    app.querySelector("#pending").textContent = `${count("later")} adiadas · ${count("skip")} puladas de propósito`;
    app.querySelector("#tri-title").textContent = `Triagem da questão ${current}`;
    app.querySelectorAll(".cell").forEach((cell) => {
      const n = Number(cell.dataset.n);
      const here = n === current;
      cell.className = `cell ${here ? "current" : marks[n] || ""}`;
      cell.setAttribute("aria-label", `Questão ${n}${here ? ", atual" : marks[n] ? `, ${LABEL[marks[n]]}` : ", pendente"}`);
    });
  }

  function mark(state) {
    marks[current] = state;
    let next = current + 1;
    while (next <= 180 && marks[next]) next++;
    current = Math.min(next, 180);
    paint();
  }

  function showView() {
    app.querySelector("#view").innerHTML = view === "exam" ? examHtml() : resultHtml();
    app.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-selected", b.dataset.view === view));
    app.querySelectorAll("[data-n]").forEach(
      (b) =>
        (b.onclick = () => {
          current = Number(b.dataset.n);
          paint();
        }),
    );
    app.querySelectorAll("[data-mark]").forEach((b) => (b.onclick = () => mark(b.dataset.mark)));
    paint();
  }

  app.innerHTML = `
    <div class="page">
      ${pageHead(
        "Simulado 2º dia · Ciências da Natureza e Matemática · 90 questões em 5 horas",
        "",
        `<div class="segmented" role="tablist" aria-label="Visão do simulado">
          <button class="btn" type="button" role="tab" data-view="exam">Durante a prova</button>
          <button class="btn" type="button" role="tab" data-view="result">Resultado</button>
        </div>`,
        "t30",
      )}
      <div id="view" style="display: flex; flex-direction: column; gap: 24px"></div>
    </div>`;

  app.querySelectorAll("[data-view]").forEach(
    (b) =>
      (b.onclick = () => {
        view = b.dataset.view;
        showView();
      }),
  );
  showView();
}
