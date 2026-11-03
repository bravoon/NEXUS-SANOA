/** Menu inicial: botões grandes, sem depender de leitura. */
import Phaser from 'phaser';
import { ALTURA, CORES, LARGURA } from '../config/layout';
import { botaoGrande, ESTILO_TITULO } from './ui';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(CORES.fundo);
    // bolinho decorativo
    const g = this.add.graphics();
    g.fillStyle(0xcc79a7, 1);
    g.fillTriangle(LARGURA / 2 - 80, 330, LARGURA / 2 + 80, 330, LARGURA / 2 + 60, 430);
    g.fillTriangle(LARGURA / 2 - 80, 330, LARGURA / 2 + 60, 430, LARGURA / 2 - 60, 430);
    g.fillStyle(0xfff0f5, 1);
    g.fillCircle(LARGURA / 2 - 45, 320, 45);
    g.fillCircle(LARGURA / 2 + 45, 320, 45);
    g.fillCircle(LARGURA / 2, 285, 55);
    g.fillStyle(0xd55e00, 1);
    g.fillCircle(LARGURA / 2, 225, 16);

    this.add.text(LARGURA / 2, 120, 'Meu Bolinho', ESTILO_TITULO).setOrigin(0.5);
    botaoGrande(this, LARGURA / 2, 540, '▶  Jogar', CORES.sucesso, () => this.scene.start('SelecaoReceita'), 340, 110);
    this.add.text(LARGURA / 2, ALTURA - 30, 'Tecla D: modo debug  ·  segure ⏸ por 2 s para pausar', { fontFamily: 'Arial, sans-serif', fontSize: '18px', color: '#9c8a7e' }).setOrigin(0.5);
  }
}
