// Roteador: decide a tela a partir do hash.
import { app, leaveScreen, esc, toast } from "./ui.js";
import { renderAluno } from "./screens/aluno.js";
import { renderTreino } from "./screens/treino.js";
import { renderLeitura } from "./screens/leitura.js";
import { renderSimulado } from "./screens/simulado.js";
import { renderProfessor } from "./screens/professor.js";
import { renderDirecao } from "./screens/direcao.js";
import { renderFamilia } from "./screens/familia.js";
import { renderRede } from "./screens/rede.js";
import { renderImplantacao } from "./screens/implantacao.js";

const ROUTES = new Map([
  ["", [renderAluno, "Painel do aluno"]],
  ["treino", [renderTreino, "Treino com Raio-X do Tempo"]],
  ["leitura", [renderLeitura, "Leitura e interpretação"]],
  ["simulado", [renderSimulado, "Simulado no modo prova"]],
  ["professor", [renderProfessor, "Painel do professor"]],
  ["direcao", [renderDirecao, "Painel da direção"]],
  ["familia", [renderFamilia, "Portal da família"]],
  ["rede", [renderRede, "Administração da rede"]],
  ["implantacao", [renderImplantacao, "Implantação de uma escola"]],
]);

function route() {
  leaveScreen();
  const [, page = ""] = location.hash.split("/");
  const [render, title] = ROUTES.get(page) || ROUTES.get("");
  document.title = `${title} · Ritmo 180`;
  render();
  window.scrollTo(0, 0);
  app.focus({ preventScroll: true });
}

window.addEventListener("hashchange", route);
// Ações que dependem de back-end ainda não existem: o botão só avisa o que faria.
document.addEventListener("click", (e) => {
  const button = e.target.closest("[data-demo]");
  if (button) toast(button.dataset.demo);
});

try {
  route();
} catch (e) {
  app.innerHTML = `<div class="card"><h2>Não foi possível abrir o Ritmo 180</h2><p class="sub">${esc(e.message)}</p></div>`;
}
