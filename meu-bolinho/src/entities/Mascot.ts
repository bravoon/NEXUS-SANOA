/**
 * Mascote cupcake (formas simples) com balão de fala.
 * No Milestone 3 cada fala vira também narração pré-gravada (AudioSystem com fila).
 */
import Phaser from 'phaser';
import { CORES } from '../config/layout';
import type { EventBus, MapaEventos } from '../systems/events/EventBus';

export class Mascot extends Phaser.GameObjects.Container {
  private readonly boca: Phaser.GameObjects.Graphics;
  private readonly balao: Phaser.GameObjects.Container;
  private readonly texto: Phaser.GameObjects.Text;
  private readonly fundoBalao: Phaser.GameObjects.Graphics;
  private esconder: Phaser.Time.TimerEvent | null = null;
  private readonly baseY: number;

  constructor(scene: Phaser.Scene, x: number, y: number, bus: EventBus<MapaEventos>) {
    super(scene, x, y);
    this.baseY = y;
    const g = scene.add.graphics();
    // forminha
    g.fillStyle(0xcc79a7, 1);
    g.fillTriangle(-46, 0, 46, 0, 34, 60);
    g.fillTriangle(-46, 0, 34, 60, -34, 60);
    g.lineStyle(3, 0x8e4f74, 1);
    for (let i = -30; i <= 30; i += 15) g.lineBetween(i, 4, i * 0.75, 58);
    // cobertura
    g.fillStyle(0xfff0f5, 1);
    g.fillCircle(-26, -6, 26);
    g.fillCircle(26, -6, 26);
    g.fillCircle(0, -26, 32);
    g.fillStyle(0xd55e00, 1);
    g.fillCircle(0, -60, 9); // cereja
    // olhos
    g.fillStyle(CORES.texto, 1);
    g.fillCircle(-14, -18, 6);
    g.fillCircle(14, -18, 6);
    this.boca = scene.add.graphics();
    this.add([g, this.boca]);
    this.desenharBoca('feliz');

    this.fundoBalao = scene.add.graphics();
    this.texto = scene.add
      .text(0, 0, '', { fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif', fontSize: '24px', color: '#3b2a20', align: 'center', wordWrap: { width: 300 } })
      .setOrigin(0.5);
    this.balao = scene.add.container(x - 250, y + 120, [this.fundoBalao, this.texto]).setDepth(70).setVisible(false);

    this.setDepth(70);
    scene.add.existing(this);

    const desligar = bus.on('mascote:fala', ({ texto, humor }) => this.falar(texto, humor));
    scene.events.once('shutdown', desligar);
  }

  private desenharBoca(humor: 'feliz' | 'surpreso' | 'neutro'): void {
    const b = this.boca;
    b.clear();
    b.lineStyle(4, CORES.texto, 1);
    if (humor === 'surpreso') {
      b.fillStyle(CORES.texto, 1);
      b.fillCircle(0, -2, 7);
    } else {
      b.beginPath();
      b.arc(0, -8, humor === 'feliz' ? 12 : 8, 0.15 * Math.PI, 0.85 * Math.PI, false);
      b.strokePath();
    }
  }

  /** Esconde o balão (ex.: antes de fotografar o bolo). */
  silenciar(): void {
    this.esconder?.remove();
    this.balao.setVisible(false);
  }

  falar(texto: string, humor: 'feliz' | 'surpreso' | 'neutro' = 'feliz'): void {
    this.desenharBoca(humor);
    this.texto.setText(texto);
    const w = Math.max(160, this.texto.width + 40);
    const h = this.texto.height + 30;
    this.fundoBalao.clear();
    this.fundoBalao.fillStyle(0xffffff, 1);
    this.fundoBalao.lineStyle(3, CORES.mesaBorda, 1);
    this.fundoBalao.fillRoundedRect(-w / 2, -h / 2, w, h, 16);
    this.fundoBalao.strokeRoundedRect(-w / 2, -h / 2, w, h, 16);
    this.fundoBalao.fillTriangle(w / 2 - 30, -h / 2, w / 2 - 6, -h / 2, w / 2 + 30, -h / 2 - 40);
    this.balao.setVisible(true).setAlpha(1);

    this.scene.tweens.killTweensOf(this);
    this.scene.tweens.add({ targets: this, y: { from: this.baseY, to: this.baseY - 14 }, duration: 140, yoyo: true, ease: 'Quad.Out' });
    this.esconder?.remove();
    this.esconder = this.scene.time.delayedCall(4500, () => {
      this.scene.tweens.add({ targets: this.balao, alpha: 0, duration: 300 });
      this.desenharBoca('feliz');
    });
  }
}
