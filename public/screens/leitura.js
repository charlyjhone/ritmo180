// Leitura com compreensão: lê no ritmo natural, responde sem o texto, e a velocidade só vale com 3 de 4 acertos.
import { READING } from "../content.js";
import { app, clock, onLeave, pill, showHeader } from "../ui.js";

const WORDS = READING.text.split(/\s+/).length;

export function renderLeitura() {
  showHeader({ active: "leitura", pills: [["Texto criado para demonstração", "warn"]] });

  // phase: 0 instruções, 1 lendo, 2 perguntas, 3 resultado.
  let s = { phase: 0, t0: null, t1: null, answers: {} };

  const seconds = () => (s.t0 ? ((s.t1 || Date.now()) - s.t0) / 1000 : 0);

  const views = {
    0: () => `
      <h1 style="margin-top: 24px; font-size: 28px; letter-spacing: 0">Leia no seu ritmo natural. Depois, 4 perguntas sem o texto.</h1>
      <p class="lead">A velocidade só conta se você entender. Sua leitura vale quando acerta pelo menos 3 das 4 perguntas.</p>
      <button class="btn" type="button" data-act="start" data-focus style="margin-top: 24px">Começar a leitura</button>`,
    1: () => `
      <h2 style="margin-top: 24px; font-size: 22px">${READING.title}</h2>
      <p class="read-text">${READING.text}</p>
      <button class="btn" type="button" data-act="finish" data-focus style="margin-top: 24px">Terminei de ler</button>`,
    2: () => `
      <p style="margin: 24px 0 0; font-size: 15px; color: var(--body)">O texto ficou oculto. Responda com o que você entendeu.</p>
      ${READING.questions
        .map(
          (q, qi) => `<fieldset>
            <legend>${q.kind}</legend>
            <div style="font-size: 16px; font-weight: 700; line-height: 1.5">${q.prompt}</div>
            ${q.opts.map((text, oi) => `<button class="opt" type="button" data-q="${qi}" data-o="${oi}" aria-pressed="${s.answers[qi] === oi}">${text}</button>`).join("")}
          </fieldset>`,
        )
        .join("")}
      <button class="btn" type="button" data-act="result" id="see-result" style="margin-top: 20px"${Object.keys(s.answers).length === READING.questions.length ? "" : " hidden"}>Ver meu resultado</button>`,
    3: () => {
      const score = READING.questions.filter((q, i) => s.answers[i] === q.correct).length;
      const ppm = seconds() > 0 ? Math.round(WORDS / (seconds() / 60)) : 0;
      return `
        <h2 style="margin-top: 24px; font-size: 26px">${score >= 3 ? `Leitura válida: ${ppm} palavras por minuto com compreensão` : "Leitura não validada: a compreensão ficou abaixo de 3 de 4"}</h2>
        <div class="result-grid">
          <div class="mini"><div class="metric-label">Velocidade</div><div class="mono">${ppm} ppm</div></div>
          <div class="mini"><div class="metric-label">Compreensão</div><div class="mono">${score} de 4</div></div>
          <div class="mini"><div class="metric-label">Meta do 8º ano</div><div class="mono">160 ppm</div></div>
        </div>
        <div class="stack" style="gap: 10px">
          ${READING.questions
            .map((q, i) => {
              const right = s.answers[i] === q.correct;
              const kind = q.kind.charAt(0) + q.kind.slice(1).toLowerCase();
              return `<div class="review ${right ? "good" : ""}"><strong>${kind}:</strong> ${right ? "certo, " : "errou: "}${q.why}</div>`;
            })
            .join("")}
        </div>
        <button class="btn" type="button" data-act="reset" data-focus style="margin-top: 20px">Fazer outro texto</button>`;
    },
  };

  const actions = {
    start() {
      s = { phase: 1, t0: Date.now(), t1: null, answers: {} };
      render();
    },
    finish() {
      s = { ...s, phase: 2, t1: Date.now() };
      render();
    },
    result() {
      s = { ...s, phase: 3 };
      render();
    },
    reset() {
      s = { phase: 0, t0: null, t1: null, answers: {} };
      render();
    },
  };

  function answer(button) {
    const q = button.dataset.q;
    s.answers[q] = Number(button.dataset.o);
    app.querySelectorAll(`[data-q="${q}"]`).forEach((b) => b.setAttribute("aria-pressed", b === button));
    app.querySelector("#see-result").hidden = Object.keys(s.answers).length < READING.questions.length;
  }

  function render() {
    app.querySelector("#reading").innerHTML = views[s.phase]();
    app.querySelector("#clock").textContent = clock(seconds());
    app.querySelectorAll("[data-act]").forEach((b) => (b.onclick = actions[b.dataset.act]));
    app.querySelectorAll("[data-q]").forEach((b) => (b.onclick = () => answer(b)));
    app.querySelector("[data-focus]")?.focus();
  }

  app.innerHTML = `
    <div class="split">
      <section class="card split-main" aria-label="Exercício de leitura">
        <div class="tags">
          ${pill("Leitura com compreensão", "brand")}
          ${pill("Lucas · 8º ano")}
          ${pill("Prepara para LC e CH")}
        </div>
        <div id="reading"></div>
      </section>
      <aside class="split-side">
        <section class="card" aria-label="Cronômetro de leitura">
          <div class="metric-label">Tempo de leitura</div>
          <div class="timer reading mono" id="clock"></div>
          <div class="note" style="color: var(--body)">${WORDS} palavras no texto</div>
        </section>
        <section class="card" aria-label="Estratégias treinadas">
          <div class="side-title">O que cada pergunta treina</div>
          <div class="defs">
            <div><strong>Localizar:</strong> achar a informação explícita sem reler tudo.</div>
            <div><strong>Inferir:</strong> entender o que o texto sugere sem dizer.</div>
            <div><strong>Tese:</strong> separar a ideia central dos exemplos.</div>
            <div><strong>Extrapolação:</strong> eliminar a alternativa que vai além do texto, a pegadinha mais comum em Linguagens e Humanas.</div>
          </div>
        </section>
        <section class="card" aria-label="Evolução">
          <div class="side-title">Lucas no bimestre</div>
          <div class="kv" style="margin-top: 12px"><span>Leitura válida</span><span class="mono b">138 → 151 ppm</span></div>
          <div class="kv"><span>Compreensão média</span><span class="mono b">71% → 78%</span></div>
          <div class="kv"><span>Ponto fraco</span><span class="b">Inferência</span></div>
        </section>
      </aside>
    </div>`;

  render();
  const timer = setInterval(() => {
    if (s.phase === 1) app.querySelector("#clock").textContent = clock(seconds());
  }, 500);
  onLeave(() => clearInterval(timer));
}
