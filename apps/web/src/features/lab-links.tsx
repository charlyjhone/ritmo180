// Atalhos para o Laboratório Virtual (/laboratorio/): o simulador que ajuda a entender a questão ou o assunto.
import { LAB_MODULES, LAB_PATH, labModule, labUrl } from "@ritmo/contracts";
import { labModulesFor, labRefIn } from "@ritmo/engine";

export function labIdsFor(discipline: string | null | undefined, topic: string | null | undefined, text = ""): string[] {
  if (!discipline) return [];
  return labModulesFor({ discipline, topic: topic ?? "", text }, LAB_MODULES);
}

/** Bloco "Ver no simulador" para depois da correção. Não aparece quando não há simulador do assunto. */
/** Questões do próprio Laboratório trazem na resolução a montagem exata; as outras usam assunto e palavras-chave. */
export function LabLinks({ discipline, topic, text, solutionHtml = "" }: { discipline: string; topic: string; text: string; solutionHtml?: string }) {
  const ref = labRefIn(solutionHtml);
  const links = ref
    ? [{ id: ref.id, href: `${LAB_PATH}#${ref.id}${ref.query ? `?${ref.query}` : ""}` }]
    : labIdsFor(discipline, topic, text).map((id) => ({ id, href: labUrl(id) }));
  if (!links.length) return null;
  return (
    <div className="lab-links">
      <span className="lab-links-label">{ref ? "Monte no laboratório:" : "Entenda no laboratório:"}</span>
      {links.map(({ id, href }) => (
        <a key={id} className="btn outline slim" href={href} target="_blank" rel="noopener">
          Ver no simulador: {labModule(id)?.title ?? id}
        </a>
      ))}
    </div>
  );
}
