// Implantação de uma escola: assistente de seis passos. Todos os passos ficam montados para o formulário não perder o que foi digitado.
import { app, pill, showHeader, toast } from "../ui.js";

const STEPS = [
  ["Escola e marca", "Nome, cores e endereço"],
  ["Termos e LGPD", "Contrato e consentimentos"],
  ["Alunos e turmas", "Importar planilha"],
  ["Integrações e login", "Sistema acadêmico e acesso"],
  ["Acessibilidade", "Tempo adicional e recursos"],
  ["Diagnóstico inicial", "Linha de base de cada aluno"],
];
const ROWS = [
  { name: "Beatriz A. Souza", cls: "3ª série A", resp: "resp.beatriz@email.com", status: "Pronta", ok: true },
  { name: "Caio M. Ferreira", cls: "3ª série A", resp: "resp.caio@email.com", status: "Pronta", ok: true },
  { name: "Daniela R. Lima", cls: "2ª série B", resp: "sem e-mail", status: "Falta e-mail", ok: false },
  { name: "Enzo P. Costa", cls: "9º ano A", resp: "resp.enzo@email.com", status: "Pronta", ok: true },
];
const INTEGRATIONS = [
  { name: "Sistema acadêmico", what: "Atualiza alunos e turmas toda noite, por planilha ou integração", status: "Conectado", ok: true },
  { name: "CRM da escola", what: "Envia evolução e frequência de treino para o atendimento às famílias", status: "Opcional", ok: false },
  { name: "Login com Google ou Microsoft", what: "Alunos e professores entram com a conta institucional", status: "Conectado", ok: true },
  { name: "Aplicativo no celular", what: "Funciona sem internet e sincroniza quando a conexão volta", status: "Ativo", ok: true },
];
const ACCOMMODATIONS = [
  { name: "Aluno 1 · 3ª A", kind: "Tempo adicional de 1 hora", time: "3:40", res: "Fonte ampliada" },
  { name: "Aluno 2 · 2ª B", kind: "Leitor de tela", time: "3:40", res: "Descrição de imagens e gráficos" },
  { name: "Aluno 3 · 9º A", kind: "Pausas programadas", time: "3:00", res: "Pausa de 5 min a cada 45" },
];

const PANELS = [
  `<h2>Dados da escola e marca própria</h2>
  <p class="sub">Alunos e famílias veem a marca da escola. O Ritmo 180 aparece apenas como selo discreto.</p>
  <div class="form-grid">
    <label class="field">Nome exibido<input class="input" type="text" value="Colégio Delta" /></label>
    <label class="field">Endereço de acesso<input class="input" type="text" value="delta.ritmo180.com.br" /></label>
    <label class="field">Cor principal<input class="input" type="text" value="#0E7C66" /></label>
    <label class="field">Séries contratadas<select class="input"><option>9º ano à 3ª série</option><option>6º ano à 3ª série</option><option>Ensino Médio</option></select></label>
  </div>
  <div class="drop">Arraste o logotipo da escola aqui (PNG ou SVG)</div>`,

  `<h2>Termos e proteção de dados (LGPD)</h2>
  <p class="sub">A maioria dos usuários é menor de idade. Nada é liberado aos alunos antes destes itens.</p>
  <div style="margin-top: 12px">
    <label class="chk"><input type="checkbox" checked /><span><strong>Contrato de tratamento de dados assinado.</strong> Define a escola como controladora e o Ritmo 180 como operador.</span></label>
    <label class="chk"><input type="checkbox" checked /><span><strong>Encarregado de dados indicado pela escola.</strong> Contato para dúvidas das famílias.</span></label>
    <label class="chk"><input type="checkbox" /><span><strong>Consentimento dos responsáveis.</strong> Enviado por e-mail e pelo portal: <span class="mono">412 de 486</span> famílias já aceitaram.</span></label>
    <label class="chk"><input type="checkbox" checked /><span><strong>Dados isolados por escola.</strong> Nenhuma outra escola da rede acessa os dados do Colégio Delta.</span></label>
  </div>`,

  `<h2>Importar alunos e turmas</h2>
  <p class="sub">Envie a planilha exportada do sistema acadêmico. A plataforma confere cada linha antes de importar.</p>
  <div class="drop file">
    <div><strong>alunos_delta_2027.xlsx</strong> · 486 linhas lidas</div>
    <button class="btn soft" type="button" data-demo="Troca de arquivo indisponível na demonstração">Trocar arquivo</button>
  </div>
  <div class="table-wrap" style="margin-top: 16px">
    <table class="tbl tight min-600">
      <thead><tr><th scope="col">Aluno</th><th scope="col">Turma</th><th scope="col">Responsável</th><th scope="col">Situação</th></tr></thead>
      <tbody>
        ${ROWS.map((r) => `<tr><td class="b">${r.name}</td><td>${r.cls}</td><td class="soft">${r.resp}</td><td class="${r.ok ? "good" : "bad"}">${r.status}</td></tr>`).join("")}
      </tbody>
    </table>
  </div>
  <p class="sub" style="margin-top: 12px"><span class="mono b" style="color: var(--ok)">481</span> prontas · <span class="mono b" style="color: var(--bad)">5</span> com e-mail do responsável faltando</p>`,

  `<h2>Integrações e login</h2>
  <div class="stack">
    ${INTEGRATIONS.map(
      (i) => `<div class="row-box integration">
        <div><div class="row-title">${i.name}</div><div class="row-sub">${i.what}</div></div>
        ${pill(i.status, i.ok ? "good" : "warn")}
      </div>`,
    ).join("")}
  </div>`,

  `<h2>Acessibilidade e tempo adicional</h2>
  <p class="sub">O tempo-alvo de cada questão se ajusta à acomodação do aluno. Com 1 hora a mais no 2º dia, a média esperada passa de 3:00 para 3:40 por questão.</p>
  <div class="table-wrap" style="margin-top: 16px">
    <table class="tbl min-640">
      <thead><tr><th scope="col">Aluno</th><th scope="col">Acomodação</th><th scope="col">Tempo-alvo médio</th><th scope="col">Recursos</th></tr></thead>
      <tbody>
        ${ACCOMMODATIONS.map((a) => `<tr><td class="b">${a.name}</td><td>${a.kind}</td><td class="mono b">${a.time}</td><td class="soft">${a.res}</td></tr>`).join("")}
      </tbody>
    </table>
  </div>
  <p class="note" style="margin: 12px 0 0">A acomodação é registrada pela coordenação e não aparece para os colegas nem nos rankings.</p>`,

  `<h2>Diagnóstico inicial</h2>
  <p class="sub">Uma avaliação adaptativa de cerca de 40 minutos por área monta o mapa de cada aluno. É a linha de base para medir a evolução depois.</p>
  <div class="form-grid">
    <label class="field">Data do diagnóstico<input class="input" type="date" value="2027-02-15" /></label>
    <label class="field">Séries<select class="input"><option>Todas as contratadas</option><option>Somente Ensino Médio</option></select></label>
  </div>
  <div class="okbox"><strong>Turma de comparação recomendada.</strong> Manter uma turma usando o método atual por 8 semanas permite mostrar à escola, com números, quanto o Ritmo 180 acrescentou.</div>`,
];

