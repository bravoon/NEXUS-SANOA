/** Pausa (sobreposta à cena de jogo, que fica congelada — inclusive o forno). */
import Phaser from 'phaser';
import { ALTURA, CORES, LARGURA } from '../config/layout';
import { botaoGrande } from './ui';

export class PausaScene extends Phaser.Scene {
  private origem = '';

  constructor() {
    super('Pausa');
  }

  init(dados: { origem: string }): void {
    this.origem = dados.origem;
  }

  create(): void {
    this.add.rectangle(0, 0, LARGURA, ALTURA, 0x3b2a20, 0.55).setOrigin(0).setInteractive();
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(LARGURA / 2 - 280, ALTURA / 2 - 170, 560, 340, 32);
    g.lineStyle(6, CORES.mesaBorda, 1);
    g.strokeRoundedRect(LARGURA / 2 - 280, ALTURA / 2 - 170, 560, 340, 32);
    g.fillStyle(CORES.texto, 1);
    g.fillRoundedRect(LARGURA / 2 - 30, ALTURA / 2 - 130, 20, 70, 6);
    g.fillRoundedRect(LARGURA / 2 + 10, ALTURA / 2 - 130, 20, 70, 6);
    botaoGrande(this, LARGURA / 2, ALTURA / 2 + 10, '▶ Continuar', CORES.sucesso, () => {
      this.scene.resume(this.origem);
      this.scene.stop();
    });
    botaoGrande(this, LARGURA / 2, ALTURA / 2 + 115, '⌂ Sair', 0xd55e00, () => {
      this.scene.stop(this.origem);
      this.scene.start('Menu');
    }, 260, 76);
  }
}
