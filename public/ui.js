// Utilidades de interface compartilhadas pelas telas.
export const app = document.getElementById("app");
const topbar = document.getElementById("topbar");

const AREAS = [
  ["aluno", "#/", "Aluno"],
  ["treino", "#/treino", "Treino"],
  ["leitura", "#/leitura", "Leitura"],
  ["simulado", "#/simulado", "Simulado"],
  ["professor", "#/professor", "Professor"],
  ["direcao", "#/direcao", "Direção"],
  ["familia", "#/familia", "Família"],
  ["rede", "#/rede", "Rede"],
];

export const FICTICIOS = ["Dados fictícios de demonstração", "warn"];

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const pill = (text, tone = "gray") => `<span class="pill ${tone}">${text}</span>`;

// Cabeçalho da plataforma. O portal da família, que é uma tela de celular, chama hideHeader().
export function showHeader({ active, dark = false, title = "Ritmo 180", subtitle = "Colégio Conceito", pills = [FICTICIOS], avatar, nav }) {
  const links = nav || AREAS;
  topbar.hidden = false;
  topbar.className = dark ? "dark" : "";
  topbar.innerHTML = `
    <div class="topbar-inner">
      <div class="brand">
        <div class="logo">180</div>
        <div><div class="brand-name">${title}</div><div class="brand-sub">${subtitle}</div></div>
      </div>
      <nav aria-label="Áreas da plataforma">
        ${links.map(([id, href, label]) => `<a class="navlink" href="${href}"${id === active ? ' aria-current="page"' : ""}>${label}</a>`).join("")}
      </nav>
      <div class="topbar-end">
        ${pills.map(([text, tone]) => pill(text, tone)).join("")}
        ${avatar ? `<div class="avatar" aria-hidden="true">${avatar}</div>` : ""}
      </div>
    </div>`;
}

export function hideHeader() {
  topbar.hidden = true;
}

// Título da tela: linha de contexto, frase principal e ações à direita.
export const pageHead = (kicker, title, actions = "", size = "") => `
  <div class="page-head">
    <div>
      <div class="kicker">${kicker}</div>
      <h1 class="${size}" id="headline">${title}</h1>
    </div>
    ${actions}
  </div>`;

export const metric = ({ label, value, note, tone = "", valueTone = "", hint = "", extra = "", xl = false }) => `
  <div class="card">
    <div class="metric-label">${label}</div>
    <div class="metric-value mono ${valueTone} ${xl ? "xl" : ""}">${value}</div>
    ${note ? `<div class="metric-note ${tone}">${note}</div>` : ""}
    ${hint ? `<div class="metric-hint">${hint}</div>` : ""}
    ${extra}
  </div>`;

export const metrics = (label, items) => `<section class="grid-metrics" aria-label="${label}">${items.map(metric).join("")}</section>`;

export const bar = (pct, tone = "", size = "h8") => `<div class="track ${size}"><i class="${tone}" style="width: ${pct}%"></i></div>`;

// Faixa do Raio-X do Tempo: cada fase ocupa a fatia proporcional ao tempo gasto.
export const timeStrip = (aria, segments, small = false) => `
  <div class="strip ${small ? "small" : ""}" role="img" aria-label="${aria}">
    ${segments.map(([label, width, tone]) => `<div class="${tone}" style="width: ${width}%">${label}</div>`).join("")}
  </div>`;

export function clock(seconds) {
  const v = Math.max(0, Math.round(seconds));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
}

// Limpeza da tela atual (ex.: parar um cronômetro) antes de trocar de rota.
let leaveHandler = null;
export function onLeave(fn) {
  leaveHandler = fn;
}
export function leaveScreen() {
  leaveHandler?.();
  leaveHandler = null;
}

export function toast(message) {
  document.querySelector(".toast")?.remove();
  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.remove(), 2600);
}
