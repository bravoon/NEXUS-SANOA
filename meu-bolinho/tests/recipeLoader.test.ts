import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import difficulty from '../src/data/difficulty.json';
import ingredients from '../src/data/ingredients.json';
import { resolverReceita, validarReceita } from '../src/systems/recipe/recipeLoader';
import type { Dificuldade, IngredienteDef, ParametrosDificuldade } from '../src/systems/recipe/recipeTypes';

const tabela = difficulty as Record<Dificuldade, ParametrosDificuldade>;
const ings = ingredients as Record<string, IngredienteDef>;
const dir = join(__dirname, '../src/data/recipes');

describe('receitas em src/data/recipes', () => {
  for (const arq of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    it(`${arq} é válida e resolve nos dois modos`, () => {
      const r = validarReceita(JSON.parse(readFileSync(join(dir, arq), 'utf8')));
      for (const d of ['facil', 'confeiteiro'] as const) {
        const res = resolverReceita(r, d, tabela, ings);
        expect(res.etapas.length).toBeGreaterThan(0);
        expect(res.ingredientes.length).toBeLessThanOrEqual(tabela[d].maxIngredientes);
      }
    });
  }
});

describe('resolverReceita', () => {
  const base = {
    id: 'x', nome: 'X', corMassa: '#123456',
    etapas: [
      { tipo: 'despejar', item: 'farinha', quantidade: 1 },
      { tipo: 'despejar', item: 'leite', quantidade: 1, tolerancia: 0.5 },
      { tipo: 'despejar', item: 'chocolate_po', quantidade: 0.5, apenas: 'confeiteiro' },
      { tipo: 'mexer' },
    ],
  };

  it('aplica padrões da dificuldade e respeita sobrescritas', () => {
    const f = resolverReceita(validarReceita(base), 'facil', tabela, ings);
    expect(f.etapas[0]).toMatchObject({ tolerancia: 0.2, material: 'po' });
    expect(f.etapas[1]).toMatchObject({ tolerancia: 0.5, material: 'liquido' });
    expect(f.etapas.at(-1)).toEqual({ tipo: 'mexer', voltas: 5 });
    const c = resolverReceita(validarReceita(base), 'confeiteiro', tabela, ings);
    expect(c.etapas[0]).toMatchObject({ tolerancia: 0.08 });
    expect(c.etapas.at(-1)).toEqual({ tipo: 'mexer', voltas: 10 });
  });

  it('filtra etapas "apenas"', () => {
    expect(resolverReceita(validarReceita(base), 'facil', tabela, ings).ingredientes).not.toContain('chocolate_po');
    expect(resolverReceita(validarReceita(base), 'confeiteiro', tabela, ings).ingredientes).toContain('chocolate_po');
  });

  it('recusa JSON inválido com mensagem clara', () => {
    expect(() => validarReceita({ ...base, etapas: [{ tipo: 'voar' }] })).toThrow(/tipo desconhecido/);
    expect(() => validarReceita({ ...base, corMassa: 'azul' })).toThrow(/corMassa/);
    expect(() => validarReceita({ ...base, etapas: [{ tipo: 'despejar', item: 'leite' }] })).toThrow(/quantidade/);
    expect(() => validarReceita({ ...base, etapas: [{ tipo: 'mexer', voltas: -1 }] })).toThrow(/voltas/);
    expect(() =>
      resolverReceita(validarReceita({ ...base, etapas: [{ tipo: 'despejar', item: 'unicornio', quantidade: 1 }] }), 'facil', tabela, ings),
    ).toThrow(/não existe/);
  });

  it('recusa receitas acima do máximo de ingredientes do nível', () => {
    const muitos = { ...base, etapas: ['farinha', 'acucar', 'leite', 'chocolate_po', 'farinha2'].map((item) => ({ tipo: 'despejar', item, quantidade: 1 })) };
    const ingsExtra = { ...ings, farinha2: ings['farinha']! };
    expect(() => resolverReceita(validarReceita(muitos), 'facil', tabela, ingsExtra)).toThrow(/excedem/);
  });
});
