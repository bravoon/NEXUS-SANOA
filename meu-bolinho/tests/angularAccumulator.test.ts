import { describe, expect, it } from 'vitest';
import { AngularAccumulator } from '../src/systems/gesture/recognizers/AngularAccumulator';
import { circulo, reta, rng, type Amostra } from './helpers';

const R = 100;
const novo = () => new AngularAccumulator({ x: 0, y: 0 }, R);
const alimentar = (acc: AngularAccumulator, amostras: Amostra[]) => {
  for (const a of amostras) acc.addSample(a.x, a.y, a.t);
};

describe('AngularAccumulator', () => {
  it('conta 1 volta para um círculo completo dentro do anel', () => {
    const acc = novo();
    alimentar(acc, circulo({ raio: 60, voltas: 1, duracaoMs: 1000 }));
    expect(acc.voltas).toBeCloseTo(1, 1);
  });

  it('conta voltas nos dois sentidos (horário e anti-horário)', () => {
    const a = novo();
    alimentar(a, circulo({ raio: 60, voltas: 3, duracaoMs: 3000 }));
    const b = novo();
    alimentar(b, circulo({ raio: 60, voltas: -3, duracaoMs: 3000 }));
    expect(a.voltas).toBeCloseTo(3, 1);
    expect(b.voltas).toBeCloseTo(3, 1);
  });

  it('meia volta (< π) não conta nada', () => {
    const acc = novo();
    alimentar(acc, circulo({ raio: 60, voltas: 0.45, duracaoMs: 600 }));
    expect(acc.voltas).toBe(0);
    expect(acc.pendenteRad).toBeGreaterThan(0);
  });

  it('linha reta não conta voltas, mesmo repetida em várias direções', () => {
    const acc = novo();
    let t = 0;
    for (let i = 0; i < 30; i++) {
      const ang = (i / 30) * Math.PI * 2;
      const off = { x: Math.cos(ang + Math.PI / 2) * 50, y: Math.sin(ang + Math.PI / 2) * 50 };
      const dir = { x: Math.cos(ang) * 90, y: Math.sin(ang) * 90 };
      alimentar(acc, reta({ x: off.x - dir.x, y: off.y - dir.y }, { x: off.x + dir.x, y: off.y + dir.y }, 300, t));
      acc.endGesture(); // levanta o dedo entre os traços
      t += 400;
    }
    expect(acc.voltas).toBe(0);
  });

  it('linha reta passando pelo centro não conta', () => {
    const acc = novo();
    alimentar(acc, reta({ x: -95, y: 0 }, { x: 95, y: 0 }, 500));
    expect(acc.voltas).toBe(0);
  });

  it('dedo parado (com tremor de ±1,5 px) não conta', () => {
    const acc = novo();
    const r = rng(7);
    for (let i = 0; i < 600; i++) acc.addSample(60 + (r() - 0.5) * 3, (r() - 0.5) * 3, i * 16.7);
    expect(acc.voltas).toBe(0);
  });

  it('vai e vem em arcos de 90° não conta', () => {
    const acc = novo();
    let t = 0;
    for (let i = 0; i < 20; i++) {
      const sentido = i % 2 === 0 ? 0.25 : -0.25;
      const ini = i % 2 === 0 ? 0 : Math.PI / 2;
      alimentar(acc, circulo({ raio: 60, voltas: sentido, duracaoMs: 250, t0: t, anguloInicial: ini }));
      t += 250;
    }
    expect(acc.voltas).toBe(0);
  });

  it('ignora movimento fora do anel (centro morto e fora da tigela)', () => {
    const dentroDoCentro = novo();
    alimentar(dentroDoCentro, circulo({ raio: 20, voltas: 3, duracaoMs: 3000 }));
    const foraDaTigela = novo();
    alimentar(foraDaTigela, circulo({ raio: 120, voltas: 3, duracaoMs: 3000 }));
    expect(dentroDoCentro.voltas).toBe(0);
    expect(foraDaTigela.voltas).toBe(0);
  });

  it('descarta saltos maiores que π/2', () => {
    const acc = novo();
    // pontos alternando entre lados opostos: cada delta é ~π
    for (let i = 0; i < 100; i++) {
      const a = i * (Math.PI * 0.9);
      const r = acc.addSample(Math.cos(a) * 60, Math.sin(a) * 60, i * 16);
      if (i > 0) expect(r.motivo).toBe('salto');
    }
    expect(acc.voltas).toBe(0);
  });

  it('rotação muito lenta (abaixo da velocidade mínima) é tratada como parado', () => {
    const acc = novo();
    alimentar(acc, circulo({ raio: 60, voltas: 1, duracaoMs: 20000 }));
    expect(acc.voltas).toBe(0);
  });

  it('rotação lenta mas intencional (1 volta em 6 s) conta', () => {
    const acc = novo();
    alimentar(acc, circulo({ raio: 60, voltas: 1, duracaoMs: 6000 }));
    expect(acc.voltas).toBeCloseTo(1, 1);
  });

  it('progresso nunca diminui ao inverter o sentido', () => {
    const acc = novo();
    const traj = [
      ...circulo({ raio: 60, voltas: 2, duracaoMs: 2000 }),
      ...circulo({ raio: 60, voltas: -2, duracaoMs: 2000, t0: 2000 + 16, anguloInicial: 0 }),
    ];
    let anterior = 0;
    for (const a of traj) {
      acc.addSample(a.x, a.y, a.t);
      expect(acc.totalRad).toBeGreaterThanOrEqual(anterior);
      anterior = acc.totalRad;
    }
    // 2 voltas + (2 voltas no outro sentido − a histerese de detecção) ≈ 4
    expect(acc.voltas).toBeGreaterThan(3.7);
  });

  it('ZERO AUTO-COMPLETE: parar no meio congela o progresso', () => {
    const acc = novo();
    alimentar(acc, circulo({ raio: 60, voltas: 2.5, duracaoMs: 2500 }));
    const congelado = acc.totalRad;
    // dedo parado no mesmo lugar por 10 s
    const ultimo = circulo({ raio: 60, voltas: 2.5, duracaoMs: 2500 }).at(-1)!;
    for (let t = 2500; t < 12500; t += 16) acc.addSample(ultimo.x, ultimo.y, t);
    expect(acc.totalRad).toBe(congelado);
    // dedo levantado: nada muda
    acc.endGesture();
    expect(acc.totalRad).toBe(congelado);
  });

  it('a parte de um trecho abaixo de meia volta é descartada ao soltar o dedo', () => {
    const acc = novo();
    for (let i = 0; i < 5; i++) {
      alimentar(acc, circulo({ raio: 60, voltas: 0.4, duracaoMs: 400, t0: i * 1000 }));
      acc.endGesture();
    }
    expect(acc.voltas).toBe(0);
  });

  it('sair e voltar ao anel não gera salto', () => {
    const acc = novo();
    alimentar(acc, circulo({ raio: 60, voltas: 1, duracaoMs: 1000 }));
    const antes = acc.totalRad;
    acc.addSample(500, 500, 1100); // fora
    acc.addSample(-60, 0, 1200); // volta do lado oposto
    expect(acc.totalRad).toBe(antes);
  });
});
