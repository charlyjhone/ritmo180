// Treino: a questão aparece em partes para medir leitura, escolha do caminho e cálculo.
import { QUESTIONS } from "../content.js";
import { app, bar, clock, onLeave, pill, showHeader } from "../ui.js";

const LETTERS = ["A", "B", "C", "D", "E"];
const PHASES = [
  ["Leitura", "amber"],
  ["Escolha do caminho", ""],
  ["Cálculo", "calc"],
];

export function renderTreino() {
  showHeader({
    active: "treino",
    pills: [
      ["Funciona sem internet · sincroniza depois", "good"],
      ["Questões criadas para demonstração", "warn"],
    ],
  });

  // phase: 0 lendo o texto, 1 lendo o comando, 2 calculando, 3 respondida.
  const start = (index) => ({ index, phase: 0, t0: Date.now(), t1: null, t2: null, t3: null, chosen: null, hint: false });
  let s = start(0);

  const elapsed = () => ((s.t3 || Date.now()) - s.t0) / 1000;

  function phaseLengths() {
    const now = s.t3 || Date.now();
    return [
      s.t1 ? (s.t1 - s.t0) / 1000 : (now - s.t0) / 1000,
      s.t2 ? (s.t2 - s.t1) / 1000 : s.phase === 1 ? (now - s.t1) / 1000 : 0,
      s.t3 ? (s.t3 - s.t2) / 1000 : s.phase === 2 ? (now - s.t2) / 1000 : 0,
    ];
  }

  const questionHtml = (q) => {
    const answered = s.chosen !== null;
    const right = s.chosen === q.correct;
    const time = clock(elapsed());
    const over = elapsed() > q.target;
    const title = !right ? `Pegadinha: alternativa ${LETTERS[s.chosen]}` : over ? `Certo, mas ${time} passou do tempo-alvo` : `Certo e dentro do tempo-alvo: ${time}`;
    const text = !right
      ? q.traps[s.chosen]
      : over
        ? "O acerto conta, mas a meta é chegar lá mais rápido. Veja no Raio-X qual fase pesou."
        : "Questão dentro do Índice Ritmo. O fantasma desta habilidade vai ficar um pouco mais rápido.";
    return `
      <div class="tags">
        ${pill("Corrida contra o fantasma", "brand")}
        ${pill(q.skill)}
        ${pill(s.index === 0 ? "Questão 1 de 8" : "Questão gêmea · nova situação")}
      </div>
      <div style="margin-top: 24px">
        <div class="label-caps">TEXTO-BASE</div>
        <p class="q-text">${q.text}</p>
      </div>
      ${s.phase === 0 ? `<button class="btn" type="button" data-act="gotCommand" data-focus style="margin-top: 24px">Li o texto · mostrar o comando</button>` : ""}
      ${s.phase >= 1 ? `<div class="q-command"><div class="label-caps">COMANDO</div><p class="q-text">${q.command}</p></div>` : ""}
      ${
        s.phase === 1
          ? `<div class="btn-row" style="margin-top: 20px">
              <button class="btn" type="button" data-act="gotPath" data-focus>Sei o caminho · mostrar alternativas</button>
              <button class="btn soft" type="button" data-act="toggleHint">Pedir uma pista ao tutor</button>
            </div>`
          : ""
      }
      ${s.hint && s.phase >= 1 ? `<div class="hint"><strong>Tutor:</strong> ${q.hint}</div>` : ""}
      ${
        s.phase >= 2
          ? `<div class="alts">
              ${q.alts
                .map((alt, i) => {
                  const state = answered && i === q.correct ? "right" : answered && i === s.chosen ? "wrong" : "";
                  return `<button class="alt ${state}" type="button" data-pick="${i}"${i === 0 && !answered ? " data-focus" : ""}><span class="mono">${LETTERS[i]}</span><span>${alt}</span></button>`;
                })
                .join("")}
            </div>`
          : ""
      }
      ${
        answered
          ? `<div class="feedback ${right ? "good" : ""}">
              <b>${title}</b>
              <p>${text}</p>
              <p class="solution"><strong>Resolução:</strong> ${q.solution}</p>
            </div>
            <div class="btn-row">
              <button class="btn" type="button" data-act="twin" data-focus>${s.index === 0 ? "Fazer a questão gêmea" : "Recomeçar a demonstração"}</button>
              <a class="btn soft" href="#/">Voltar ao painel</a>
            </div>`
          : ""
      }`;
  };

  function render() {
    const q = QUESTIONS[s.index];
    app.innerHTML = `
      <div class="split">
        <section class="card split-main" aria-label="Questão">${questionHtml(q)}</section>
        <aside class="split-side">
          <section class="card" aria-label="Cronômetro">
            <div class="metric-label">Seu tempo</div>
            <div class="timer mono" id="clock"></div>
            <div class="note" style="color: var(--body); font-weight: 600">Fantasma: <span class="mono">${clock(q.target)}</span> · tempo-alvo desta questão</div>
            <div id="ghost" style="margin-top: 12px"></div>
          </section>
          <section class="card" aria-label="Raio-X do Tempo desta questão">
            <div class="side-title">Raio-X do Tempo</div>
            <div class="note" style="margin-top: 4px">Cada toque marca uma fase da resolução.</div>
            <div class="phases" id="phases"></div>
          </section>
          <section class="card" aria-label="Como funciona">
            <div style="font-size: 14px; font-weight: 800">Por que a questão aparece em partes?</div>
            <p class="note" style="margin: 6px 0 0; color: var(--body); line-height: 1.55">Separar leitura, escolha do caminho e cálculo mostra onde o seu tempo realmente vai. É esse dado que o motor usa para escolher seu próximo treino.</p>
          </section>
        </aside>
      </div>`;

    app.querySelectorAll("[data-act]").forEach((b) => (b.onclick = actions[b.dataset.act]));
    app.querySelectorAll("[data-pick]").forEach((b) => (b.onclick = () => pick(Number(b.dataset.pick))));
    tick();
    app.querySelector("[data-focus]")?.focus();
  }

  // O cronômetro atualiza só a coluna lateral, sem redesenhar a questão.
  function tick() {
    const q = QUESTIONS[s.index];
    const seconds = elapsed();
    const over = seconds > q.target;
    const el = app.querySelector("#clock");
    el.textContent = clock(seconds);
    el.classList.toggle("over", over);
    app.querySelector("#ghost").innerHTML = bar(Math.min(100, Math.round((seconds / q.target) * 100)), over ? "bad" : "", "h10");
    const lengths = phaseLengths();
    const total = Math.max(1, lengths[0] + lengths[1] + lengths[2]);
    app.querySelector("#phases").innerHTML = PHASES.map(
      ([name, tone], i) => `<div>
        <div class="row-head"><span>${name}</span><span class="mono">${clock(lengths[i])}</span></div>
        ${bar(Math.round((lengths[i] / total) * 100), tone)}
      </div>`,
    ).join("");
  }

  function pick(i) {
    if (s.chosen !== null) return;
    s = { ...s, chosen: i, t3: Date.now(), phase: 3 };
    render();
  }

  const actions = {
    gotCommand() {
      s = { ...s, phase: 1, t1: Date.now() };
      render();
    },
    gotPath() {
      s = { ...s, phase: 2, t2: Date.now() };
      render();
    },
    toggleHint() {
      s = { ...s, hint: !s.hint };
      render();
    },
    twin() {
      s = start(s.index === 0 ? 1 : 0);
      render();
    },
  };

  render();
  const timer = setInterval(() => {
    if (!s.t3) tick();
  }, 500);
  onLeave(() => clearInterval(timer));
}
