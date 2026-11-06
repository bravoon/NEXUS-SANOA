import { describe, expect, it } from 'vitest';
import { CoverageGrid, mascaraElipse } from '../src/systems/coverage/CoverageGrid';
import { CoverageStep } from '../src/systems/steps/CoverageStep';

const area = { x: 0, y: 0, largura: 320, altura: 320 };

describe('CoverageGrid', () => {
  it('pincelada cobrindo tudo = 100%', () => {
    const g = new CoverageGrid(area, 32, 32);
    g.pintarPonto(160, 160, 400);
    expect(g.razao).toBe(1);
  });

  it('metade da área ≈ 50%', () => {
    const g = new CoverageGrid(area, 32, 32);
    for (let y = 0; y <= 320; y += 10) g.pintarSegmento(0, y, 159, y, 6);
    expect(g.razao).toBeCloseTo(0.5, 2);
  });

  it('células fora da máscara não contam', () => {
    const g = new CoverageGrid(area, 32, 32, mascaraElipse(area));
    expect(g.celulasValidas).toBeLessThan(32 * 32);
    expect(g.celulasValidas).toBeGreaterThan(32 * 32 * 0.7); // ~π/4
    // pintar só os cantos (fora da elipse) não muda nada
    g.pintarPonto(0, 0, 30);
    g.pintarPonto(320, 320, 30);
    expect(g.razao).toBe(0);
    g.pintarPonto(160, 160, 400);
    expect(g.razao).toBe(1);
  });

  it('pincelada rápida (amostras distantes) não deixa buracos no caminho', () => {
    const g = new CoverageGrid(area, 32, 32);
    g.pintarSegmento(5, 160, 315, 160, 12); // um único segmento longo
    for (let c = 0; c < 32; c++) expect(g.estaPintada(c, 16)).toBe(true);
  });

  it('repintar a mesma área não aumenta a cobertura', () => {
    const g = new CoverageGrid(area, 32, 32);
    g.pintarPonto(100, 100, 40);
    const r = g.razao;
    for (let i = 0; i < 50; i++) g.pintarPonto(100, 100, 40);
    expect(g.razao).toBe(r);
  });
});

describe('CoverageStep', () => {
  it('sem superfície definida não pinta; meta só com cobertura suficiente', () => {
    const s = new CoverageStep('untar', 0.8);
    expect(s.pintar(10, 10)).toBeNull();
    s.definirSuperficie(area, mascaraElipse(area));
    for (let y = 0; y <= 320; y += 20) {
      s.pintar(0, y);
      s.pintar(320, y);
      s.fimDoGesto();
      if (y === 140) expect(s.metaAtingida()).toBe(false);
    }
    expect(s.metaAtingida()).toBe(true);
    expect(s.progresso).toBe(1);
  });

  it('ZERO AUTO-COMPLETE: sem amostras a cobertura não muda', () => {
    const s = new CoverageStep('cobrir', 0.9);
    s.definirSuperficie(area, mascaraElipse(area));
    s.pintar(100, 160);
    s.pintar(200, 160);
    const c = s.cobertura;
    s.fimDoGesto();
    expect(s.cobertura).toBe(c);
    // novo toque não "liga" com a pincelada anterior
    s.pintar(300, 300);
    expect(s.cobertura).toBe(c);
  });
});
