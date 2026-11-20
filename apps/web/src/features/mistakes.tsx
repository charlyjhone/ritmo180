// Caderno de erros com revisão espaçada: erros e chutes para refazer hoje e revisões que voltam em 2, 7 e 21 dias.
import { useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { REVIEW_STEPS, type MistakeBook } from "@ritmo/contracts";
import { api } from "../lib/api.ts";
import { Async, PageHead } from "../ui/kit.tsx";
import { trainingLink } from "./focus-picker.tsx";
import { QuestionReview } from "./question-review.tsx";

const SEPARATOR = "\n";

export function MistakesPage() {
  const [choice, setChoice] = useState("");
  const [discipline, topic] = choice ? choice.split(SEPARATOR) : [undefined, undefined];
  const query = useQuery({
    queryKey: ["mistakes", choice],
    queryFn: () => api.get<MistakeBook>(`/api/practice/mistakes?${new URLSearchParams(choice ? { disciplina: discipline!, assunto: topic! } : {})}`),
    placeholderData: keepPreviousData,
  });
  return (
    <div className="page">
      <PageHead
        kicker="Caderno de erros e revisões"
        title={query.data ? (query.data.total === 0 ? "Nada para rever hoje" : `${query.data.total} ${query.data.total === 1 ? "questão para rever hoje" : "questões para rever hoje"}`) : "Seus erros"}
        actions={query.data?.total ? <Link className="btn" to={trainingLink({ discipline, topic, mistakes: true })}>{choice ? "Rever este assunto" : "Rever agora"}</Link> : null}
      />
      <Async query={query}>
        {(book) => book.total === 0 ? <div className="state">{book.upcoming.count > 0 ? `${upcomingText(book.upcoming)} Volte nesse dia: lembrar depois de um intervalo é o que fixa o conteúdo.` : "Quando você errar uma questão ou acertar no chute, ela aparece aqui. Depois de refazer, ela volta em 2, 7 e 21 dias até ficar na memória."}</div> : (
          <>
            <p className="sub">Refaça os erros e os chutes. Cada acerto empurra a revisão para mais longe (2, 7 e 21 dias); a questão sai do caderno quando você acerta a revisão de 21 dias. {book.upcoming.count > 0 ? upcomingText(book.upcoming) : ""}</p>
            <label className="field-sm" style={{ maxWidth: 420 }}>Assunto
              <select value={choice} onChange={(e) => setChoice(e.target.value)}>
                <option value="">Todos os assuntos ({book.total})</option>
                {book.topics.map((t) => <option key={`${t.discipline}${t.topic}`} value={`${t.discipline}${SEPARATOR}${t.topic}`}>{t.discipline} · {t.topic} ({t.count})</option>)}
              </select>
            </label>
            <div className="stack">
              {book.questions.map((q) => <QuestionReview key={q.itemId} q={q} heading={`${q.discipline} · ${q.topic}`} status={statusOf(q)} />)}
            </div>
          </>
        )}
      </Async>
    </div>
  );
}

function statusOf(q: MistakeBook["questions"][number]): string {
  if (q.kind === "spaced") return `Revisão ${q.step + 1} de ${REVIEW_STEPS}`;
  if (q.sureMiss) return "Errou com certeza";
  if (q.guessed) return "Acertou no chute";
  return q.times === 1 ? "Errou 1 vez" : `Errou ${q.times} vezes`;
}

function upcomingText(upcoming: MistakeBook["upcoming"]): string {
  const when = upcoming.nextDueAt ? new Date(upcoming.nextDueAt).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" }) : "";
  return `${upcoming.count === 1 ? "1 questão volta" : `${upcoming.count} questões voltam`} para revisão; a próxima em ${when}.`;
}
