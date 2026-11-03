/** Escolha da receita (descoberta automaticamente em data/recipes) e da dificuldade. */
import Phaser from 'phaser';
import { ALTURA, CORES, LARGURA } from '../config/layout';
import { carregarReceita, RECEITAS } from '../data/registry';
import { Sessao } from '../systems/recipe/Sessao';
import type { Dificuldade } from '../systems/recipe/recipeTypes';
import { corHex, escurecer } from '../utils/desenho';
import { aoSoltarNoObjeto, botaoGrande } from './ui';
import { TEXTURAS } from '../art/ArteProcedural';
import { AudioSystem } from '../systems/audio/AudioSystem';

export class SelecaoReceitaScene extends Phaser.Scene {
  private dificuldade: Dificuldade = 'facil';
  private marcadores: Record<Dificuldade, Phaser.GameObjects.Graphics> | null = null;

  constructor() {
    super('SelecaoReceita');
  }

  create(): void {
    this.add.image(0, 0, TEXTURAS.fundoMenu).setOrigin(0);
    this.add.text(LARGURA / 2, 60, 'Qual bolo vamos fazer?', { fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif', fontSize: '48px', color: '#3b2a20', fontStyle: 'bold' }).setOrigin(0.5);

    // dificuldade: 1 estrela (Fácil) ou 2 estrelas (Confeiteiro)
    const marcadores = {} as Record<Dificuldade, Phaser.GameObjects.Graphics>;
    (['facil', 'confeiteiro'] as const).forEach((d, i) => {
      const x = LARGURA / 2 + (i === 0 ? -170 : 170);
      const y = ALTURA - 110;
      const c = this.add.container(x, y);
      const fundo = this.add.graphics();
      const cor = d === 'facil' ? 0x56b4e9 : 0xe69f00;
      fundo.fillStyle(cor, 1);
      fundo.fillRoundedRect(-150, -60, 300, 120, 30);
      const marca = this.add.graphics();
      marcadores[d] = marca;
      const rot = this.add.text(0, 30, d === 'facil' ? 'Fácil' : 'Confeiteiro', { fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif', fontSize: '30px', color: '#ffffff', fontStyle: 'bold', stroke: '#3b2a20', strokeThickness: 5 }).setOrigin(0.5);
      c.add([fundo, marca, rot]);
      for (let k = 0; k <= i; k++) c.add(this.add.image((k - i / 2) * 50, -20, 'estrela').setScale(2).setTint(CORES.destaque));
      c.setSize(300, 120).setInteractive({ useHandCursor: true });
      aoSoltarNoObjeto(c, () => this.escolherDificuldade(d));
    });
    this.marcadores = marcadores;
    this.escolherDificuldade(this.dificuldade);

    const receitas = [...RECEITAS.values()];
    receitas.forEach((r, i) => {
      const x = LARGURA / 2 + (i - (receitas.length - 1) / 2) * 300;
      const y = 300;
      const c = this.add.container(x, y);
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 1);
      g.fillRoundedRect(-130, -150, 260, 300, 28);
      g.lineStyle(5, CORES.mesaBorda, 1);
      g.strokeRoundedRect(-130, -150, 260, 300, 28);
      const cor = corHex(r.corMassa);
      g.fillStyle(0xdfe7ee, 1);
      g.fillEllipse(0, 50, 200, 50);
      g.fillStyle(escurecer(cor, 0.15), 1);
      g.fillRect(-80, -20, 160, 60);
      g.fillEllipse(0, 40, 160, 44);
      g.fillStyle(cor, 1);
      g.fillEllipse(0, -20, 160, 44);
      g.fillStyle(0xd7263d, 1);
      g.fillCircle(0, -36, 14);
      const nome = this.add.text(0, 105, r.nome, { fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif', fontSize: '28px', color: '#3b2a20', fontStyle: 'bold' }).setOrigin(0.5);
      c.add([g, nome]);
      c.setSize(260, 300).setInteractive({ useHandCursor: true });
      c.on('pointerdown', () => c.setScale(0.96));
      c.on('pointerout', () => c.setScale(1));
      aoSoltarNoObjeto(c, () => this.comecar(r.id));
    });

    botaoGrande(this, 110, 60, '⌂', 0x0072b2, () => this.scene.start('Menu'), 120, 80);
  }

  private escolherDificuldade(d: Dificuldade): void {
    if (this.marcadores && d !== this.dificuldade) AudioSystem.get()?.efeito('clique');
    this.dificuldade = d;
    if (!this.marcadores) return;
    for (const [k, g] of Object.entries(this.marcadores)) {
      g.clear();
      if (k === d) {
        g.lineStyle(8, CORES.texto, 1);
        g.strokeRoundedRect(-154, -64, 308, 128, 32);
      }
    }
  }

  private comecar(id: string): void {
    AudioSystem.get()?.efeito('pop');
    const sessao = new Sessao(carregarReceita(id, this.dificuldade));
    sessao.runner.iniciar();
    this.scene.start(sessao.cenaAtual ?? 'Menu', { sessao });
  }
}
