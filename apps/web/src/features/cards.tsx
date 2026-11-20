// Cartões de memorização: frente, verso e "lembrei / não lembrei". As respostas ficam no aparelho até a internet voltar.
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CardDeck, CardView } from "@ritmo/contracts";
import { api } from "../lib/api.ts";
import { flushCardReviews, queueCardReview } from "../lib/offline.ts";
import { ReadAloud } from "../ui/a11y.tsx";
import { Async, Bar, PageHead, Pill } from "../ui/kit.tsx";
import { lessonLink } from "./lessons.tsx";

export function cardsLink(subject?: { discipline: string; topic: string }): string {
  return subject ? `/cartoes?${new URLSearchParams({ disciplina: subject.discipline, assunto: subject.topic })}` : "/cartoes";
}

function Session({ cards, onDone }: { cards: CardView[]; onDone: (summary: { remembered: number; forgot: number }) => void }) {
  const [queue, setQueue] = useState(cards);
  const [shown, setShown] = useState(false);
  const [score, setScore] = useState({ remembered: 0, forgot: 0 });
  const card = queue[0];
  useEffect(() => {
    if (!card) onDone(score);
  }, [card, onDone, score]);
  if (!card) return null;

  async function answer(remembered: boolean) {
    await queueCardReview({ id: crypto.randomUUID(), key: card!.key, remembered, at: Date.now() }).catch(() => {});
    // Esquecido volta no fim da rodada de hoje, uma vez: ver de novo logo depois ajuda a fixar.
    const rest = queue.slice(1);
    setQueue(remembered || queue.filter((c) => c.key === card!.key).length > 1 ? rest : [...rest, card!]);
    setScore((s) => (remembered ? { ...s, remembered: s.remembered + 1 } : { ...s, forgot: s.forgot + 1 }));
    setShown(false);
  }

  return (
    <section className="card flashcard" aria-live="polite">
      <div className="tags">
        <Pill tone="brand">{card.discipline}</Pill>
        <Pill>{card.topic}</Pill>
        {card.status === "new" ? <Pill tone="good">Novo</Pill> : <Pill>Revisão</Pill>}
        <span className="note">{queue.length} {queue.length === 1 ? "cartão" : "cartões"} na rodada</span>
      </div>
      <div className="flash-front">{card.front}</div>
      {shown ? (
        <>
          <div className="flash-back">{card.back}</div>
          <div className="btn-row">
            <button className="btn" type="button" autoFocus onClick={() => void answer(true)}>Lembrei</button>
            <button className="btn soft" type="button" onClick={() => void answer(false)}>Não lembrei</button>
            <ReadAloud html={`${card.front}. ${card.back}`} />
            <Link className="btn soft slim" to={lessonLink(card)} target="_blank" rel="noopener">Abrir a aula</Link>
          </div>
        </>
      ) : (
        <div className="btn-row">
          <button className="btn" type="button" autoFocus onClick={() => setShown(true)}>Mostrar a resposta</button>
          <ReadAloud html={card.front} />
        </div>
      )}
      <p className="note">Tente lembrar antes de virar. Seja honesto: o cartão que você não lembra volta amanhã; o que você lembra volta em 3, 7 e 21 dias.</p>
    </section>
  );
}

export function CardsPage() {
  const client = useQueryClient();
  const [params] = useSearchParams();
  const discipline = params.get("disciplina") ?? undefined;
  const topic = params.get("assunto") ?? undefined;
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<{ remembered: number; forgot: number } | null>(null);
  const query = useQuery({
    queryKey: ["cards", discipline, topic],
    queryFn: async () => {
      await flushCardReviews().catch(() => {});
      return api.get<CardDeck>(`/api/study/cards?${new URLSearchParams({ ...(discipline ? { disciplina: discipline } : {}), ...(topic ? { assunto: topic } : {}) })}`);
    },
  });

  async function finish(result: { remembered: number; forgot: number }) {
    setRunning(false);
    setSummary(result);
    await flushCardReviews().catch(() => {});
    await client.invalidateQueries({ queryKey: ["cards"] });
    await client.invalidateQueries({ queryKey: ["student"] });
  }

  return (
    <div className="page">
      <PageHead kicker="Cartões de memorização" title={topic ? `Cartões de ${topic}` : "Fórmulas, conceitos e pegadinhas"} actions={topic ? <Link className="btn soft" to="/cartoes">Todos os cartões</Link> : undefined} />
      <p className="sub">Os cartões saem das aulas rápidas. Poucos minutos por dia, no dia certo, fazem o conteúdo ficar até o ENEM.</p>
      {summary ? (
        <div className="notice" role="status">
          Rodada concluída: você lembrou {summary.remembered} e vai rever {summary.forgot} {summary.forgot === 1 ? "cartão" : "cartões"} amanhã.
          {navigator.onLine ? "" : " Suas respostas estão guardadas no aparelho e serão enviadas quando a internet voltar."}
        </div>
      ) : null}
      <Async query={query}>
        {(deck) => running ? (
          <Session cards={deck.due} onDone={(result) => void finish(result)} />
        ) : (
          <>
            <section className="card">
              <div className="card-head">
                <h2>{deck.due.length ? `${deck.due.length} ${deck.due.length === 1 ? "cartão" : "cartões"} para hoje` : "Nenhum cartão para hoje"}</h2>
                {deck.due.length ? <button className="btn" type="button" onClick={() => { setSummary(null); setRunning(true); }}>Começar</button> : null}
              </div>
              <p className="sub">{deck.learned} aprendidos · {deck.learning} em revisão · {deck.total} cartões nas aulas</p>
              <Bar pct={deck.total ? (deck.learned / deck.total) * 100 : 0} tone="ok" />
              {!deck.due.length ? <p className="sub">Volte amanhã: os cartões que você está revisando voltam no dia certo. Para adiantar, abra uma aula e pratique.</p> : null}
            </section>
            {deck.topics.length && !topic ? (
              <section className="card">
                <h2>Por assunto</h2>
                <div className="stack">
                  {deck.topics.slice(0, 12).map((t) => (
                    <div className="row-box" key={`${t.discipline}${t.topic}`}>
                      <div className="grow"><div className="row-title">{t.topic}</div><div className="row-sub">{t.discipline} · {t.due} {t.due === 1 ? "cartão disponível" : "cartões disponíveis"}</div></div>
                      <Link className="btn soft slim" to={cardsLink(t)}>Revisar</Link>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </Async>
    </div>
  );
}
