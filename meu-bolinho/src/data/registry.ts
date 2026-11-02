/**
 * Registro de receitas: descobre automaticamente todo JSON em ./recipes.
 * (import.meta.glob é resolvido pelo Vite em tempo de build.)
 */
import difficulty from './difficulty.json';
import ingredients from './ingredients.json';
import type {
  Dificuldade,
  IngredienteDef,
  ParametrosDificuldade,
  ReceitaJson,
  ReceitaResolvida,
} from '../systems/recipe/recipeTypes';
import { resolverReceita, validarReceita } from '../systems/recipe/recipeLoader';

export const TABELA_DIFICULDADE = difficulty as Record<Dificuldade, ParametrosDificuldade>;
export const INGREDIENTES = ingredients as Record<string, IngredienteDef>;

const modulos = import.meta.glob<{ default: unknown }>('./recipes/*.json', { eager: true });

/** Receitas válidas. Receita com erro de schema é registrada no console e fica indisponível. */
export const RECEITAS: ReadonlyMap<string, ReceitaJson> = (() => {
  const mapa = new Map<string, ReceitaJson>();
  for (const [caminho, mod] of Object.entries(modulos)) {
    try {
      const r = validarReceita(mod.default);
      mapa.set(r.id, r);
    } catch (e) {
      console.error(`Receita indisponível (${caminho}):`, e);
    }
  }
  return mapa;
})();

export function carregarReceita(id: string, dificuldade: Dificuldade): ReceitaResolvida {
  const r = RECEITAS.get(id);
  if (!r) throw new Error(`Receita "${id}" não encontrada`);
  return resolverReceita(r, dificuldade, TABELA_DIFICULDADE, INGREDIENTES);
}
