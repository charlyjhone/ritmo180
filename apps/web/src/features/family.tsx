// Portal da família: tela de celular com um resumo por filho.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { FamilyChild } from "@ritmo/contracts";
import { api } from "../lib/api.ts";
import { Async, Tabs } from "../ui/kit.tsx";
import { useToast } from "../ui/toast.tsx";
import { logout, useMe } from "./session.tsx";

function Evolution({ child }: { child: FamilyChild }) {
  const e = child.evolution!;
  const values = e.points.map((p) => p.value);
  const lo = Math.min(...values) - 4;
  const hi = Math.max(...values) + 4;
  const dots = values.map((v, i) => ({ x: 12 + (i * 316) / Math.max(1, values.length - 1), y: Math.round(96 - ((v - lo) / (hi - lo)) * 84) }));
  return (
    <section className="pcard" aria-label="Evolução">
      <div className="pcard-title">{e.title}</div>
      <svg className="chart" style={{ marginTop: 10 }} viewBox="0 0 340 120" role="img" aria-label={e.title}>
        <line x1="0" y1="100" x2="340" y2="100" stroke="#E2E5EC" />
        <polyline points={dots.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#2447D6" strokeWidth="3" strokeLinejoin="round" />
        {dots.map((p) => <circle key={p.x} cx={p.x} cy={p.y} r="4" fill="#FFFFFF" stroke="#2447D6" strokeWidth="3" />)}
      </svg>
      <div className="fam-axis">{e.points.map((p) => <span key={p.label}>{p.label}</span>)}</div>
    </section>
  );
}

function Contact({ child }: { child: FamilyChild }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  async function send() {
    await api.post("/api/family/messages", { studentId: child.id, body });
    toast("Mensagem enviada à coordenação.");
    setBody("");
    setOpen(false);
  }
  if (!open) return <button className="btn fam-cta" type="button" onClick={() => setOpen(true)}>Falar com a coordenação</button>;
  return (
    <section className="pcard">
      <label className="field">Sua mensagem sobre {child.name}
        <textarea className="input" value={body} maxLength={1000} onChange={(e) => setBody(e.target.value)} autoFocus />
      </label>
      <div className="btn-row">
        <button className="btn" type="button" disabled={body.trim().length < 3} onClick={() => void send()}>Enviar</button>
        <button className="btn soft" type="button" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
    </section>
  );
}

function Child({ child }: { child: FamilyChild }) {
  const trained = child.week.filter((d) => d.trained).length;
  return (
    <div className="fam-body" role="tabpanel" id={`panel-${child.id}`} aria-labelledby={`tab-${child.id}`}>
      <section className="pcard" aria-label="Resumo da semana">
        <div className="metric-label">Esta semana</div>
        <div className="fam-headline">{child.headline}</div>
        <div className="fam-stats">
          {child.stats.map((s) => <div className="fam-stat" key={s.label}><small>{s.label}</small><div className="mono">{s.value}</div><span style={s.delta?.startsWith("-") ? { color: "var(--bad)" } : undefined}>{s.delta}</span></div>)}
        </div>
      </section>
      <section className="pcard" aria-label="Dias de treino">
        <div className="card-head"><div className="pcard-title">Treinou {trained} de 7 dias</div><div style={{ fontSize: 12, color: "var(--muted)" }}>meta: {child.goalDays} dias</div></div>
        <div className="week">
          {child.week.map((d, i) => (
            <div key={i}>
              <div className={`day ${d.trained ? "on" : ""}`} role="img" aria-label={`${d.day}: ${d.trained ? "treinou" : "não treinou"}`}>{d.trained ? "✓" : ""}</div>
              {d.day}
            </div>
          ))}
        </div>
      </section>
      {child.evolution ? <Evolution child={child} /> : null}
      {child.note ? (
        <section className="pcard" aria-label="Recado da escola">
          <div className="fam-note"><div className="avatar" aria-hidden="true">{child.note.initials}</div><div><b>{child.note.from}</b><p className="fam-text">{child.note.body}</p></div></div>
        </section>
      ) : null}
      <section className="pcard" aria-label="Como ajudar em casa">
        <div className="pcard-title">Como ajudar em casa</div>
        <p className="fam-text" style={{ marginTop: 6, lineHeight: 1.55 }}>{child.help}</p>
      </section>
      {child.agenda.length > 0 ? (
        <section className="pcard" aria-label="Agenda">
          <div className="pcard-title">Próximos compromissos</div>
          <div className="agenda">
            {child.agenda.map((a) => <div className="agenda-row" key={a.title}><div className="date"><span className="mono">{a.day}</span>{a.month}</div><div>{a.title}<small>{a.detail}</small></div></div>)}
          </div>
        </section>
      ) : null}
      <Contact child={child} />
      <div className="fam-foot">A família só vê os dados dos próprios filhos.</div>
    </div>
  );
}

function Portal({ kids }: { kids: FamilyChild[] }) {
  const me = useMe();
  const [active, setActive] = useState(kids[0]?.id ?? "");
  const child = kids.find((c) => c.id === active);
  return (
    <main className="fam" id="main" tabIndex={-1}>
      <div className="fam-head">
        <div className="fam-top">
          <div className="fam-brand">
            <div className="fam-logo">180</div>
            <div><div className="fam-name">{me.school?.name}</div><div className="fam-sub">Portal da família</div></div>
          </div>
          <button className="fam-bell" type="button" aria-label="Sair" onClick={() => void logout()}>Sair</button>
        </div>
        {kids.length > 0 ? <Tabs className="fam-tabs" label="Filhos" active={active} onChange={setActive} items={kids.map((c) => ({ id: c.id, label: `${c.name}${c.grade ? ` · ${c.grade}` : ""}` }))} /> : null}
      </div>
      {child ? <Child key={child.id} child={child} /> : <div className="fam-body"><section className="pcard">Nenhum aluno vinculado à sua conta. Procure a coordenação.</section></div>}
    </main>
  );
}

export function FamilyHome() {
  const query = useQuery({ queryKey: ["family"], queryFn: () => api.get<FamilyChild[]>("/api/insights/family") });
  return <Async query={query}>{(kids) => <Portal kids={kids} />}</Async>;
}
