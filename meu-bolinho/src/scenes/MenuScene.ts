/** Menu inicial: botões grandes, sem depender de leitura. Cadeado (segurar 2 s) → área dos pais. */
import Phaser from 'phaser';
import { assarGraphics } from '../utils/CacheGrafico';
import { TEXTURAS } from '../art/ArteProcedural';
import { ALTURA, LARGURA } from '../config/layout';
import { CORES } from '../config/layout';
import { PauseButton } from '../entities/PauseButton';
import { AudioSystem } from '../systems/audio/AudioSystem';
import { botaoGrande, ESTILO_TITULO } from './ui';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    this.add.image(0, 0, TEXTURAS.fundoMenu).setOrigin(0);
    const audio = AudioSystem.get();
    this.input.once('pointerdown', () => audio?.desbloquear());

    // bolinho gigante do título, respirando
    const c = this.add.container(LARGURA / 2, 330);
    const g = this.add.graphics();
    g.fillStyle(0xcc79a7, 1);
    g.fillPoints([{ x: -90, y: 0 }, { x: 90, y: 0 }, { x: 66, y: 110 }, { x: -66, y: 110 }], true);
    g.fillStyle(0xb5608f, 1);
    for (let i = -66; i <= 54; i += 30) g.fillPoints([{ x: i, y: 0 }, { x: i + 15, y: 0 }, { x: (i + 15) * 0.75, y: 110 }, { x: i * 0.75, y: 110 }], true);
    g.fillStyle(0xfff0f5, 1);
    g.fillCircle(-50, -12, 52);
    g.fillCircle(50, -12, 52);
    g.fillCircle(0, -56, 62);
    g.fillStyle(0xd7263d, 1);
    g.fillCircle(0, -120, 20);
    g.fillStyle(0x3b2a20, 1);
    g.fillEllipse(-26, -40, 18, 22);
    g.fillEllipse(26, -40, 18, 22);
    g.fillStyle(0x8e2a3a, 1);
    g.slice(0, -20, 18, 0.1 * Math.PI, 0.9 * Math.PI, false);
    g.fillPath();
    c.add(g);
    assarGraphics(this, g, 'menu:bolinho', { x: -120, y: -150, largura: 240, altura: 270 });
    this.tweens.add({ targets: c, scaleY: 1.04, scaleX: 0.97, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    this.add.text(LARGURA / 2, 100, 'Meu Bolinho', { ...ESTILO_TITULO, stroke: '#ffffff', strokeThickness: 10 }).setOrigin(0.5);
    botaoGrande(this, LARGURA / 2 - 110, 570, '▶  Jogar', CORES.sucesso, () => {
      audio?.desbloquear();
      audio?.efeito('pop');
      audio?.falar('escolher_receita');
      this.scene.start('Trilha');
    }, 320, 110);
    botaoGrande(this, LARGURA / 2 + 190, 570, '▦', 0xcc79a7, () => {
      audio?.desbloquear();
      audio?.efeito('pop');
      this.scene.start('Galeria');
    }, 150, 110);

    new PauseButton(this, () => this.scene.start('AreaPais'), { x: 60, y: ALTURA - 56, icone: 'cadeado' });
    this.add.text(110, ALTURA - 56, 'pais: segure 2 s', { fontFamily: 'Arial, sans-serif', fontSize: '16px', color: '#9c8a7e' }).setOrigin(0, 0.5);
    if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug'))
      this.add.text(LARGURA - 20, ALTURA - 20, 'Tecla D: modo debug', { fontFamily: 'Arial, sans-serif', fontSize: '15px', color: '#b0a49a' }).setOrigin(1, 1);

    audio?.falar('boas_vindas');
  }
}
