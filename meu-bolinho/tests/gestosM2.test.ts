import { describe, expect, it } from 'vitest';
import { ShakeRecognizer } from '../src/systems/gesture/recognizers/ShakeRecognizer';
import { SwipeRecognizer } from '../src/systems/gesture/recognizers/SwipeRecognizer';

describe('SwipeRecognizer', () => {
  const swipe = (dy: number, ms: number, dx = 0) => {
    const s = new SwipeRecognizer();
    s.inicio(100, 100, 0);
    for (let t = 0; t <= ms; t += 16) s.mover(100 + (dx * t) / ms, 100 + (dy * t) / ms, t);
    return s.fim(100 + dx, 100 + dy, ms);
  };

  it('aceita swipe para baixo longo e rápido', () => {
    expect(swipe(200, 200)).toBe('ok');
  });

  it('recusa curto, lento, torto ou para cima', () => {
    expect(swipe(100, 100)).toBe('curto');
    expect(swipe(200, 1000)).toBe('lento');
    expect(swipe(200, 200, 180)).toBe('torto');
    expect(swipe(-200, 200)).toBe('curto');
  });

  it('progresso visual acompanha o dedo e nunca passa de 1', () => {
    const s = new SwipeRecognizer();
    s.inicio(0, 0, 0);
    expect(s.mover(0, 75, 50)).toBeCloseTo(0.5);
    expect(s.mover(0, 500, 100)).toBe(1);
  });

  it('sem início não conclui', () => {
    expect(new SwipeRecognizer().fim(0, 999, 10)).toBe('inativo');
  });
});

describe('ShakeRecognizer', () => {
  const sacudir = (amplitude: number, periodoMs: number, duracaoMs: number) => {
    const s = new ShakeRecognizer();
    let porcoes = 0;
    for (let t = 0; t <= duracaoMs; t += 16) porcoes += s.amostra(200 + amplitude * Math.sin((t / periodoMs) * Math.PI * 2), t);
    return porcoes;
  };

  it('vai e vem rápido emite porções', () => {
    expect(sacudir(60, 200, 2000)).toBeGreaterThanOrEqual(5);
  });

  it('movimento lento não emite', () => {
    expect(sacudir(60, 2000, 4000)).toBe(0);
  });

  it('arrastar rápido em uma direção só não emite', () => {
    const s = new ShakeRecognizer();
    let p = 0;
    for (let t = 0; t <= 1000; t += 16) p += s.amostra(t * 2, t);
    expect(p).toBe(0);
  });

  it('ZERO AUTO-COMPLETE: parar de sacudir para as porções', () => {
    const s = new ShakeRecognizer();
    for (let t = 0; t <= 1000; t += 16) s.amostra(200 + 60 * Math.sin((t / 200) * Math.PI * 2), t);
    let p = 0;
    for (let t = 1016; t <= 5000; t += 16) p += s.amostra(200, t);
    expect(p).toBe(0);
  });
});
