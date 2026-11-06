import { describe, expect, it } from 'vitest';
import { SiftStep } from '../src/systems/steps/SiftStep';
import { GrateStep } from '../src/systems/steps/GrateStep';
import { SprinkleStep } from '../src/systems/steps/SprinkleStep';
import { DecorStep } from '../src/systems/steps/DecorStep';
import { CONFIG_POLVILHAR } from '../src/config/gameplay';

describe('peneirar (SiftStep)', () => {
  const sacudir = (c: SiftStep, n: number, sobre: boolean, dt = 120, amp = 80, t0 = 0) => {
    let q = 0;
    for (let i = 0; i < n; i++) q += c.amostra(i % 2 ? amp : -amp, t0 + i * dt, sobre);
    return q;
  };
  it('sacudir sobre a tigela faz cair a medida, porção a porção', () => {
    const c = new SiftStep('farinha', 1, 8);
    const q = sacudir(c, 40, true);
    expect(c.metaAtingida()).toBe(true);
    expect(q).toBeCloseTo(1);
    expect(c.restante).toBeCloseTo(0);
  });
  it('fora da tigela, parado, devagar ou arrastando reto: nada cai', () => {
    const c = new SiftStep('farinha', 1, 8);
    expect(sacudir(c, 40, false)).toBe(0);
    expect(sacudir(c, 40, true, 1000)).toBe(0); // devagar demais
    let q = 0;
    for (let i = 0; i < 40; i++) q += c.amostra(i * 30, i * 50, true); // reto
    expect(q).toBe(0);
    for (let i = 0; i < 40; i++) q += c.amostra(100, i * 50, true); // parado
    expect(q).toBe(0);
    expect(c.progresso).toBe(0);
  });
  it('não passa da medida (sem excesso)', () => {
    const c = new SiftStep('fuba', 0.5, 4);
    expect(sacudir(c, 200, true)).toBeCloseTo(0.5);
  });
});

describe('ralar (GrateStep)', () => {
  const passadas = (c: GrateStep, n: number, eixo: 'x' | 'y', no = true) => {
    let q = 0, t = 0;
    for (let i = 0; i < n; i++)
      for (let k = 1; k <= 6; k++) {
        const v = (i % 2 === 0 ? k : 6 - k) * 12;
        q += c.amostra(eixo === 'x' ? v : 0, eixo === 'y' ? v : 0, (t += 30), no);
      }
    return q;
  };
  it('passadas verticais no ralador ralam o pedaço todo', () => {
    const c = new GrateStep('coco', 0.5, 10);
    const q = passadas(c, 30, 'y');
    expect(c.metaAtingida()).toBe(true);
    expect(q).toBeCloseTo(0.5);
    expect(c.pedaco).toBeCloseTo(0);
  });
  it('de lado, fora do ralador ou tremendo não rala', () => {
    const c = new GrateStep('coco', 0.5, 10);
    expect(passadas(c, 30, 'x')).toBe(0);
    expect(passadas(c, 30, 'y', false)).toBe(0);
    let q = 0;
    for (let i = 0; i < 200; i++) q += c.amostra(0, i % 2 ? 4 : 0, i * 20, true); // tremor
    expect(q).toBe(0);
  });
});

describe('polvilhar (SprinkleStep / DecorStep)', () => {
  const area = { x: 0, y: 0, largura: 200, altura: 200 };
  it('sacudir sobre o bolo polvilha; mover sem sacudir não', () => {
    const s = new SprinkleStep(0.6);
    s.definirSuperficie(area, () => true);
    for (let i = 0; i < 40; i++) s.amostra(20 + i * 4, 100 - CONFIG_POLVILHAR.quedaPx, i * 120); // arrasta reto
    expect(s.cobertura).toBe(0);
    for (let i = 0; i < 6; i++) s.amostra(100 + (i % 2 ? 50 : -50), 100 - CONFIG_POLVILHAR.quedaPx, 10000 + i * 120);
    expect(s.cobertura).toBeGreaterThan(0);
    expect(s.metaAtingida()).toBe(false);
  });
  it('fora do bolo não polvilha', () => {
    const s = new SprinkleStep(0.6);
    s.definirSuperficie(area, (x, y) => x >= 0 && x <= 200 && y >= 0 && y <= 200);
    for (let i = 0; i < 20; i++) s.amostra(500 + (i % 2 ? 50 : -50), 500, i * 120);
    expect(s.sacudidas).toBe(0);
  });
  it('decorar com polvilho: cobrir → polvilhar → enfeitar', () => {
    const d = new DecorStep(0.5, 0, null, { tipo: 'acucar', cor: '#FFFFFF', cobertura: 0.3 });
    d.cobertura.definirSuperficie(area, () => true);
    for (let y = 0; y <= 200; y += 10) d.cobertura.pintar(0, y), d.cobertura.pintar(200, y), d.cobertura.fimDoGesto();
    expect(d.fase).toBe('polvilhar');
    expect(d.finalizar()).toBe(false);
    const sp = d.polvilhador!;
    sp.definirSuperficie(area, () => true);
    let t = 0;
    for (let y = 30; y <= 170 && !sp.metaAtingida(); y += 40)
      for (let x = 30; x <= 170 && !sp.metaAtingida(); x += 40) {
        sp.fimDoGesto();
        for (let i = 0; i < 4; i++) sp.amostra(x + (i % 2 ? 50 : -50), y - CONFIG_POLVILHAR.quedaPx, (t += 120));
      }
    expect(d.fase).toBe('enfeitar');
    expect(d.finalizar()).toBe(true);
  });
});
