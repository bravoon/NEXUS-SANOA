/** Ovo (formas simples): inteiro, trincado ou aberto (cascas se afastando — cosmético). */
import Phaser from 'phaser';
import { CONFIG_ARRASTAR } from '../config/gameplay';
import { ALVO_TOQUE_MIN, OVO } from '../config/layout';
import { amortecer, type Ponto } from '../utils/math';

export class EggView extends Phaser.GameObjects.Container {
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    readonly descanso: Ponto,
  ) {
    super(scene, descanso.x, descanso.y);
    this.g = scene.add.graphics();
    this.add(this.g);
    this.desenhar('inteiro');
    this.setDepth(35);
    scene.add.existing(this);
  }

  desenhar(estado: 'inteiro' | 'trincado'): void {
    const g = this.g;
    g.clear();
    g.fillStyle(0xfff8e7, 1);
    g.lineStyle(3, 0xc9a66b, 1);
    g.fillEllipse(0, 0, OVO.largura, OVO.altura);
    g.strokeEllipse(0, 0, OVO.largura, OVO.altura);
    if (estado === 'trincado') {
      g.lineStyle(3, 0x6b5a4e, 1);
      g.strokePoints(
        [
          { x: -OVO.largura / 2 + 4, y: -2 },
          { x: -10, y: -10 },
          { x: -2, y: 2 },
          { x: 8, y: -8 },
          { x: 16, y: 2 },
          { x: OVO.largura / 2 - 4, y: -4 },
        ],
        false,
      );
    }
  }

  contem(p: Ponto): boolean {
    const m = Math.max(ALVO_TOQUE_MIN, OVO.altura) / 2 + 6;
    return Math.abs(p.x - this.x) <= m && Math.abs(p.y - this.y) <= m;
  }

  seguir(alvo: Ponto, dtMs: number): void {
    const dt = dtMs / 1000;
    this.x = amortecer(this.x, alvo.x, CONFIG_ARRASTAR.lambdaSeguir, dt);
    this.y = amortecer(this.y, alvo.y, CONFIG_ARRASTAR.lambdaSeguir, dt);
  }

  voltar(): void {
    this.scene.tweens.add({ targets: this, x: this.descanso.x, y: this.descanso.y, angle: 0, duration: 320, ease: 'Back.Out' });
  }

  /** Consequência visual do 2º toque (já contado): cascas se abrem, gema cai. */
  abrir(corGema: number, ySuperficie: number): void {
    const cena = this.scene;
    const x = this.x, y = this.y;
    this.setVisible(false);
    for (const lado of [-1, 1]) {
      const metade = cena.add.graphics({ x, y }).setDepth(36);
      metade.fillStyle(0xfff8e7, 1);
      metade.lineStyle(3, 0xc9a66b, 1);
      metade.slice(0, 0, OVO.largura / 2, lado < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, lado < 0 ? Math.PI * 1.5 : Math.PI * 0.5, false);
      metade.fillPath();
      metade.strokePath();
      cena.tweens.add({ targets: metade, x: x + lado * 50, angle: lado * 35, alpha: 0, duration: 650, onComplete: () => metade.destroy() });
    }
    const gema = cena.add.ellipse(x, y, 30, 26, corGema).setDepth(36);
    cena.tweens.add({ targets: gema, y: ySuperficie, scaleX: 1.4, scaleY: 0.6, duration: 380, ease: 'Quad.In', onComplete: () => gema.destroy() });
  }
}
