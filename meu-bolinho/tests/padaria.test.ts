import { describe, expect, it } from 'vitest';
import { RollStep } from '../src/systems/steps/RollStep';
import { CutStep } from '../src/systems/steps/CutStep';
import { SliceStep } from '../src/systems/steps/SliceStep';
import { caixaDoProduto, dentroDoProduto, geometriaDoProduto } from '../src/systems/produto/Produto';
import { resolverReceita, validarReceita } from '../src/systems/recipe/recipeLoader';
import { INGREDIENTES, TABELA_DIFICULDADE } from '../src/data/registry';

const passadas = (c: RollStep, n: number, sobre = true, amp = 20, dt = 40) => {
  let t = 0, b = 0;
  for (let i = 0; i < n; i++) for (let k = 1; k <= 6; k++) b += c.amostra(0, (i % 2 === 0 ? k : 6 - k) * amp, (t += dt), sobre);
  return b;
};

describe('abrir massa (RollStep)', () => {
  it('sem a massa na forma, o rolo não abre nada', () => {
    const c = new RollStep(8);
    expect(passadas(c, 20)).toBe(0);
    expect(c.progresso).toBe(0);
  });
  it('massa na forma + passadas amplas abrem até a meta', () => {
    const c = new RollStep(8);
    expect(c.colocarMassa()).toBe(true);
    expect(c.colocarMassa()).toBe(false);
    passadas(c, 30);
    expect(c.metaAtingida()).toBe(true);
    expect(c.abertura).toBe(1);
  });
  it('fora da massa, tremendo ou devagar não abre', () => {
    const c = new RollStep(8);
    c.colocarMassa();
    expect(passadas(c, 30, false)).toBe(0);
    c.fimDoGesto();
    expect(passadas(c, 30, true, 2)).toBe(0); // tremor
    c.fimDoGesto();
    expect(passadas(c, 30, true, 20, 600)).toBe(0); // devagar demais
  });
});

describe('cortar biscoitos (CutStep)', () => {
  it('corta onde a criança soltou; fora da massa ou encostado não', () => {
    const c = new CutStep(3);
    expect(c.cortar(0.95, 0)).toBe('fora');
    expect(c.cortar(0, 0)).toBe('cortou');
    expect(c.cortar(0.2, 0)).toBe('encostado');
    expect(c.cortar(0.5, 0)).toBe('cortou');
    expect(c.biscoitos).toEqual([{ x: 0, y: 0 }, { x: 0.5, y: 0 }]);
    expect(c.metaAtingida()).toBe(false);
    expect(c.cortar(-0.5, 0)).toBe('cortou');
    expect(c.metaAtingida()).toBe(true);
    expect(c.cortar(0, 0.6)).toBe('completo');
  });
  it('a meta dos dois modos cabe na massa', () => {
    expect(CutStep.cabem()).toBeGreaterThanOrEqual(TABELA_DIFICULDADE.confeiteiro.biscoitos);
  });
});

describe('fatiar (SliceStep)', () => {
  it('só conta corte de borda a borda pelo meio, em direção nova', () => {
    const c = new SliceStep(3);
    expect(c.cortar({ x: -0.5, y: 0 }, { x: 0.5, y: 0 })).toBe('curto');
    expect(c.cortar({ x: -1.2, y: 0.5 }, { x: 1.2, y: 0.5 })).toBe('fora_do_meio');
    expect(c.cortar({ x: -1.2, y: 0 }, { x: -0.9, y: 0.3 })).toBe('curto');
    expect(c.cortar({ x: -1.2, y: 0 }, { x: 1.2, y: 0 })).toBe('cortou');
    expect(c.cortar({ x: 1.2, y: 0.1 }, { x: -1.2, y: -0.1 })).toBe('repetido'); // mesma direção, ao contrário
    expect(c.cortar({ x: 0, y: -1.2 }, { x: 0, y: 1.2 })).toBe('cortou');
    expect(c.fatias).toBe(4);
    expect(c.cortar({ x: -1, y: -1 }, { x: 1, y: 1 })).toBe('cortou');
    expect(c.metaAtingida()).toBe(true);
    expect(c.fatias).toBe(6);
  });
});

describe('geometria dos produtos', () => {
  const bolo = { rx: 215, ry: 88, alturaLateral: 110 };
  const c = { x: 640, y: 360 };
  it('cupcakes: 6 topos separados (o espaço entre eles não é topo)', () => {
    const g = geometriaDoProduto('cupcake', c, bolo);
    expect(g.pecas).toHaveLength(6);
    const p = g.pecas[0]!;
    expect(dentroDoProduto(g, p.cx, p.cy)).toBe(true);
    expect(dentroDoProduto(g, (g.pecas[0]!.cx + g.pecas[1]!.cx) / 2, p.cy)).toBe(false);
  });
  it('biscoitos ficam onde foram cortados', () => {
    const g = geometriaDoProduto('biscoito', c, bolo, [{ x: 0, y: 0 }, { x: 0.5, y: 0.1 }]);
    expect(g.pecas).toHaveLength(2);
    expect(g.pecas[1]!.cx).toBeGreaterThan(g.pecas[0]!.cx);
    const cx = caixaDoProduto(g);
    expect(cx.largura).toBeGreaterThan(0);
  });
  it('brownie é retangular (a quina conta, fora não)', () => {
    const g = geometriaDoProduto('brownie', c, bolo);
    const p = g.pecas[0]!;
    expect(dentroDoProduto(g, p.cx + p.rx - 2, p.cy + p.ry - 2)).toBe(true);
    expect(dentroDoProduto(g, p.cx + p.rx + 4, p.cy)).toBe(false);
  });
});

describe('regras de ordem por produto', () => {
  const r = (produto: string, etapas: object[]) => () =>
    resolverReceita(validarReceita({ id: 'x', nome: 'x', produto, corMassa: '#ffffff', etapas }), 'facil', TABELA_DIFICULDADE, INGREDIENTES);
  const base = [{ tipo: 'despejar', item: 'farinha', quantidade: 1 }, { tipo: 'mexer' }];
  it('biscoito precisa ser cortado antes do forno', () => {
    expect(r('biscoito', [...base, { tipo: 'abrir_massa' }, { tipo: 'forno' }])).toThrow(/cortados/);
    expect(r('biscoito', [...base, { tipo: 'abrir_massa' }, { tipo: 'cortar' }, { tipo: 'forno' }])).not.toThrow();
  });
  it('só bolo desenforma virando; torta decora direto do forno', () => {
    expect(r('torta', [...base, { tipo: 'abrir_massa' }, { tipo: 'forno' }, { tipo: 'desenformar' }])).toThrow(/só o bolo/);
    expect(r('torta', [...base, { tipo: 'abrir_massa' }, { tipo: 'forno' }, { tipo: 'decorar' }, { tipo: 'fatiar' }])).not.toThrow();
  });
  it('cupcake não se fatia; brownie não abre com rolo; produto desconhecido é recusado', () => {
    expect(r('cupcake', [...base, { tipo: 'despejar_massa' }, { tipo: 'forno' }, { tipo: 'decorar' }, { tipo: 'fatiar' }])).toThrow(/não se fatia/);
    expect(r('brownie', [...base, { tipo: 'abrir_massa' }])).toThrow(/abrir/);
    expect(r('pizza', base)).toThrow(/produto/);
  });
});
