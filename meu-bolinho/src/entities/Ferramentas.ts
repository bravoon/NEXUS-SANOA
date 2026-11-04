/** Objetos simples arrastáveis: luva, prato, tablete de manteiga, espátula de cobertura. */
import Phaser from 'phaser';
import { assarGraphics } from '../utils/CacheGrafico';
import { CONFIG_ARRASTAR } from '../config/gameplay';
import { ALVO_TOQUE_MIN } from '../config/layout';
import { amortecer, type Ponto } from '../utils/math';

export type TipoFerramenta = 'luva' | 'prato' | 'manteiga' | 'espatula' | 'batedor' | 'saco' | 'camada' | 'peneira' | 'ralador' | 'polvilhador' | 'rolo' | 'cortador' | 'faca';

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
    assarGraphics(scene, this.g, `ferramenta:${tipo}`, { x: -122, y: -114, largura: 244, altura: 216 });
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
      case 'batedor':
        // batedor de arame: ponta (onde bate) em (0,0), cabo para baixo
        g.lineStyle(4, 0x8a96a3, 1);
        for (const w of [44, 28, 12]) g.strokeEllipse(0, -6, w, 64);
        g.fillStyle(0x8a6440, 1);
        g.fillRoundedRect(-9, 22, 18, 70, 8);
        g.fillStyle(0xb0b8c0, 1);
        g.fillRect(-11, 20, 22, 8);
        break;
      case 'saco':
        // saco de confeitar: bico em (0,0)
        g.fillStyle(0xffffff, 1);
        g.lineStyle(3, 0x6b5a4e, 1);
        g.fillTriangle(-6, -4, 6, -4, 0, 8);
        g.fillTriangle(-34, -80, 34, -80, 0, -6);
        g.strokeTriangle(-34, -80, 34, -80, 0, -6);
        g.fillStyle(0xf8bbd0, 1);
        g.fillRect(-34, -96, 68, 18);
        break;
      case 'camada':
        break;
      case 'peneira':
        // aro com tela; cabo para a direita. O monte do ingrediente é desenhado pela cena.
        g.fillStyle(0x8a6440, 1);
        g.fillRoundedRect(66, -9, 54, 18, 8);
        g.fillStyle(0xe9eef2, 0.95);
        g.fillEllipse(0, 0, 150, 56);
        g.lineStyle(1.5, 0x9aa4ad, 0.8);
        for (let k = -60; k <= 60; k += 10) {
          const h = Math.sqrt(Math.max(0, 1 - (k / 75) ** 2)) * 28;
          g.lineBetween(k, -h, k, h);
        }
        for (let k = -20; k <= 20; k += 10) {
          const w = Math.sqrt(Math.max(0, 1 - (k / 28) ** 2)) * 75;
          g.lineBetween(-w, k, w, k);
        }
        g.lineStyle(6, 0x8a96a3, 1);
        g.strokeEllipse(0, 0, 150, 56);
        break;
      case 'ralador':
        // ralador em pé: face com furinhos entre y -95 e 95, alça em cima
        g.fillStyle(0xb7c0c8, 1);
        g.fillRoundedRect(-46, -95, 92, 190, 10);
        g.lineStyle(4, 0x6b7680, 1);
        g.strokeRoundedRect(-46, -95, 92, 190, 10);
        g.fillStyle(0x5d6771, 1);
        for (let l = -80; l <= 80; l += 16) for (let c = -32; c <= 30; c += 16) g.fillRoundedRect(c + ((l / 16) % 2 ? 6 : 0), l, 10, 4, 2);
        g.lineStyle(8, 0x8a6440, 1);
        g.beginPath();
        g.arc(0, -95, 17, Math.PI, 0, false);
        g.strokePath();
        break;
      case 'polvilhador':
        // potinho com tampa furada: os furos (por onde cai) em (0, 30)
        g.fillStyle(0xffffff, 1);
        g.fillRoundedRect(-28, -50, 56, 72, 14);
        g.lineStyle(3, 0x8a96a3, 1);
        g.strokeRoundedRect(-28, -50, 56, 72, 14);
        g.fillStyle(0xb0b8c0, 1);
        g.fillRoundedRect(-30, 16, 60, 18, 6);
        g.fillStyle(0x5d6771, 1);
        for (const dx of [-14, 0, 14]) g.fillCircle(dx, 26, 3);
        break;
      case 'rolo':
        // rolo de massa deitado: cilindro + cabos
        g.fillStyle(0x8a6440, 1);
        g.fillRoundedRect(-112, -9, 30, 18, 8);
        g.fillRoundedRect(82, -9, 30, 18, 8);
        g.fillStyle(0xd9a05b, 1);
        g.fillRoundedRect(-84, -22, 168, 44, 20);
        g.fillStyle(0xe8bf80, 1);
        g.fillRoundedRect(-80, -18, 160, 12, 6);
        g.lineStyle(3, 0x9c6438, 1);
        g.strokeRoundedRect(-84, -22, 168, 44, 20);
        break;
      case 'cortador':
        // cortador redondo (o círculo é o tamanho do biscoito) com alça
        g.lineStyle(8, 0x8a96a3, 1);
        g.strokeEllipse(0, 0, 64, 40);
        g.lineStyle(3, 0x5d6771, 1);
        g.strokeEllipse(0, 0, 72, 46);
        g.fillStyle(0xd55e00, 1);
        g.fillRoundedRect(-10, -52, 20, 36, 8);
        break;
      case 'faca':
        // faca de bolo: a ponta da lâmina em (0,0), cabo para cima-direita
        g.fillStyle(0xd7dde2, 1);
        g.fillTriangle(0, 0, 18, -86, 36, -80);
        g.lineStyle(2, 0x8a96a3, 1);
        g.strokeTriangle(0, 0, 18, -86, 36, -80);
        g.fillStyle(0x8a6440, 1);
        g.fillRoundedRect(16, -112, 22, 32, 8);
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
