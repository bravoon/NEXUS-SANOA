import { describe, expect, it } from 'vitest';
import {
  CHAVE_GALERIA,
  MAX_BOLOS,
  carregarGaleria,
  carregarProgresso,
  registrarConclusao,
  removerBolo,
  salvarBolo,
  type BoloSalvo,
} from '../src/systems/save/Galeria';
import type { Armazenamento } from '../src/systems/save/Preferencias';

/** Storage em memória com limite de bytes (simula a cota do localStorage). */
const memoria = (limite = Infinity): Armazenamento & { dados: Map<string, string> } => {
  const dados = new Map<string, string>();
  return {
    dados,
    getItem: (k) => dados.get(k) ?? null,
    setItem: (k, v) => {
      const total = [...dados.entries()].reduce((s, [kk, vv]) => s + (kk === k ? 0 : vv.length), 0) + v.length;
      if (total > limite) throw new DOMException('cheio', 'QuotaExceededError');
      dados.set(k, v);
    },
  };
};

const bolo = (i: number, tamanho = 100): BoloSalvo => ({
  id: `b${i}`,
  receitaId: 'fofinho',
  nomeReceita: 'Bolo Fofinho',
  dificuldade: 'facil',
  criadoEm: new Date(2026, 0, i + 1).toISOString(),
  foto: 'data:image/jpeg;base64,' + 'A'.repeat(tamanho),
  enfeites: i,
});

describe('Galeria', () => {
  it('salva, lista (mais novo primeiro) e remove', () => {
    const m = memoria();
    salvarBolo(m, bolo(1));
    salvarBolo(m, bolo(2));
    expect(carregarGaleria(m).map((b) => b.id)).toEqual(['b2', 'b1']);
    expect(removerBolo(m, 'b1')).toBe(true);
    expect(carregarGaleria(m).map((b) => b.id)).toEqual(['b2']);
    expect(removerBolo(m, 'nao-existe')).toBe(false);
  });

  it(`guarda no máximo ${MAX_BOLOS}; os mais antigos saem`, () => {
    const m = memoria();
    for (let i = 0; i < MAX_BOLOS + 5; i++) salvarBolo(m, bolo(i));
    const g = carregarGaleria(m);
    expect(g).toHaveLength(MAX_BOLOS);
    expect(g[0]!.id).toBe(`b${MAX_BOLOS + 4}`);
    expect(g.some((b) => b.id === 'b0')).toBe(false);
  });

  it('sem espaço no navegador: remove os mais antigos até caber', () => {
    const m = memoria(1500);
    for (let i = 0; i < 4; i++) expect(salvarBolo(m, bolo(i, 250)).ok).toBe(true);
    const r = salvarBolo(m, bolo(9, 250));
    expect(r.ok).toBe(true);
    expect(r.removidos).toBeGreaterThan(0);
    expect(carregarGaleria(m)[0]!.id).toBe('b9');
  });

  it('bolo maior que todo o espaço: não salva, mas não quebra', () => {
    const m = memoria(50);
    expect(salvarBolo(m, bolo(1, 500)).ok).toBe(false);
  });

  it('dados corrompidos ou entradas inválidas são ignorados', () => {
    const m = memoria();
    m.dados.set(CHAVE_GALERIA, '{{lixo');
    expect(carregarGaleria(m)).toEqual([]);
    m.dados.set(CHAVE_GALERIA, JSON.stringify([bolo(1), { id: 'x' }, { ...bolo(2), foto: 'javascript:alert(1)' }]));
    expect(carregarGaleria(m).map((b) => b.id)).toEqual(['b1']);
    expect(carregarGaleria(null)).toEqual([]);
  });
});

describe('Progresso', () => {
  it('conta receitas concluídas por dificuldade', () => {
    const m = memoria();
    registrarConclusao(m, 'fofinho', 'facil');
    registrarConclusao(m, 'fofinho', 'facil');
    registrarConclusao(m, 'chocolate', 'confeiteiro');
    expect(carregarProgresso(m)).toEqual({ fofinho: { facil: 2, confeiteiro: 0 }, chocolate: { facil: 0, confeiteiro: 1 } });
  });

  it('storage bloqueado não quebra', () => {
    const bloqueado: Armazenamento = { getItem: () => { throw new Error(); }, setItem: () => { throw new Error(); } };
    expect(registrarConclusao(bloqueado, 'x', 'facil')).toEqual({ x: { facil: 1, confeiteiro: 0 } });
    expect(carregarProgresso(bloqueado)).toEqual({});
  });
});
