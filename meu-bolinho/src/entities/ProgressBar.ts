/** Barra de progresso com faixa "pendente" (rotação reconhecida que ainda não conta). */
import Phaser from 'phaser';
import { CORES } from '../config/layout';
import { clamp } from '../utils/math';
import { desenharSetaCircular } from '../utils/desenho';
import { CacheGrafico, imagemVetorial } from '../utils/CacheGrafico';

export class ProgressBar extends Phaser.GameObjects.Container {
  private readonly barra: CacheGrafico;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly largura: number,
    private readonly altura: number,
    icone: 'mexer' | 'nenhum' = 'mexer',
  ) {
    super(scene, x, y);
    this.barra = new CacheGrafico(scene, { x: -4, y: -4, largura: largura + 8, altura: altura + 8 }, false);
    this.add(this.barra.imagem);
    if (icone === 'mexer') {
      this.add(imagemVetorial(scene, 'barra:icone-mexer', { x: -60, y: altura / 2 - 26, largura: 52, altura: 52 }, (ic) => desenharSetaCircular(ic, -34, altura / 2, 18, CORES.texto, 5)));
    }
    this.setDepth(50);
    scene.add.existing(this);
    this.definir(0, 0);
  }

  definir(valor: number, pendente: number): void {
    const v = clamp(valor, 0, 1);
    const p = clamp(pendente, 0, 1 - v);
    this.barra.desenhar((g) => this.pintar(g, v, p), `${v.toFixed(3)}|${p.toFixed(3)}`);
  }

  private pintar(g: Phaser.GameObjects.Graphics, v: number, p: number): void {
    const r = this.altura / 2;
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
