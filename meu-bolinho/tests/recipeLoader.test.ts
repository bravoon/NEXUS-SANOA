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

  it('resolve as etapas do fluxo completo com padrões', () => {
    const r = validarReceita({
      id: 'y', nome: 'Y', corMassa: '#123456',
      etapas: [
        { tipo: 'quebrar_ovo', quantidade: 2 }, { tipo: 'untar' }, { tipo: 'despejar_massa' },
        { tipo: 'forno' }, { tipo: 'desenformar' }, { tipo: 'decorar', cobertura: 0.5 },
      ],
    });
    const f = resolverReceita(r, 'facil', tabela, ings);
    expect(f.etapas).toEqual([
      { tipo: 'quebrar_ovo', quantidade: 2, cascaDeOvo: false },
      { tipo: 'untar', cobertura: 0.8 },
      { tipo: 'despejar_massa', restanteMax: 0.05 },
      { tipo: 'forno', tempoSegundos: 20 },
      { tipo: 'desenformar' },
      { tipo: 'decorar', cobertura: 0.5, corCobertura: '#5A3220', glace: null },
    ]);
    expect(resolverReceita(r, 'confeiteiro', tabela, ings).etapas[0]).toMatchObject({ cascaDeOvo: true });
    expect(f.recipientes).toEqual([]);
    expect(f.ingredientes).toEqual(['ovo']);
  });

  it('recusa JSON inválido com mensagem clara', () => {
    expect(() => validarReceita({ ...base, etapas: [{ tipo: 'forno', tempoSegundos: 60 }] })).toThrow(/tempoSegundos/);
    expect(() => validarReceita({ ...base, etapas: [{ tipo: 'quebrar_ovo', quantidade: 1.5 }] })).toThrow(/inteira/);
    expect(() => validarReceita({ ...base, etapas: [{ tipo: 'untar', cobertura: 1.5 }] })).toThrow(/≤ 1/);
    expect(() => validarReceita({ ...base, etapas: [{ tipo: 'decorar', corCobertura: 'marrom' }] })).toThrow(/corCobertura/);
    expect(() => validarReceita({ ...base, etapas: [{ tipo: 'voar' }] })).toThrow(/tipo desconhecido/);
    expect(() => validarReceita({ ...base, corMassa: 'azul' })).toThrow(/corMassa/);
    expect(() => validarReceita({ ...base, etapas: [{ tipo: 'despejar', item: 'leite' }] })).toThrow(/quantidade/);
    expect(() => validarReceita({ ...base, etapas: [{ tipo: 'mexer', voltas: -1 }] })).toThrow(/voltas/);
    expect(() =>
      resolverReceita(validarReceita({ ...base, etapas: [{ tipo: 'despejar', item: 'unicornio', quantidade: 1 }] }), 'facil', tabela, ings),
    ).toThrow(/não existe/);
  });

  it('recusa sequências incoerentes (em vez de travar no meio do jogo)', () => {
    const r = (etapas: object[]) => () => resolverReceita(validarReceita({ ...base, etapas }), 'facil', tabela, ings);
    expect(r([{ tipo: 'despejar_massa' }])).toThrow(/tigela ainda está vazia/);
    expect(r([{ tipo: 'mexer' }])).toThrow(/tigela ainda está vazia/);
    expect(r([{ tipo: 'despejar', item: 'leite', quantidade: 1 }, { tipo: 'forno' }])).toThrow(/não há massa/);
    expect(r([{ tipo: 'despejar', item: 'leite', quantidade: 1 }, { tipo: 'despejar_massa' }, { tipo: 'decorar' }])).toThrow(/ainda está na forma/);
    expect(r([{ tipo: 'desenformar' }])).toThrow(/não foi assado/);
    // só untar/despejar etc. sem forno é permitido (receita curta)
    expect(r([{ tipo: 'despejar', item: 'leite', quantidade: 1 }, { tipo: 'mexer' }])).not.toThrow();
  });

  it('recusa receitas acima do máximo de ingredientes do nível', () => {
    const muitos = {
      ...base,
      etapas: [
        ...['farinha', 'acucar', 'leite', 'chocolate_po'].map((item) => ({ tipo: 'despejar', item, quantidade: 1 })),
        { tipo: 'quebrar_ovo', quantidade: 2 }, // o ovo também conta como ingrediente
      ],
    };
    expect(() => resolverReceita(validarReceita(muitos), 'facil', tabela, ings)).toThrow(/5 ingredientes excedem/);
    expect(resolverReceita(validarReceita(muitos), 'confeiteiro', tabela, ings).ingredientes).toContain('ovo');
  });
});

describe('acessibilidade dos ingredientes', () => {
  it('cada ingrediente tem forma (símbolo) única: identificável sem depender de cor', () => {
    const simbolos = Object.values(ings).map((d) => d.simbolo);
    expect(new Set(simbolos).size).toBe(simbolos.length);
  });
});
