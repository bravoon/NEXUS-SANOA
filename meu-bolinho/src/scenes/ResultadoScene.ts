/** Resultado: a foto do bolo decorado pela criança, com festa. Galeria entra no Milestone 4. */
import Phaser from 'phaser';
import { ALTURA, CORES, LARGURA } from '../config/layout';
import type { Sessao } from '../systems/recipe/Sessao';
import { botaoGrande } from './ui';
import { AudioSystem } from '../systems/audio/AudioSystem';

export class ResultadoScene extends Phaser.Scene {
  private sessao!: Sessao;

  constructor() {
    super('Resultado');
  }

  init(dados: { sessao: Sessao }): void {
    this.sessao = dados.sessao;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0xfce4ec);
    this.cameras.main.fadeIn(300, 255, 244, 230);
    const raios = this.add.graphics();
    for (let i = 0; i < 16; i++) {
      raios.fillStyle(i % 2 ? 0xffffff : CORES.destaque, 0.35);
      const a = (i / 16) * Math.PI * 2;
      const b = ((i + 1) / 16) * Math.PI * 2;
      raios.fillTriangle(0, 0, Math.cos(a) * 900, Math.sin(a) * 900, Math.cos(b) * 900, Math.sin(b) * 900);
    }
    raios.setPosition(LARGURA / 2, 330);
    this.tweens.add({ targets: raios, angle: 360, duration: 30000, repeat: -1 });

    const foto = this.sessao.fotoBolo;
    if (foto && this.textures.exists(foto)) {
      const img = this.add.image(LARGURA / 2, 340, foto);
      const k = Math.min(1.1, 600 / img.width, 400 / img.height);
      img.setScale(k * 0.6);
      this.tweens.add({ targets: img, scale: k, duration: 600, ease: 'Back.Out' });
    }

    this.add
      .text(LARGURA / 2, 70, `${this.sessao.receita.nome} pronto!`, {
        fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
        fontSize: '56px',
        color: '#3b2a20',
        fontStyle: 'bold',
        stroke: '#ffffff',
        strokeThickness: 8,
      })
      .setOrigin(0.5);

    const e = this.add.particles(LARGURA / 2, 100, 'estrela', {
      speed: { min: 200, max: 420 },
      angle: { min: 0, max: 360 },
      gravityY: 400,
      lifespan: 1600,
      scale: { start: 1.4, end: 0.4 },
      tint: [CORES.destaque, 0xe69f00, 0x56b4e9, 0xcc79a7],
      emitting: false,
    });
    e.explode(40);

    const audio = AudioSystem.get();
    audio?.efeito('festa');
    audio?.falar('resultado');
    botaoGrande(this, LARGURA / 2 - 180, ALTURA - 80, '↻ De novo', CORES.sucesso, () => this.scene.start('SelecaoReceita'));
    botaoGrande(this, LARGURA / 2 + 180, ALTURA - 80, '⌂ Início', 0x0072b2, () => this.scene.start('Menu'));
  }
}
