/**
 * Colher. Usada na correção (retirar excesso, depois casca de ovo) e como "pá" visual do mexer.
 * A posição do GameObject é a cabeça da colher.
 */
import Phaser from 'phaser';
import { assarGraphics } from '../utils/CacheGrafico';
import { CONFIG_ARRASTAR } from '../config/gameplay';
import { ALVO_TOQUE_MIN } from '../config/layout';
import { amortecer, type Ponto } from '../utils/math';

const COR_COLHER = 0xb0b8c0;
const COR_CABO = 0x8a6440;

export class Spoon extends Phaser.GameObjects.Container {
  private readonly carga: Phaser.GameObjects.Ellipse;
  carregada = false;

  constructor(
    scene: Phaser.Scene,
    readonly descanso: Ponto,
    private readonly escala = 1,
  ) {
    super(scene, descanso.x, descanso.y);
    const g = scene.add.graphics();
    g.fillStyle(COR_CABO, 1);
    g.fillRoundedRect(-9, 18, 18, 110, 8);
    g.fillStyle(COR_COLHER, 1);
    g.fillEllipse(0, 0, 58, 44);
    g.lineStyle(3, 0x6b7680, 1);
    g.strokeEllipse(0, 0, 58, 44);
    this.carga = scene.add.ellipse(0, -2, 40, 26, 0xffffff).setVisible(false);
    this.add([g, this.carga]);
    assarGraphics(scene, g, 'colher', { x: -32, y: -26, largura: 64, altura: 158 });
    this.setScale(escala).setDepth(45);
    scene.add.existing(this);
  }

  contem(p: Ponto): boolean {
    if (!this.visible) return false;
    const m = Math.max(ALVO_TOQUE_MIN, 60) * this.escala;
    // cabeça + cabo
    return Math.abs(p.x - this.x) <= m * 0.7 && p.y >= this.y - m * 0.6 && p.y <= this.y + 130 * this.escala;
  }

  seguir(alvo: Ponto, dtMs: number): void {
    const dt = dtMs / 1000;
    this.x = amortecer(this.x, alvo.x, CONFIG_ARRASTAR.lambdaSeguir, dt);
    this.y = amortecer(this.y, alvo.y, CONFIG_ARRASTAR.lambdaSeguir, dt);
  }

  carregar(cor: number): void {
    this.carregada = true;
    this.carga.setFillStyle(cor).setVisible(true);
  }

  descarregar(): void {
    this.carregada = false;
    this.carga.setVisible(false);
  }

  /** Volta ao descanso (cosmético). */
  voltar(): void {
    this.scene.tweens.add({ targets: this, x: this.descanso.x, y: this.descanso.y, duration: 300, ease: 'Sine.Out' });
  }
}
