/** Barra de progresso com faixa "pendente" (rotação reconhecida que ainda não conta). */
import Phaser from 'phaser';
import { CORES } from '../config/layout';
import { clamp } from '../utils/math';
import { desenharSetaCircular } from '../utils/desenho';

export class ProgressBar extends Phaser.GameObjects.Container {
  private readonly g: Phaser.GameObjects.Graphics;
  private ultimaChave = '';

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly largura: number,
    private readonly altura: number,
    icone: 'mexer' | 'nenhum' = 'mexer',
  ) {
    super(scene, x, y);
    this.g = scene.add.graphics();
    const ic = scene.add.graphics();
    if (icone === 'mexer') desenharSetaCircular(ic, -34, altura / 2, 18, CORES.texto, 5);
    this.add([this.g, ic]);
    this.setDepth(50);
    scene.add.existing(this);
    this.definir(0, 0);
  }

  definir(valor: number, pendente: number): void {
    const v = clamp(valor, 0, 1);
    const p = clamp(pendente, 0, 1 - v);
    const chave = `${v.toFixed(3)}|${p.toFixed(3)}`;
    if (chave === this.ultimaChave) return;
    this.ultimaChave = chave;
    const g = this.g;
    const r = this.altura / 2;
    g.clear();
    g.fillStyle(CORES.barraFundo, 1);
    g.fillRoundedRect(0, 0, this.largura, this.altura, r);
    if (p > 0.001) {
      g.fillStyle(CORES.pendente, 0.7);
      g.fillRoundedRect(0, 0, Math.max(this.altura, (v + p) * this.largura), this.altura, r);
    }
    if (v > 0.001) {
      g.fillStyle(CORES.sucesso, 1);
      g.fillRoundedRect(0, 0, Math.max(this.altura, v * this.largura), this.altura, r);
    }
    g.lineStyle(4, CORES.texto, 1);
    g.strokeRoundedRect(0, 0, this.largura, this.altura, r);
  }
}
