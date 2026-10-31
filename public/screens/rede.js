// Administração da rede: validação das questões geradas, escolas, banco, calibração TRI e integridade.
import { app, metrics, pageHead, pill, showHeader } from "../ui.js";

const STAGES = [
  { name: "Geradas pela IA", n: 1240, note: "Habilidade e distratores definidos" },
  { name: "Resolução às cegas (3 agentes)", n: 1121, note: "119 descartadas por divergência" },
  { name: "Conferência numérica em código", n: 1098, note: "23 com cálculo inconsistente" },
  { name: "Habilidade e originalidade", n: 1067, note: "31 fora da Matriz ou parecidas demais" },
  { name: "Em calibração nos treinos", n: 1060, note: "7 sinalizadas para professor" },
  { name: "Aprovadas após calibração", n: 874, note: "As demais seguem coletando respostas" },
];
const SCHOOLS = [
  { name: "Colégio Conceito", city: "Macapá, AP", grades: "6º ano à 3ª série", n: "612", idx: "48%", brand: "Sim", status: "Ativa", ok: true },
  { name: "Escola Horizonte", city: "Santana, AP", grades: "6º ano à 3ª série", n: "734", idx: "45%", brand: "Sim", status: "Ativa", ok: true },
  { name: "Instituto Aurora", city: "Belém, PA", grades: "Ensino Médio", n: "972", idx: "51%", brand: "Não", status: "Ativa", ok: true },
  { name: "Colégio Delta", city: "Ananindeua, PA", grades: "9º ano à 3ª série", n: "—", idx: "—", brand: "Sim", status: "Em implantação", ok: false },
];
const BANK = [
  { name: "Linguagens", a: 790, b: 2210, c: 540 },
  { name: "Ciências Humanas", a: 780, b: 2160, c: 520 },
  { name: "Ciências da Natureza", a: 790, b: 2530, c: 660 },
  { name: "Matemática", a: 790, b: 2480, c: 620 },
];
const BANK_MAX = 3980;
const CALIBRATION = [
  ["Modelo em uso", "2 parâmetros (dificuldade e discriminação)", ""],
  ["Itens já calibrados", "9.380", "mono"],
  ["Itens em calibração nos treinos", "2.340", "mono"],
  ["Reclassificados após os dados", "612", "mono"],
  ["Descartados por baixa discriminação", "184", "mono"],
];
const INTEGRITY = [
  ["Rápidas demais para ler", "0,9%", "Questão difícil acertada em menos de 15 s"],
  ["Pausa longa e acerto perfeito", "0,7%", "Saiu da tela e voltou com a resposta"],
  ["Chute em sequência", "0,5%", "Várias respostas em poucos segundos"],
];

const share = (value) => `${((value / BANK_MAX) * 100).toFixed(1)}%`;
const number = (n) => n.toLocaleString("pt-BR");

