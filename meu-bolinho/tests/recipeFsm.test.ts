import { describe, expect, it } from 'vitest';
import { estadoInicial, transicao, transicaoValida, type EstadoReceita, type EventoReceita } from '../src/systems/recipe/recipeFsm';

const aplicar = (s: EstadoReceita, ...evs: EventoReceita[]) => evs.reduce(transicao, s);
const pronto = (total = 3) => aplicar(estadoInicial(total), { type: 'CARREGADA' }, { type: 'INICIAR' });
const fim = (metaAtingida: boolean): EventoReceita => ({ type: 'GESTO_FIM', metaAtingida });

describe('FSM da receita', () => {
  it('sequência válida percorre todas as etapas até o final', () => {
    let s = pronto(3);
    expect(s).toMatchObject({ sub: 'aguardando', indice: 0 });
    for (let i = 0; i < 3; i++) {
      s = aplicar(s, { type: 'GESTO_INICIO' }, fim(true));
      expect(s).toMatchObject({ sub: 'concluida', indice: i });
      s = transicao(s, { type: 'PROXIMA' });
    }
    expect(s.sub).toBe('final');
  });

  it('soltar antes da meta volta para aguardando sem avançar', () => {
    const s = aplicar(pronto(), { type: 'GESTO_INICIO' }, fim(false));
    expect(s).toMatchObject({ sub: 'aguardando', indice: 0 });
  });

  it('concluída é inalcançável a partir de aguardando (sem gesto)', () => {
    const s = pronto();
    for (const ev of [fim(true), { type: 'PROXIMA' } as const, { type: 'INICIAR' } as const]) {
      expect(transicao(s, ev)).toBe(s);
      expect(transicaoValida(s, ev)).toBe(false);
    }
  });

  it('PROXIMA só funciona depois de concluída', () => {
    const emGesto = aplicar(pronto(), { type: 'GESTO_INICIO' });
    expect(transicao(emGesto, { type: 'PROXIMA' })).toBe(emGesto);
  });

  it('correção bloqueia o avanço até o erro ser corrigido', () => {
    let s = aplicar(pronto(), { type: 'GESTO_INICIO' }, { type: 'ERRO', erro: 'excesso' });
    expect(s).toMatchObject({ sub: 'correcao', erro: 'excesso' });
    s = aplicar(s, fim(false), { type: 'PROXIMA' }, { type: 'GESTO_INICIO' }, fim(false));
    expect(s.sub).toBe('correcao');
    s = transicao(s, fim(true));
    expect(s).toMatchObject({ sub: 'concluida', erro: null, indice: 0 });
  });

  it('ERRO_CORRIGIDO volta para aguardando sem concluir; só vale na correção', () => {
    const emCorrecao = aplicar(pronto(), { type: 'GESTO_INICIO' }, { type: 'ERRO', erro: 'casca' });
    const s = transicao(emCorrecao, { type: 'ERRO_CORRIGIDO' });
    expect(s).toMatchObject({ sub: 'aguardando', erro: null, indice: 0 });
    expect(transicao(pronto(), { type: 'ERRO_CORRIGIDO' })).toMatchObject({ sub: 'aguardando' });
    const g = aplicar(pronto(), { type: 'GESTO_INICIO' });
    expect(transicao(g, { type: 'ERRO_CORRIGIDO' })).toBe(g);
  });

  it('não existe estado de derrota: nenhum evento leva a algo fora do conjunto conhecido', () => {
    const validos = new Set(['carregar', 'introducao', 'aguardando', 'em_gesto', 'correcao', 'concluida', 'final']);
    const eventos: EventoReceita[] = [
      { type: 'CARREGADA' }, { type: 'INICIAR' }, { type: 'GESTO_INICIO' }, fim(true), fim(false),
      { type: 'ERRO', erro: 'excesso' }, { type: 'ERRO_CORRIGIDO' }, { type: 'PROXIMA' },
    ];
    let s = estadoInicial(4);
    let seed = 1;
    for (let i = 0; i < 2000; i++) {
      seed = (seed * 16807) % 2147483647;
      s = transicao(s, eventos[seed % eventos.length]!);
      expect(validos.has(s.sub)).toBe(true);
      expect(s.indice).toBeLessThan(4);
    }
  });

  it('final é terminal', () => {
    let s = pronto(1);
    s = aplicar(s, { type: 'GESTO_INICIO' }, fim(true), { type: 'PROXIMA' });
    expect(s.sub).toBe('final');
    expect(transicao(s, { type: 'GESTO_INICIO' })).toBe(s);
  });

  it('rejeita receita sem etapas', () => {
    expect(() => estadoInicial(0)).toThrow();
  });
});