export function renderImplantacao() {
  showHeader({
    active: "",
    dark: true,
    title: "Ritmo 180 · Rede",
    subtitle: "Implantação de nova escola",
    pills: [["Escola e dados fictícios", "warn"]],
    nav: [["voltar", "#/rede", "Voltar à rede"]],
  });
  app.innerHTML = `
    <div class="page">
      <div>
        <div class="kicker">Colégio Delta · Ananindeua, PA · 9º ano à 3ª série</div>
        <h1 class="t30">Seis passos para a escola começar a treinar, em cerca de uma semana</h1>
      </div>
      <div class="setup">
        <nav class="card setup-steps" aria-label="Etapas da implantação">
          ${STEPS.map(
            ([name, sub], i) => `<button class="step" type="button" data-step="${i + 1}">
              <span class="mono"></span>
              <span class="step-text">${name}<small>${sub}</small></span>
            </button>`,
          ).join("")}
        </nav>
        <section class="card setup-body" aria-label="Conteúdo da etapa">
          ${PANELS.map((html, i) => `<div data-panel="${i + 1}">${html}</div>`).join("")}
          <div class="setup-foot">
            <button class="btn soft" type="button" id="prev">Voltar</button>
            <button class="btn" type="button" id="next"></button>
          </div>
        </section>
      </div>
    </div>`;

  let current = 1;

  function show(step) {
    current = step;
    app.querySelectorAll("[data-step]").forEach((b) => {
      const n = Number(b.dataset.step);
      b.classList.toggle("done", n < current);
      b.querySelector(".mono").textContent = n < current ? "✓" : n;
      if (n === current) b.setAttribute("aria-current", "step");
      else b.removeAttribute("aria-current");
    });
    app.querySelectorAll("[data-panel]").forEach((p) => (p.hidden = Number(p.dataset.panel) !== current));
    app.querySelector("#next").textContent = current === 6 ? "Liberar para os alunos" : "Próximo passo";
  }

  app.querySelectorAll("[data-step]").forEach((b) => (b.onclick = () => show(Number(b.dataset.step))));
  app.querySelector("#prev").onclick = () => show(Math.max(1, current - 1));
  app.querySelector("#next").onclick = () => {
    if (current === 6) toast("Colégio Delta liberado para os alunos (demonstração)");
    else show(current + 1);
  };
  show(1);
}
