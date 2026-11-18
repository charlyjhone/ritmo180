import { BIOLOGIA, MATEMATICA } from './biomat';
import { BIOLOGIA2, MATEMATICA2 } from './biomat2';
import { FISICA2 } from './fisica2';
import { QUIMICA2 } from './quimica2';
import { FISICA } from './fisica';
import { QUIMICA } from './quimica';
import type { Questao } from './tipos';

export const QUESTOES: Questao[] = [...FISICA, ...FISICA2, ...QUIMICA, ...QUIMICA2, ...BIOLOGIA, ...BIOLOGIA2, ...MATEMATICA, ...MATEMATICA2];

export const questoesDoModulo = (id: string) => QUESTOES.filter((q) => q.modulo === id);
