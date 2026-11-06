import { describe, expect, it } from 'vitest';
import { VAZAO } from '../src/config/gameplay';
import {
  bicoSobreBoca,
  posicaoBico,
  quantidadeDespejada,
  vazaoPorAngulo,
  type BocaAlvo,
} from '../src/systems/fill/pourFlow';
import { anguloPorDeslocamento, TiltRecognizer } from '../src/systems/gesture/recognizers/TiltRecognizer';

const po = VAZAO.po;

describe('vazão por ângulo', () => {
  it('abaixo de 25° não sai nada', () => {
    for (const a of [0, 10, 24.9]) expect(vazaoPorAngulo(a, po)).toBe(0);
  });

  it('é monotônica crescente de 25° a 90° e atinge a vazão máxima', () => {
    let anterior = -1;
    for (let a = 25; a <= 90; a += 1) {
      const v = vazaoPorAngulo(a, po);
      expect(v).toBeGreaterThanOrEqual(anterior);
      anterior = v;
    }
    expect(vazaoPorAngulo(90, po)).toBeCloseTo(po.vazaoMax);
    expect(vazaoPorAngulo(180, po)).toBeCloseTo(po.vazaoMax);
  });

  it('massa é mais lenta que líquido', () => {
    expect(vazaoPorAngulo(70, VAZAO.massa)).toBeLessThan(vazaoPorAngulo(70, VAZAO.liquido));
  });

  it('ângulo inválido não gera vazão', () => {
    expect(vazaoPorAngulo(Number.NaN, po)).toBe(0);
  });
});

describe('quantidade despejada', () => {
  const entrada = { segurando: true, anguloGraus: 90, bicoSobreAlvo: true };

  it('bico fora da tigela não despeja nada', () => {
    expect(quantidadeDespejada({ ...entrada, bicoSobreAlvo: false }, 'po', 1, 1000)).toBe(0);
  });

  it('ZERO AUTO-COMPLETE: sem dedo segurando não despeja nada', () => {
    expect(quantidadeDespejada({ ...entrada, segurando: false }, 'po', 1, 10_000)).toBe(0);
  });

  it('recipiente vazio não despeja e nunca despeja mais que o disponível', () => {
    expect(quantidadeDespejada(entrada, 'po', 0, 1000)).toBe(0);
    expect(quantidadeDespejada(entrada, 'po', 0.01, 1000)).toBeCloseTo(0.01);
  });

  it('é proporcional ao tempo segurando', () => {
    const a = quantidadeDespejada(entrada, 'liquido', 10, 100);
    const b = quantidadeDespejada(entrada, 'liquido', 10, 200);
    expect(b).toBeCloseTo(a * 2);
  });
});

describe('geometria do bico e da boca', () => {
  const boca: BocaAlvo = { cx: 0, bordaY: 0, meiaLargura: 100, alturaMax: 300 };

  it('bico de pé fica no canto superior direito; a 90° gira para a direita', () => {
    expect(posicaoBico(0, 0, 80, 100, 0)).toEqual({ x: 40, y: -50 });
    const b = posicaoBico(0, 0, 80, 100, 90);
    expect(b.x).toBeCloseTo(50);
    expect(b.y).toBeCloseTo(40);
  });

  it('detecta bico sobre a boca e fora dela', () => {
    expect(bicoSobreBoca({ x: 0, y: -50 }, boca)).toBe(true);
    expect(bicoSobreBoca({ x: 150, y: -50 }, boca)).toBe(false); // ao lado
    expect(bicoSobreBoca({ x: 0, y: 20 }, boca)).toBe(false); // abaixo da borda
    expect(bicoSobreBoca({ x: 0, y: -400 }, boca)).toBe(false); // alto demais
  });
});

describe('inclinação pelo deslocamento do dedo', () => {
  it('converte deslocamento em 0..90°', () => {
    expect(anguloPorDeslocamento(-50, 160)).toBe(0);
    expect(anguloPorDeslocamento(80, 160)).toBe(45);
    expect(anguloPorDeslocamento(500, 160)).toBe(90);
  });

  it('é relativo ao ponto de entrada na zona e zera ao parar', () => {
    const t = new TiltRecognizer(160);
    expect(t.atualizar(999)).toBe(0); // inativo
    t.iniciar(300);
    expect(t.atualizar(380)).toBe(45);
    expect(t.recuo(250)).toBe(50);
    t.parar();
    expect(t.anguloGraus).toBe(0);
  });
});
