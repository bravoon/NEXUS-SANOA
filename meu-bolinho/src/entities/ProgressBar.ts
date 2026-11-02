/** Barra de progresso com faixa "pendente" (rotação reconhecida que ainda não conta). */
import Phaser from 'phaser';
import { CORES } from '../config/layout';
import { clamp } from '../utils/math';
import { desenharSetaCircular } from '../utils/desenho';

export class ProgressBar extends Phaser.GameObjects.Container {
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly largura: number,
    private readonly altura: number,
  ) {
    super(scene, x, y);
    this.g = scene.add.graphics();
    const icone = scene.add.graphics();
    desenharSetaCircular(icone, -34, altura / 2, 18, CORES.texto, 5);
    this.add([this.g, icone]);
    this.setDepth(50);
    scene.add.existing(this);
    this.definir(0, 0);
  }

  definir(valor: number, pendente: number): void {
    const v = clamp(valor, 0, 1);
    const p = clamp(pendente, 0, 1 - v);
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
