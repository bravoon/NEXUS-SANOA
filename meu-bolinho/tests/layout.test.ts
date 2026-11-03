import { describe, expect, it } from 'vitest';
import { ALVO_TOQUE_MIN, MAX_RECIPIENTES, RECIPIENTE, TIGELA, posicoesRecipientes } from '../src/config/layout';

describe('layout dos recipientes (receitas data-driven)', () => {
  for (let n = 1; n <= MAX_RECIPIENTES; n++) {
    it(`${n} recipiente(s): sem sobreposição, alvo ≥ 64 px e longe da tigela`, () => {
      const pos = posicoesRecipientes(n);
      expect(pos).toHaveLength(n);
      for (let i = 0; i < n; i++) {
        const a = pos[i]!;
        expect(a.x + RECIPIENTE.largura / 2).toBeLessThan(TIGELA.cx - TIGELA.raio);
        for (let j = i + 1; j < n; j++) {
          const b = pos[j]!;
          const sobrepoe = Math.abs(a.x - b.x) < RECIPIENTE.largura + 20 && Math.abs(a.y - b.y) < RECIPIENTE.altura + 20;
          expect(sobrepoe, `${i} e ${j} se sobrepõem`).toBe(false);
        }
      }
      expect(Math.min(RECIPIENTE.largura, RECIPIENTE.altura)).toBeGreaterThanOrEqual(ALVO_TOQUE_MIN);
    });
  }

  it('recusa receitas com recipientes demais', () => {
    expect(() => posicoesRecipientes(MAX_RECIPIENTES + 1)).toThrow();
  });
});
