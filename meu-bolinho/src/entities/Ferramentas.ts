/** Objetos simples arrastáveis: luva, prato, tablete de manteiga, espátula de cobertura. */
import Phaser from 'phaser';
import { CONFIG_ARRASTAR } from '../config/gameplay';
import { ALVO_TOQUE_MIN } from '../config/layout';
import { amortecer, type Ponto } from '../utils/math';

export type TipoFerramenta = 'luva' | 'prato' | 'manteiga' | 'espatula';

export class Ferramenta extends Phaser.GameObjects.Container {
  readonly g: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    readonly tipo: TipoFerramenta,
    public descanso: Ponto,
    private readonly raioToque = ALVO_TOQUE_MIN,
  ) {
    super(scene, descanso.x, descanso.y);
    this.g = scene.add.graphics();
    this.add(this.g);
    this.desenhar();
    this.setDepth(50);
    scene.add.existing(this);
  }

  private desenhar(): void {
    const g = this.g;
    switch (this.tipo) {
      case 'luva':
        g.fillStyle(0x56b4e9, 1);
        g.fillRoundedRect(-30, -20, 60, 64, 22);
        g.fillRoundedRect(-46, -8, 26, 40, 13); // polegar
        g.fillStyle(0xffffff, 1);
        g.fillRect(-30, 34, 60, 14);
        g.lineStyle(3, 0x0072b2, 1);
        g.strokeRoundedRect(-30, -20, 60, 64, 22);
        for (let i = -16; i <= 16; i += 16) {
          g.fillStyle(0xffffff, 0.8);
          g.fillCircle(i, 6, 4);
        }
        break;
      case 'prato':
        g.fillStyle(0xdfe7ee, 1);
        g.fillEllipse(0, 0, 230, 90);
        g.lineStyle(4, 0x8aa1b4, 1);
        g.strokeEllipse(0, 0, 230, 90);
        g.strokeEllipse(0, 0, 150, 56);
        break;
      case 'manteiga':
        g.fillStyle(0xf7dc6f, 1);
        g.fillRoundedRect(-22, -40, 44, 70, 8);
        g.lineStyle(3, 0xb7950b, 1);
        g.strokeRoundedRect(-22, -40, 44, 70, 8);
        g.fillStyle(0xffffff, 1);
        g.fillRect(-22, -40, 44, 26); // papel
        break;
      case 'espatula':
        g.fillStyle(0x8a6440, 1);
        g.fillRoundedRect(-8, -110, 16, 70, 6);
        g.fillStyle(0xb0b8c0, 1);
        g.fillRoundedRect(-18, -46, 36, 52, 14);
        g.lineStyle(3, 0x6b7680, 1);
        g.strokeRoundedRect(-18, -46, 36, 52, 14);
        break;
    }
  }

  contem(p: Ponto): boolean {
    if (!this.visible) return false;
    const r = this.tipo === 'prato' ? 120 : this.raioToque / 2 + 16;
    return Math.abs(p.x - this.x) <= r && Math.abs(p.y - this.y) <= (this.tipo === 'prato' ? 55 : r);
  }

  seguir(alvo: Ponto, dtMs: number): void {
    const dt = dtMs / 1000;
    this.x = amortecer(this.x, alvo.x, CONFIG_ARRASTAR.lambdaSeguir, dt);
    this.y = amortecer(this.y, alvo.y, CONFIG_ARRASTAR.lambdaSeguir, dt);
  }

  voltar(): void {
    this.scene.tweens.add({ targets: this, x: this.descanso.x, y: this.descanso.y, angle: 0, duration: 320, ease: 'Back.Out' });
  }
}
