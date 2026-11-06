/** Boot: gera as texturas (arte procedural), inicia o áudio e segue para a Preload. */
import Phaser from 'phaser';
import { gerarArte } from '../art/ArteProcedural';
import { AudioSystem } from '../systems/audio/AudioSystem';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(6, 6, 6);
    g.generateTexture('gota', 12, 12);
    g.clear();

    g.fillStyle(0xffffff, 1);
    const pts: Phaser.Types.Math.Vector2Like[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 12 : 5;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push({ x: 12 + Math.cos(a) * r, y: 12 + Math.sin(a) * r });
    }
    g.fillPoints(pts, true);
    g.generateTexture('estrela', 24, 24);
    g.clear();

    // pincel macio (64 px): círculos concêntricos com alfa crescente para o centro
    for (let r = 32; r > 0; r -= 2) {
      g.fillStyle(0xffffff, 0.12 + 0.88 * (1 - r / 32) ** 0.5 * 0.4 + (r < 22 ? 0.5 : 0));
      g.fillCircle(32, 32, r);
    }
    g.generateTexture('pincel', 64, 64);
    g.destroy();

    gerarArte(this);
    AudioSystem.iniciar(this.game);
    this.scene.start('Preload');
  }
}