export function renderRede() {
  showHeader({
    active: "rede",
    dark: true,
    title: "Ritmo 180 · Rede",
    subtitle: "Administração de todas as escolas contratantes",
    pills: [["Dados e escolas fictícios", "warn"]],
  });
  app.innerHTML = `
    <div class="page">
      ${pageHead("Visão da rede · outubro", "99,4% das questões geradas passaram sem precisar de professor", `<a class="btn" href="#/implantacao">Cadastrar nova escola</a>`)}

      ${metrics("Indicadores da rede", [
        { label: "Escolas contratantes", value: "4", note: "1 em implantação" },
        { label: "Alunos ativos", value: "2.318", note: "+340 no mês", tone: "up" },
        { label: "Questões no banco", value: "14.870", note: "3.150 oficiais · 11.720 geradas" },
        { label: "Respostas registradas", value: "1,9 mi", note: "Alimentam a calibração TRI" },
      ])}

      <section class="card" aria-labelledby="funil-title">
        <h2 class="lg" id="funil-title">Validação automática das 1.240 questões geradas no mês</h2>
        <p class="sub">Cada etapa descarta ou sinaliza itens. Só os sinalizados vão para um professor.</p>
        <div class="funnel">
          ${STAGES.map(
            (s) => `<div class="funnel-row">
              <div class="funnel-name">${s.name}</div>
              <div class="funnel-track"><div class="funnel-bar mono" style="width: ${Math.round((s.n / 1240) * 100)}%">${number(s.n)}</div></div>
              <div class="funnel-note">${s.note}</div>
            </div>`,
          ).join("")}
        </div>
      </section>

      <section class="card" aria-labelledby="esc-title">
        <h2 id="esc-title">Escolas contratantes</h2>
        <div class="table-wrap">
          <table class="tbl min-820">
            <thead><tr><th scope="col">Escola</th><th scope="col">Cidade</th><th scope="col">Séries</th><th scope="col">Alunos ativos</th><th scope="col">Índice Ritmo · EM</th><th scope="col">Marca própria</th><th scope="col">Situação</th></tr></thead>
            <tbody>
              ${SCHOOLS.map(
                (s) => `<tr>
                  <td class="b">${s.name}</td>
                  <td class="soft">${s.city}</td>
                  <td class="soft">${s.grades}</td>
                  <td class="mono">${s.n}</td>
                  <td class="mono b">${s.idx}</td>
                  <td class="soft">${s.brand}</td>
                  <td>${pill(s.status, `${s.ok ? "good" : "warn"} tight`)}</td>
                </tr>`,
              ).join("")}
            </tbody>
          </table>
        </div>
      </section>

      <div class="grid-2">
        <section class="card" aria-labelledby="banco-title">
          <h2 id="banco-title">Banco de questões por área</h2>
          <div class="series-legend">
            <span><i class="s1"></i>Oficiais do INEP</span>
            <span><i class="s2"></i>Geradas e calibradas</span>
            <span><i class="s3"></i>Em calibração</span>
          </div>
          <div class="stack" style="gap: 14px">
            ${BANK.map(
              (b) => `<div>
                <div class="row-head"><span>${b.name}</span><span class="mono">${number(b.a + b.b + b.c)}</span></div>
                <div class="stack-bar"><div class="s1" style="width: ${share(b.a)}"></div><div class="s2" style="width: ${share(b.b)}"></div><div class="s3" style="width: ${share(b.c)}"></div></div>
              </div>`,
            ).join("")}
          </div>
        </section>

        <section class="card" aria-labelledby="cal-title">
          <h2 id="cal-title">Calibração TRI</h2>
          <div style="margin-top: 14px">
            ${CALIBRATION.map(([label, value, font]) => `<div class="spec"><span>${label}</span><b class="${font}">${value}</b></div>`).join("")}
          </div>
          <p class="note" style="margin: 10px 0 0; color: var(--body); line-height: 1.5">Quanto mais escolas usam, mais rápido cada item é calibrado. O modelo de 3 parâmetros entra quando houver respostas suficientes por item.</p>
        </section>
      </div>

      <section class="card" aria-labelledby="int-title">
        <h2 id="int-title">Integridade dos dados: 2,1% das respostas ficaram fora da calibração</h2>
        <p class="sub">Respostas com padrão incompatível com resolução real não entram no Índice Ritmo nem na calibração TRI. O aluno e o professor são avisados, sem punição automática.</p>
        <div class="grid-metrics" style="gap: 12px; margin-top: 16px">
          ${INTEGRITY.map(
            ([label, value, detail]) => `<div class="mini" style="padding: 14px 16px">
              <div class="metric-label">${label}</div>
              <div class="mono" style="font-size: 26px">${value}</div>
              <div style="font-size: 12px; color: var(--muted); margin-top: 4px">${detail}</div>
            </div>`,
          ).join("")}
        </div>
      </section>
    </div>`;
}
