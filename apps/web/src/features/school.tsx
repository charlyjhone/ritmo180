// Painel da direção: trilha vertical, lacunas, notas por área, turmas e mensagens das famílias.
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SchoolDashboard } from "@ritmo/contracts";
import { api } from "../lib/api.ts";
import { Async, Bar, clockOrDash, Metric, Metrics, PageHead, Pill, points, saveFile } from "../ui/kit.tsx";

const pct = (v: number | null) => (v === null ? "—" : `${v}%`);
const dash = (v: number | null) => (v === null ? "—" : v);

function Board({ d }: { d: SchoolDashboard }) {
  const client = useQueryClient();
  const m = d.metrics;
  const lowestGrade = d.grades.filter((g) => g.prereq !== null).sort((x, y) => x.prereq! - y.prereq!)[0]?.grade;
  async function markRead(id: string) {
    await api.post(`/api/school/messages/${id}/read`);
    await client.invalidateQueries({ queryKey: ["school"] });
  }
  function exportCsv() {
    const header = ["Turma", "Alunos", "Ativos", "Índice Ritmo", "Tempo médio", "Variação na semana"];
    const rows = d.classes.map((c) => [c.name, c.students, c.active, pct(c.ritmo), clockOrDash(c.avgSeconds), c.delta ?? ""]);
    saveFile(`${d.school.name}.csv`, [header, ...rows].map((r) => r.join(";")).join("\n"));
  }
  return (
    <div className="page">
      <PageHead
        kicker={`Direção e coordenação · ${d.school.name}`}
        title={d.headline}
        actions={<div className="page-actions"><Link className="btn outline" to="/implantacao">Implantação</Link><button className="btn outline" type="button" onClick={exportCsv}>Exportar planilha</button><button className="btn" type="button" onClick={() => window.print()}>Imprimir ou salvar PDF</button></div>}
      />
      {d.dataNotice ? <div className="notice warn">{d.dataNotice}</div> : null}
      <Metrics label="Indicadores da escola">
        <Metric label="Alunos ativos na semana" value={m.activeWeek} note={`${m.enrolled ? Math.round((m.activeWeek / m.enrolled) * 100) : 0}% dos ${m.enrolled} matriculados`} />
        <Metric label="Índice Ritmo · Ensino Médio" value={pct(m.ritmoHigh)} note={m.ritmoDelta === null ? undefined : `${points(m.ritmoDelta)} na semana`} tone={(m.ritmoDelta ?? 0) >= 0 ? "up" : "down"} />
        <Metric label="Pré-requisitos dominados · 9º ano" value={pct(m.prereqNinth)} note="Meta para entrar no EM: 80%" />
        <Metric label="Questões em revisão pelos professores" value={m.flagsOpen} note="sinalizadas pela estatística de uso" />
      </Metrics>
      <section className="card" aria-labelledby="trilha-title">
        <h2 className="lg" id="trilha-title">Trilha vertical por série</h2>
        <p className="sub">Leitura medida em palavras por minuto, só com leituras válidas. Interpretação é a média de acertos nas perguntas de leitura.</p>
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table className="tbl min-820">
            <thead><tr><th scope="col">Série</th><th scope="col" className="w-34">Acerto em questões com pré-requisito</th><th scope="col">Leitura (ppm)</th><th scope="col">Interpretação</th><th scope="col">Índice Ritmo</th></tr></thead>
            <tbody>
              {d.grades.map((g) => (
                <tr key={g.grade} className={g.grade === lowestGrade ? "alert" : ""}>
                  <th scope="row">{g.grade}</th>
                  <td><div className="pre-bar"><Bar pct={g.prereq ?? 0} tone={g.grade === lowestGrade ? "amber" : ""} size="h12" /><span className="mono">{pct(g.prereq)}</span></div></td>
                  <td className="mono b">{dash(g.ppm)}</td><td className="mono b">{pct(g.comprehension)}</td><td className="mono b">{pct(g.ritmo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {d.insight ? <div className="advice" style={{ marginTop: 16 }}><strong>Leitura do motor:</strong> {d.insight}</div> : null}
      </section>
      <div className="grid-2">
        <section className="card" aria-labelledby="lac-title">
          <h2 id="lac-title">Pré-requisitos com mais lacunas na escola</h2>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th scope="col">Habilidade</th><th scope="col">Origem</th><th scope="col">Alunos com lacuna</th><th scope="col">Áreas do ENEM afetadas</th></tr></thead>
              <tbody>{d.gaps.map((g) => <tr key={g.name}><td className="b">{g.name}</td><td className="soft">{g.grade}</td><td className="mono b">{g.students}</td><td className="soft">{g.areas}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
        <section className="card" aria-labelledby="tri-title">
          <h2 id="tri-title">Nota TRI estimada por área</h2>
          <div className="stack" style={{ gap: 16, marginTop: 18 }}>
            {d.areas.length === 0 ? <p className="sub">Ainda não há alunos com medida confiável.</p> : null}
            {d.areas.map((a) => (
              <div key={a.area}>
                <div className="row-head" style={{ marginBottom: 6 }}><span>{a.name}{a.provisional ? " (escala provisória)" : ""}</span><span className="mono">{a.score}</span></div>
                <Bar pct={((a.score! - 300) / 500) * 100} size="h10" />
              </div>
            ))}
          </div>
          <p style={{ margin: "14px 0 0", fontSize: 12, color: "var(--muted)" }}>Escala de 300 a 800. Só entram áreas com questões calibradas respondidas em prova.</p>
        </section>
      </div>
      <section className="card" aria-labelledby="turmas-title">
        <h2 id="turmas-title">Comparativo de turmas</h2>
        <div className="table-wrap">
          <table className="tbl min-720">
            <thead><tr><th scope="col">Turma</th><th scope="col">Alunos</th><th scope="col">Ativos</th><th scope="col">Índice Ritmo</th><th scope="col">Tempo médio</th><th scope="col">Na semana</th></tr></thead>
            <tbody>
              {d.classes.map((c) => (
                <tr key={c.name}><td className="b">{c.name}</td><td className="mono">{c.students}</td><td className="mono">{c.active}</td><td className="mono b">{pct(c.ritmo)}</td><td className="mono">{clockOrDash(c.avgSeconds)}</td><td className={(c.delta ?? 0) >= 0 ? "good" : "bad"}>{c.delta === null ? "—" : points(c.delta)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card" aria-labelledby="msg-title">
        <h2 id="msg-title">Mensagens das famílias</h2>
        <div className="stack">
          {d.messages.length === 0 ? <p className="sub">Nenhuma mensagem.</p> : null}
          {d.messages.map((msg) => (
            <div className="message" key={msg.id}>
              <small>{msg.from} · sobre {msg.student} · {new Date(msg.at).toLocaleDateString("pt-BR")}</small>
              {msg.body}
              <div className="btn-row" style={{ marginTop: 8 }}>{msg.read ? <Pill tone="good tight">Lida</Pill> : <button className="btn soft slim" type="button" onClick={() => void markRead(msg.id)}>Marcar como lida</button>}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function SchoolHome() {
  const query = useQuery({ queryKey: ["school"], queryFn: () => api.get<SchoolDashboard>("/api/insights/school") });
  return <Async query={query}>{(d) => <Board d={d} />}</Async>;
}
