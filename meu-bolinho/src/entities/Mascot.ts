/**
 * Mascote cupcake "Bolinho": respira (idle), pisca, reage a cada ação e fala (balão).
 * A narração da fala é feita pelo AudioSystem (FeedbackSystem liga o EventBus ao áudio).
 * Todas as animações aqui são cosméticas.
 */
import Phaser from 'phaser';
import { CORES } from '../config/layout';
import type { EventBus, MapaEventos } from '../systems/events/EventBus';
import { escurecer } from '../utils/desenho';

type Humor = 'feliz' | 'surpreso' | 'neutro';

export class Mascot extends Phaser.GameObjects.Container {
  private readonly boneco: Phaser.GameObjects.Container;
  private readonly olhos: Phaser.GameObjects.Container;
  private readonly boca: Phaser.GameObjects.Graphics;
  private readonly balao: Phaser.GameObjects.Container;
  private readonly texto: Phaser.GameObjects.Text;
  private readonly fundoBalao: Phaser.GameObjects.Graphics;
  private esconder: Phaser.Time.TimerEvent | null = null;
  private ultimoTorcer = 0;
  private readonly baseY: number;
  private readonly baseX: number;

  constructor(scene: Phaser.Scene, x: number, y: number, bus: EventBus<MapaEventos>) {
    super(scene, x, y);
    this.baseY = y;
    this.baseX = x;

    const corpo = scene.add.graphics();
    // forminha listrada
    const forma = 0xcc79a7;
    corpo.fillStyle(forma, 1);
    corpo.fillPoints([{ x: -48, y: 0 }, { x: 48, y: 0 }, { x: 36, y: 62 }, { x: -36, y: 62 }], true);
    corpo.fillStyle(escurecer(forma, 0.18), 1);
    for (let i = -36; i <= 30; i += 18) corpo.fillPoints([{ x: i, y: 0 }, { x: i + 9, y: 0 }, { x: (i + 9) * 0.75, y: 62 }, { x: i * 0.75, y: 62 }], true);
    corpo.lineStyle(3, escurecer(forma, 0.4), 1);
    corpo.strokePoints([{ x: -48, y: 0 }, { x: 48, y: 0 }, { x: 36, y: 62 }, { x: -36, y: 62 }], true);
    // cobertura em camadas
    const cob = 0xfff0f5;
    corpo.fillStyle(escurecer(cob, 0.08), 1);
    corpo.fillEllipse(0, 2, 112, 34);
    corpo.fillStyle(cob, 1);
    corpo.fillCircle(-28, -8, 28);
    corpo.fillCircle(28, -8, 28);
    corpo.fillCircle(0, -30, 34);
    corpo.fillStyle(0xffffff, 0.8);
    corpo.fillEllipse(-14, -44, 22, 10);
    // granulado na cobertura
    const cores = [0xe69f00, 0x56b4e9, 0x009e73, 0xd55e00];
    [[-30, -16], [22, -24], [-6, -50], [34, -4], [-40, 2], [10, -6]].forEach(([dx, dy], i) => {
      corpo.lineStyle(4, cores[i % cores.length]!, 1);
      corpo.lineBetween(dx! - 3, dy! - 2, dx! + 3, dy! + 2);
    });
    // cereja
    corpo.lineStyle(3, 0x5c4033, 1);
    corpo.lineBetween(0, -64, 10, -80);
    corpo.fillStyle(0xd7263d, 1);
    corpo.fillCircle(0, -64, 11);
    corpo.fillStyle(0xffffff, 0.7);
    corpo.fillCircle(-4, -68, 3);
    // bochechas
    corpo.fillStyle(0xf48fb1, 0.6);
    corpo.fillEllipse(-30, -6, 16, 9);
    corpo.fillEllipse(30, -6, 16, 9);

    const og = scene.add.graphics();
    for (const lado of [-1, 1]) {
      og.fillStyle(CORES.texto, 1);
      og.fillEllipse(lado * 15, 0, 13, 16);
      og.fillStyle(0xffffff, 1);
      og.fillCircle(lado * 15 - 2, -3, 3);
    }
    this.olhos = scene.add.container(0, -20, [og]);
    this.boca = scene.add.graphics();
    this.boneco = scene.add.container(0, 0, [corpo, this.olhos, this.boca]);
    this.add(this.boneco);
    this.desenharBoca('feliz');

    this.fundoBalao = scene.add.graphics();
    this.texto = scene.add
      .text(0, 0, '', { fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif', fontSize: '24px', color: '#3b2a20', align: 'center', wordWrap: { width: 320 } })
      .setOrigin(0.5);
    this.balao = scene.add.container(x - 260, y + 130, [this.fundoBalao, this.texto]).setDepth(70).setVisible(false);

    this.setDepth(70);
    scene.add.existing(this);

    // idle: respiração + piscadas
    scene.tweens.add({ targets: this.boneco, scaleY: 1.03, scaleX: 0.98, y: -2, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.agendarPiscada();

    const desligar = [
      bus.on('mascote:fala', ({ texto, humor }) => this.falar(texto, humor)),
      bus.on('etapa:progresso', () => this.torcer()),
      bus.on('etapa:concluida', () => this.comemorar()),
      bus.on('etapa:erro', () => this.reagir('surpreso')),
      bus.on('feedback:rejeicao', () => this.reagir('neutro')),
    ];
    scene.events.once('shutdown', () => desligar.forEach((d) => d()));
  }

  private agendarPiscada(): void {
    this.scene.time.delayedCall(2200 + Math.random() * 2800, () => {
      if (!this.scene) return;
      this.scene.tweens.add({ targets: this.olhos, scaleY: 0.1, duration: 70, yoyo: true, onComplete: () => this.agendarPiscada() });
    });
  }

  private desenharBoca(humor: Humor): void {
    const b = this.boca;
    b.clear();
    b.lineStyle(4, CORES.texto, 1);
    if (humor === 'surpreso') {
      b.fillStyle(CORES.texto, 1);
      b.fillEllipse(0, -2, 12, 14);
    } else if (humor === 'feliz') {
      b.fillStyle(0x8e2a3a, 1);
      b.slice(0, -8, 12, 0.1 * Math.PI, 0.9 * Math.PI, false);
      b.fillPath();
    } else {
      b.beginPath();
      b.arc(0, -10, 8, 0.2 * Math.PI, 0.8 * Math.PI, false);
      b.strokePath();
    }
  }

  /** Pulinho de torcida enquanto a criança progride (no máximo a cada 1,6 s). */
  private torcer(): void {
    const agora = this.scene.time.now;
    if (agora - this.ultimoTorcer < 1600) return;
    this.ultimoTorcer = agora;
    this.pular(8, 160);
  }

  private comemorar(): void {
    this.desenharBoca('feliz');
    this.scene.tweens.killTweensOf(this);
    this.y = this.baseY;
    this.scene.tweens.add({ targets: this, y: this.baseY - 26, duration: 180, yoyo: true, repeat: 1, ease: 'Quad.Out' });
    this.scene.tweens.add({ targets: this, angle: { from: -8, to: 8 }, duration: 180, yoyo: true, repeat: 1, onComplete: () => this.setAngle(0) });
  }

  private reagir(humor: Humor): void {
    this.desenharBoca(humor);
    this.scene.tweens.killTweensOf(this);
    this.setPosition(this.baseX, this.baseY);
    if (humor === 'surpreso') this.scene.tweens.add({ targets: this, x: { from: this.baseX - 6, to: this.baseX + 6 }, duration: 60, yoyo: true, repeat: 3, onComplete: () => this.setX(this.baseX) });
    else this.scene.tweens.add({ targets: this, angle: { from: -12, to: 12 }, duration: 140, yoyo: true, repeat: 1, onComplete: () => this.setAngle(0) });
  }

  private pular(altura: number, duracao: number): void {
    this.scene.tweens.killTweensOf(this);
    this.y = this.baseY;
    this.scene.tweens.add({ targets: this, y: this.baseY - altura, duration: duracao, yoyo: true, ease: 'Quad.Out' });
  }

  /** Esconde o balão (ex.: antes de fotografar o bolo). */
  silenciar(): void {
    this.esconder?.remove();
    this.balao.setVisible(false);
  }

  falar(texto: string, humor: Humor = 'feliz'): void {
    this.desenharBoca(humor);
    this.texto.setText(texto);
    const w = Math.max(160, this.texto.width + 40);
    const h = this.texto.height + 30;
    this.fundoBalao.clear();
    this.fundoBalao.fillStyle(0x3b2a20, 0.12);
    this.fundoBalao.fillRoundedRect(-w / 2 + 4, -h / 2 + 6, w, h, 18);
    this.fundoBalao.fillStyle(0xffffff, 1);
    this.fundoBalao.lineStyle(3, CORES.mesaBorda, 1);
    this.fundoBalao.fillRoundedRect(-w / 2, -h / 2, w, h, 18);
    this.fundoBalao.strokeRoundedRect(-w / 2, -h / 2, w, h, 18);
    this.fundoBalao.fillTriangle(w / 2 - 34, -h / 2 + 1, w / 2 - 8, -h / 2 + 1, w / 2 + 34, -h / 2 - 44);
    this.balao.setVisible(true).setAlpha(1).setScale(0.85);
    this.scene.tweens.add({ targets: this.balao, scale: 1, duration: 160, ease: 'Back.Out' });

    if (humor === 'feliz') this.pular(14, 140);
    this.esconder?.remove();
    this.esconder = this.scene.time.delayedCall(Math.max(4500, texto.length * 90), () => {
      this.scene.tweens.add({ targets: this.balao, alpha: 0, duration: 300 });
      this.desenharBoca('feliz');
    });
  }
}
