// Atalhos para simuladores: primeiro o Laboratório Virtual do Ritmo (/laboratorio/), depois as simulações PhET do assunto.
import { LAB_MODULES, LAB_PATH, labModule, labUrl, PHET_SIMS, phetSim, phetUrl } from "@ritmo/contracts";
import { labModulesFor, labRefIn } from "@ritmo/engine";

export function labIdsFor(discipline: string | null | undefined, topic: string | null | undefined, text = ""): string[] {
  if (!discipline) return [];
  return labModulesFor({ discipline, topic: topic ?? "", text }, LAB_MODULES);
}

/** Simulações PhET do assunto. Mesmo critério do Laboratório: palavras do enunciado pesam mais que o assunto. */
export function phetIdsFor(discipline: string | null | undefined, topic: string | null | undefined, text = "", max = 2): string[] {
  if (!discipline || max <= 0) return [];
  return labModulesFor({ discipline, topic: topic ?? "", text }, PHET_SIMS, max);
}

/** Bloco "Ver no simulador" para depois da correção e nas aulas. Não aparece quando não há simulador do assunto. */
/** Questões do próprio Laboratório trazem na resolução a montagem exata; as outras usam assunto e palavras-chave. */
export function LabLinks({ discipline, topic, text, solutionHtml = "" }: { discipline: string; topic: string; text: string; solutionHtml?: string }) {
  const ref = labRefIn(solutionHtml);
  const links = ref
    ? [{ id: ref.id, href: `${LAB_PATH}#${ref.id}${ref.query ? `?${ref.query}` : ""}` }]
    : labIdsFor(discipline, topic, text).map((id) => ({ id, href: labUrl(id) }));
  // Com simulador do próprio Ritmo, uma simulação PhET basta; questão do Laboratório já traz a montagem exata.
  const phet = ref ? [] : phetIdsFor(discipline, topic, text, links.length ? 1 : 2);
  if (!links.length && !phet.length) return null;
  return (
    <div className="lab-links">
      {links.length ? (
        <>
          <span className="lab-links-label">{ref ? "Monte no laboratório:" : "Entenda no laboratório:"}</span>
          {links.map(({ id, href }) => (
            <a key={id} className="btn outline slim" href={href} target="_blank" rel="noopener">
              Ver no simulador: {labModule(id)?.title ?? id}
            </a>
          ))}
        </>
      ) : null}
      {phet.length ? (
        <>
          <span className="lab-links-label">Simulação PhET (site gratuito, precisa de internet):</span>
          {phet.map((id) => (
            <a key={id} className="btn outline slim" href={phetUrl(id)} target="_blank" rel="noopener noreferrer">
              {phetSim(id)?.title ?? id}
            </a>
          ))}
        </>
      ) : null}
    </div>
  );
}
