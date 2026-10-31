// Questão corrigida: mostra a resposta do aluno, o gabarito e a resolução.
import type { ReactNode } from "react";
import type { ReviewedQuestion } from "@ritmo/contracts";
import { Html, Pill } from "../ui/kit.tsx";

export function QuestionReview({ heading, status, q }: { heading: ReactNode; status: string; q: ReviewedQuestion }) {
  const right = q.choice === q.answer;
  const trap = q.choice && !right ? q.alternatives.find((a) => a.letter === q.choice)?.trap : undefined;
  return (
    <details className="q-review">
      <summary>
        <span className="grow row-title">{heading}</span>
        <Pill tone={right ? "good" : "warn"}>{status}</Pill>
      </summary>
      <div className="q-review-body">
        {q.contextHtml ? <Html className="q-html" html={q.contextHtml} /> : null}
        <Html className="q-html b" html={q.stemHtml} />
        <div className="alts">
          {q.alternatives.map((alt) => (
            <div key={alt.letter} className={`alt ${alt.letter === q.answer ? "right" : alt.letter === q.choice ? "wrong" : ""}`}>
              <span className="mono">{alt.letter}</span>
              <Html html={alt.html} />
            </div>
          ))}
        </div>
        <p className="sub">{q.choice ? `Você marcou ${q.choice}. ` : "Você deixou em branco. "}A resposta certa é {q.answer}.</p>
        {trap ? <div className="feedback"><b>Por que a alternativa {q.choice} engana</b><p>{trap}</p></div> : null}
        {q.solutionHtml ? <><p className="solution"><strong>Resolução:</strong></p><Html className="solution-html" html={q.solutionHtml} /></> : <p className="note">Esta questão ainda não tem resolução comentada.</p>}
      </div>
    </details>
  );
}
