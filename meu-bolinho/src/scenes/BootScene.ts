/** Boot: gera as texturas provisórias (formas geométricas) e segue para o Menu. */
import Phaser from 'phaser';

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
    g.destroy();

    this.scene.start('Menu');
  }
}
