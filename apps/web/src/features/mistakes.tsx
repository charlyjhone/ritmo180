// Caderno de erros: as questões cuja última tentativa foi errada, prontas para rever e refazer.
import { useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { MistakeBook } from "@ritmo/contracts";
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
        kicker="Caderno de erros"
        title={query.data ? (query.data.total === 0 ? "Nenhum erro pendente" : `${query.data.total} ${query.data.total === 1 ? "questão para rever" : "questões para rever"}`) : "Seus erros"}
        actions={query.data?.total ? <Link className="btn" to={trainingLink({ discipline, topic, mistakes: true })}>{choice ? "Refazer este assunto" : "Refazer meus erros"}</Link> : null}
      />
      <Async query={query}>
        {(book) => book.total === 0 ? <div className="state">Quando você errar uma questão, ela aparece aqui. Ela sai do caderno assim que você acertar.</div> : (
          <>
            <p className="sub">Cada questão sai do caderno quando você a acerta ao refazer.</p>
            <label className="field-sm" style={{ maxWidth: 420 }}>Assunto
              <select value={choice} onChange={(e) => setChoice(e.target.value)}>
                <option value="">Todos os assuntos ({book.total})</option>
                {book.topics.map((t) => <option key={`${t.discipline}${t.topic}`} value={`${t.discipline}${SEPARATOR}${t.topic}`}>{t.discipline} · {t.topic} ({t.count})</option>)}
              </select>
            </label>
            <div className="stack">
              {book.questions.map((q) => <QuestionReview key={q.itemId} q={q} heading={`${q.discipline} · ${q.topic}`} status={q.times === 1 ? "Errou 1 vez" : `Errou ${q.times} vezes`} />)}
            </div>
          </>
        )}
      </Async>
    </div>
  );
}
