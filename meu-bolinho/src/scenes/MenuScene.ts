/** Menu do protótipo: escolha da dificuldade (botões grandes, sem depender de leitura). */
import Phaser from 'phaser';
import { ALTURA, CORES, LARGURA } from '../config/layout';
import type { Dificuldade } from '../systems/recipe/recipeTypes';
import type { DadosCozinha } from './CozinhaScene';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(CORES.fundo);
    this.add
      .text(LARGURA / 2, 150, 'Meu Bolinho', { fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif', fontSize: '84px', color: '#3b2a20', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.add
      .text(LARGURA / 2, 225, 'Protótipo — Milestone 1', { fontFamily: 'Arial, sans-serif', fontSize: '24px', color: '#6b5a4e' })
      .setOrigin(0.5);

    this.botao(LARGURA / 2 - 190, 420, 'Fácil', 1, 0x56b4e9, 'facil');
    this.botao(LARGURA / 2 + 190, 420, 'Confeiteiro', 2, 0xe69f00, 'confeiteiro');

    this.add
      .text(LARGURA / 2, ALTURA - 40, 'Tecla D: modo debug', { fontFamily: 'Arial, sans-serif', fontSize: '18px', color: '#9c8a7e' })
      .setOrigin(0.5);
  }

  private botao(x: number, y: number, rotulo: string, estrelas: number, cor: number, dificuldade: Dificuldade): void {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    g.fillStyle(cor, 1);
    g.fillRoundedRect(-160, -110, 320, 220, 36);
    g.lineStyle(6, CORES.texto, 1);
    g.strokeRoundedRect(-160, -110, 320, 220, 36);
    const txt = this.add
      .text(0, 50, rotulo, { fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif', fontSize: '40px', color: '#ffffff', fontStyle: 'bold', stroke: '#3b2a20', strokeThickness: 6 })
      .setOrigin(0.5);
    c.add([g, txt]);
    for (let i = 0; i < estrelas; i++) {
      c.add(this.add.image((i - (estrelas - 1) / 2) * 70, -35, 'estrela').setScale(2.6).setTint(CORES.destaque));
    }
    c.setSize(320, 220).setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => c.setScale(0.95));
    c.on('pointerout', () => c.setScale(1));
    c.on('pointerup', () => {
      const dados: DadosCozinha = { receitaId: 'prototipo', dificuldade };
      this.scene.start('Cozinha', dados);
    });
  }
}
