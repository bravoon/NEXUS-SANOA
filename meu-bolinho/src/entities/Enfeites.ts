/** Desenho dos enfeites (formas simples). Usado no Confeitar, na bandeja e no Resultado. */
import type Phaser from 'phaser';
import type { Enfeite, TipoEnfeite } from '../systems/decoration/Decoracao';
import { escurecer } from '../utils/desenho';

/** Cores dos confeitos: paleta Okabe-Ito (distinguíveis com daltonismo). */
export const CORES_CONFEITO = [0xe69f00, 0x56b4e9, 0x009e73, 0xf0e442, 0x0072b2, 0xd55e00, 0xcc79a7];

export function desenharEnfeite(g: Phaser.GameObjects.Graphics, e: Pick<Enfeite, 'tipo' | 'x' | 'y' | 'rot' | 'cor'>, escala = 1): void {
  const { x, y } = e;
  const s = escala;
  switch (e.tipo) {
    case 'confeito':
      g.fillStyle(e.cor, 1);
      g.fillCircle(x, y, 9 * s);
      g.lineStyle(2, escurecer(e.cor, 0.4), 1);
      g.strokeCircle(x, y, 9 * s);
      g.fillStyle(0xffffff, 0.7);
      g.fillCircle(x - 3 * s, y - 3 * s, 3 * s);
      break;
    case 'morango':
      g.fillStyle(0xd7263d, 1);
      g.fillCircle(x - 7 * s, y - 2 * s, 9 * s);
      g.fillCircle(x + 7 * s, y - 2 * s, 9 * s);
      g.fillTriangle(x - 15 * s, y, x + 15 * s, y, x, y + 18 * s);
      g.fillStyle(0x009e73, 1);
      g.fillTriangle(x - 10 * s, y - 10 * s, x + 10 * s, y - 10 * s, x, y - 2 * s);
      g.fillStyle(0xf0e442, 1);
      for (const [dx, dy] of [[-6, 2], [5, 4], [0, 9], [-2, -3]] as const) g.fillCircle(x + dx * s, y + dy * s, 1.6 * s);
      break;
    case 'vela':
      g.fillStyle(e.cor, 1);
      g.fillRect(x - 6 * s, y - 46 * s, 12 * s, 46 * s);
      g.lineStyle(2, escurecer(e.cor, 0.4), 1);
      g.strokeRect(x - 6 * s, y - 46 * s, 12 * s, 46 * s);
      g.fillStyle(0xffffff, 0.6);
      for (let i = 0; i < 3; i++) g.fillRect(x - 6 * s, y - (40 - i * 14) * s, 12 * s, 4 * s);
      g.fillStyle(0xff9f1c, 1);
      g.fillEllipse(x, y - 56 * s, 12 * s, 18 * s);
      g.fillStyle(0xf0e442, 1);
      g.fillEllipse(x, y - 54 * s, 6 * s, 10 * s);
      break;
    case 'granulado': {
      const c = Math.cos(e.rot), sn = Math.sin(e.rot);
      g.lineStyle(4 * s, e.cor, 1);
      g.lineBetween(x - c * 5 * s, y - sn * 5 * s, x + c * 5 * s, y + sn * 5 * s);
      break;
    }
  }
}

/** Ícone de um tipo de enfeite (bandeja). */
export function desenharIconeEnfeite(g: Phaser.GameObjects.Graphics, tipo: TipoEnfeite, x: number, y: number): void {
  if (tipo === 'granulado') {
    // pote de granulado
    g.fillStyle(0xfdf6ee, 1);
    g.fillRoundedRect(x - 24, y - 26, 48, 54, 10);
    g.lineStyle(3, 0x6b5a4e, 1);
    g.strokeRoundedRect(x - 24, y - 26, 48, 54, 10);
    g.fillStyle(0x6b5a4e, 1);
    g.fillRect(x - 26, y - 34, 52, 12);
    for (let i = 0; i < 9; i++) {
      desenharEnfeite(g, { tipo: 'granulado', x: x - 14 + (i % 3) * 14, y: y - 8 + Math.floor(i / 3) * 12, rot: i, cor: CORES_CONFEITO[i % CORES_CONFEITO.length]! });
    }
    return;
  }
  desenharEnfeite(g, { tipo, x, y: tipo === 'vela' ? y + 26 : y, rot: 0, cor: tipo === 'vela' ? 0x56b4e9 : 0xcc79a7 }, 1.3);
}
