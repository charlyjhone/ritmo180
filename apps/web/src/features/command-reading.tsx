// Leitura de comando: o protocolo de sete movimentos e os três módulos de treino.
import { Link } from "react-router-dom";
import { COMMAND_FINAL_CHECK, COMMAND_MODULES, COMMAND_PROTOCOL } from "@ritmo/contracts";

export function CommandReadingPage() {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="kicker">Leitura de comando</div>
          <h1 id="headline">Errar sabendo a matéria tem nome</h1>
          <p className="lead">No ENEM, boa parte dos erros não é falta de conteúdo: é uma condição pulada, uma alternativa verdadeira que não responde à pergunta ou um número da situação errada. Cada módulo treina um desses erros com questões oficiais.</p>
        </div>
      </div>
      <div className="grid-2">
        <section className="card" aria-labelledby="protocol-title">
          <h2 id="protocol-title">Protocolo de leitura</h2>
          <p className="sub">Faça no papel, em toda questão, até virar hábito.</p>
          <ol className="protocol">
            {COMMAND_PROTOCOL.map((p) => <li key={p.step}><b>{p.step}.</b> {p.detail}</li>)}
          </ol>
          <div className="label-caps" style={{ marginTop: 16 }}>ANTES DE MARCAR, TRÊS PERGUNTAS</div>
          <ul className="protocol">
            {COMMAND_FINAL_CHECK.map((q) => <li key={q}>{q}</li>)}
          </ul>
        </section>
        <section aria-label="Módulos" className="command-modules">
          {COMMAND_MODULES.map((m) => (
            <article key={m.id} className="card">
              <div className="kicker">{m.id} · {m.items.length} questões · cerca de {m.items.length * 4} min</div>
              <h2>{m.title}</h2>
              <p className="sub">{m.problem}</p>
              <p className="note"><b>Regra:</b> {m.rule}</p>
              <div className="btn-row"><Link className="btn ritmo" to={`/treino?leitura=${m.id}`}>Treinar {m.id}</Link></div>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
