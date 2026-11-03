/**
 * Bolo no prato (cena Confeitar). Cobertura: RenderTexture com máscara na elipse do topo;
 * a % coberta vem da CoverageGrid (DecorStep.cobertura). Enfeites desenhados a partir da
 * Decoracao (modelo puro), em ordem de camada.
 */
import Phaser from 'phaser';
import { BOLO } from '../config/layout';
import type { Retangulo } from '../systems/coverage/CoverageGrid';
import type { Decoracao } from '../systems/decoration/Decoracao';
import { distancia, type Ponto } from '../utils/math';
import { clarear, corAssada, escurecer } from '../utils/desenho';
import { desenharEnfeite } from './Enfeites';


export class CakeView {
  private readonly base: Phaser.GameObjects.Graphics;
  private readonly cobertura: Phaser.GameObjects.RenderTexture;
  private readonly mascara: Phaser.GameObjects.Graphics;
  private readonly enfeites: Phaser.GameObjects.Graphics;
  /** Pincel reaproveitado em todos os carimbos. */
  private readonly pincel: Phaser.GameObjects.Image;

  private readonly corMassa: number;

  constructor(scene: Phaser.Scene, corCobertura: number, corMassaCrua: number) {
    this.corMassa = corAssada(corMassaCrua);
    this.pincel = scene.make.image({ key: 'pincel', add: false }).setTint(corCobertura);
    this.base = scene.add.graphics().setDepth(10);
    this.desenharBase();
    const a = this.areaTopo;
    this.cobertura = scene.add.renderTexture(a.x, a.y, Math.ceil(a.largura), Math.ceil(a.altura)).setOrigin(0, 0).setDepth(11);
    this.mascara = scene.make.graphics({}, false);
    this.mascara.fillStyle(0xffffff, 1);
    this.mascara.fillEllipse(BOLO.cx, BOLO.topoY, BOLO.rx * 2, BOLO.ry * 2);
    this.cobertura.setMask(this.mascara.createGeometryMask());
    this.enfeites = scene.add.graphics().setDepth(12);
  }

  get areaTopo(): Retangulo {
    return { x: BOLO.cx - BOLO.rx, y: BOLO.topoY - BOLO.ry, largura: BOLO.rx * 2, altura: BOLO.ry * 2 };
  }

  /** Retângulo que enquadra prato + bolo + velas (foto do Resultado). */
  get enquadramento(): Retangulo {
    return {
      x: BOLO.cx - BOLO.pratoRx - 10,
      y: BOLO.topoY - BOLO.ry - 80,
      largura: BOLO.pratoRx * 2 + 20,
      altura: BOLO.ry + 80 + BOLO.alturaLateral + BOLO.pratoRy + 30,
    };
  }

  private desenharBase(): void {
    const g = this.base;
    const yBase = BOLO.topoY + BOLO.alturaLateral;
    // prato
    g.fillStyle(0xdfe7ee, 1);
    g.fillEllipse(BOLO.cx, yBase + 14, BOLO.pratoRx * 2, BOLO.pratoRy * 2);
    g.lineStyle(4, 0x8aa1b4, 1);
    g.strokeEllipse(BOLO.cx, yBase + 14, BOLO.pratoRx * 2, BOLO.pratoRy * 2);
    // lateral do bolo
    g.fillStyle(escurecer(this.corMassa, 0.15), 1);
    g.fillEllipse(BOLO.cx, yBase, BOLO.rx * 2, BOLO.ry * 2);
    g.fillRect(BOLO.cx - BOLO.rx, BOLO.topoY, BOLO.rx * 2, BOLO.alturaLateral);
    // topo sem cobertura: miolo dourado com "poros" (fica claramente diferente da cobertura)
    g.fillStyle(this.corMassa, 1);
    g.fillEllipse(BOLO.cx, BOLO.topoY, BOLO.rx * 2, BOLO.ry * 2);
    g.fillStyle(clarear(this.corMassa, 0.3), 1);
    for (let i = 0; i < 40; i++) {
      const a = i * 2.39996;
      const r = Math.sqrt((i + 0.5) / 40);
      g.fillCircle(BOLO.cx + Math.cos(a) * r * BOLO.rx * 0.9, BOLO.topoY + Math.sin(a) * r * BOLO.ry * 0.9, 3);
    }
  }

  /** Carimba a cobertura ao longo do segmento (só visual). */
  pintar(x0: number, y0: number, x1: number, y1: number, raio: number): void {
    const rt = this.cobertura;
    const passo = Math.max(2, raio / 3);
    const n = Math.max(1, Math.ceil(distancia({ x: x0, y: y0 }, { x: x1, y: y1 }) / passo));
    const k = (raio * 2) / 64;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      rt.draw(this.pincel.setPosition(x0 + (x1 - x0) * t - rt.x, y0 + (y1 - y0) * t - rt.y).setScale(k));
    }
  }

  /** Ponto (mundo) dentro do topo do bolo? `margem` < 1 encolhe a elipse. */
  noTopo(p: Ponto, margem = 1): boolean {
    return ((p.x - BOLO.cx) / (BOLO.rx * margem)) ** 2 + ((p.y - BOLO.topoY) / (BOLO.ry * margem)) ** 2 <= 1;
  }

  /** Coordenadas relativas ao centro do topo (as da Decoracao). */
  paraRelativo(p: Ponto): Ponto {
    return { x: p.x - BOLO.cx, y: p.y - BOLO.topoY };
  }

  desenharEnfeites(d: Decoracao): void {
    const g = this.enfeites;
    g.clear();
    for (const e of d.itens) desenharEnfeite(g, { ...e, x: BOLO.cx + e.x, y: BOLO.topoY + e.y });
  }
}
