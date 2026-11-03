/**
 * Botão de pausa protegido: é preciso SEGURAR 2 s (anel enche enquanto segura;
 * soltou antes → o anel zera). Evita saídas acidentais.
 */
import Phaser from 'phaser';
import { BOTAO_PAUSA, CORES } from '../config/layout';

export class PauseButton extends Phaser.GameObjects.Container {
  private readonly anel: Phaser.GameObjects.Graphics;
  private segurandoDesde: number | null = null;
  private disparou = false;

  constructor(
    scene: Phaser.Scene,
    private readonly aoPausar: () => void,
    opcoes: { x?: number; y?: number; icone?: 'pausa' | 'cadeado' | 'lixeira' } = {},
  ) {
    super(scene, opcoes.x ?? BOTAO_PAUSA.x, opcoes.y ?? BOTAO_PAUSA.y);
    const g = scene.add.graphics();
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(0, 0, BOTAO_PAUSA.raio);
    g.lineStyle(4, CORES.texto, 1);
    g.strokeCircle(0, 0, BOTAO_PAUSA.raio);
    g.fillStyle(CORES.texto, 1);
    if ((opcoes.icone ?? 'pausa') === 'pausa') {
      g.fillRoundedRect(-12, -14, 9, 28, 3);
      g.fillRoundedRect(3, -14, 9, 28, 3);
    } else if (opcoes.icone === 'lixeira') {
      g.fillRoundedRect(-11, -8, 22, 24, 3);
      g.fillRect(-15, -14, 30, 5);
      g.fillRect(-5, -19, 10, 5);
    } else {
      // cadeado (área dos pais)
      g.fillRoundedRect(-13, -4, 26, 20, 4);
      g.lineStyle(5, CORES.texto, 1);
      g.beginPath();
      g.arc(0, -4, 9, Math.PI, 0, false);
      g.strokePath();
    }
    this.anel = scene.add.graphics();
    this.add([g, this.anel]);
    this.setSize(BOTAO_PAUSA.raio * 2, BOTAO_PAUSA.raio * 2).setInteractive({ useHandCursor: true });
    this.setDepth(90);
    this.on('pointerdown', () => {
      this.segurandoDesde = scene.time.now;
      this.disparou = false;
    });
    const soltar = () => {
      this.segurandoDesde = null;
      this.anel.clear();
    };
    this.on('pointerup', soltar);
    this.on('pointerout', soltar);
    scene.events.on('update', this.atualizar, this);
    scene.events.once('shutdown', () => scene.events.off('update', this.atualizar, this));
    scene.add.existing(this);
  }

  private atualizar(): void {
    if (this.segurandoDesde === null || this.disparou) return;
    const p = Math.min(1, (this.scene.time.now - this.segurandoDesde) / BOTAO_PAUSA.segurarMs);
    this.anel.clear();
    this.anel.lineStyle(8, CORES.sucesso, 1);
    this.anel.beginPath();
    this.anel.arc(0, 0, BOTAO_PAUSA.raio + 6, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2, false);
    this.anel.strokePath();
    if (p >= 1) {
      this.disparou = true;
      this.segurandoDesde = null;
      this.anel.clear();
      this.aoPausar();
    }
  }

  /** Área reservada: toques aqui não viram gestos de etapa. */
  contem(x: number, y: number): boolean {
    return Math.hypot(x - this.x, y - this.y) <= BOTAO_PAUSA.raio + 10;
  }
}
