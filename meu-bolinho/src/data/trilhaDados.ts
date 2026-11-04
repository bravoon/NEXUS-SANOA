/** Mundos e ordem das fases (data/trilha.json). */
import dados from './trilha.json';
import { ordemDosMundos, type MundoJson } from '../systems/progresso/Trilha';

export const MUNDOS: readonly MundoJson[] = (dados as { mundos: MundoJson[] }).mundos;

export function ordemDaTrilhaJson(): string[] {
  return ordemDosMundos(MUNDOS);
}
