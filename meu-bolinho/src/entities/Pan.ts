/**
 * Forma redonda vista de cima em perspectiva. Desenha metal, massa crua e bolo assando
 * a partir do estado (EstadoForma) — nada muda sozinho aqui.
 *
 * Camada de manteiga (opcional, só na estação de untar): RenderTexture com máscara elíptica
 * no fundo da forma; o dedo pinta carimbando um pincel macio. A % coberta NÃO vem dos pixels:
 * vem da CoverageGrid (CoverageStep), por desempenho.
 */
import Phaser from 'phaser';
import { FORMA } from '../config/layout';
import type { Retangulo } from '../systems/coverage/CoverageGrid';
import type { EstadoForma } from '../systems/recipe/Sessao';
import { clamp, distancia, type Ponto } from '../utils/math';
import { clarear, corAssada, escurecer, misturarCor } from '../utils/desenho';

const COR_METAL = 0x9aa4ad;
const COR_FUNDO = 0xc4ccd3;
const COR_MANTEIGA = 0xf7dc6f;
/** Massa (xícaras) que cobre todo o fundo. */
const MASSA_CHEIA = 2;

export class PanView {
  private readonly metal: Phaser.GameObjects.Graphics;
  private readonly conteudo: Phaser.GameObjects.Graphics;
  private readonly frente: Phaser.GameObjects.Graphics;
  private manteiga: Phaser.GameObjects.RenderTexture | null = null;
  private mascara: Phaser.GameObjects.Graphics | null = null;
  /** Pincel reaproveitado em todos os carimbos (sem criar objetos por frame). */
  private readonly pincel: Phaser.GameObjects.Image;
  private ultimaChave = '';
  x: number;
  y: number;
  escala: number;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    escala: number,
    private readonly corMassa: number,
    profundidade = 12,
  ) {
    this.x = x;
    this.y = y;
    this.escala = escala;
    this.pincel = scene.make.image({ key: 'pincel', add: false }).setTint(COR_MANTEIGA);
    this.metal = scene.add.graphics().setDepth(profundidade);
    this.conteudo = scene.add.graphics().setDepth(profundidade + 2);
    this.frente = scene.add.graphics().setDepth(profundidade + 3);
    this.desenharMetal();
    this.aplicarTransformacao();
  }

  /** Retângulo (mundo) do fundo da forma — superfície da grade de cobertura. */
  get areaFundo(): Retangulo {
    const rx = FORMA.rxInterno * this.escala;
    const ry = FORMA.ryInterno * this.escala;
    return { x: this.x - rx, y: this.y - ry, largura: rx * 2, altura: ry * 2 };
  }

  /** Cria a camada de manteiga (forma parada no lugar). */
  criarCamadaManteiga(): void {
    const a = this.areaFundo;
    this.manteiga = this.scene.add.renderTexture(a.x, a.y, Math.ceil(a.largura), Math.ceil(a.altura)).setOrigin(0, 0);
    this.manteiga.setDepth(this.metal.depth + 1);
    this.mascara = this.scene.make.graphics({}, false);
    this.mascara.fillStyle(0xffffff, 1);
    this.mascara.fillEllipse(this.x, this.y, a.largura, a.altura);
    this.manteiga.setMask(this.mascara.createGeometryMask());
  }

  /** Carimba o pincel ao longo do segmento (só visual). */
  pintarManteiga(x0: number, y0: number, x1: number, y1: number, raio: number): void {
    const rt = this.manteiga;
    if (!rt) return;
    const passo = Math.max(2, raio / 3);
    const n = Math.max(1, Math.ceil(distancia({ x: x0, y: y0 }, { x: x1, y: y1 }) / passo));
    const tam = 64; // textura 'pincel' tem 64 px
    const k = (raio * 2) / tam;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t - rt.x;
      const y = y0 + (y1 - y0) * t - rt.y;
      rt.draw(this.pincel.setPosition(x, y).setScale(k));
    }
  }

  esconderManteiga(): void {
    this.manteiga?.setVisible(false);
  }

  private desenharMetal(): void {
    const g = this.metal;
    g.clear();
    // parede externa (sombra) + borda
    g.fillStyle(escurecer(COR_METAL, 0.25), 1);
    g.fillEllipse(0, FORMA.parede * 0.5, FORMA.rx * 2, FORMA.ry * 2);
    g.fillRect(-FORMA.rx, 0, FORMA.rx * 2, FORMA.parede * 0.5);
    g.fillStyle(COR_METAL, 1);
    g.fillEllipse(0, 0, FORMA.rx * 2, FORMA.ry * 2);
    g.fillStyle(COR_FUNDO, 1);
    g.fillEllipse(0, 0, FORMA.rxInterno * 2, FORMA.ryInterno * 2);
    const f = this.frente;
    f.clear();
    f.lineStyle(4, escurecer(COR_METAL, 0.45), 1);
    f.strokeEllipse(0, 0, FORMA.rx * 2, FORMA.ry * 2);
    // reflexo na borda interna (segue a elipse, não um círculo)
    f.lineStyle(3, clarear(COR_METAL, 0.4), 1);
    const reflexo: Ponto[] = [];
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI * (1.1 + 0.3 * (i / 12));
      reflexo.push({ x: Math.cos(a) * FORMA.rxInterno, y: Math.sin(a) * FORMA.ryInterno });
    }
    f.strokePoints(reflexo, false);
  }

  private aplicarTransformacao(): void {
    for (const g of [this.metal, this.conteudo, this.frente]) g.setPosition(this.x, this.y).setScale(this.escala);
  }

  /** Move a forma (forno, bancada). A camada de manteiga não acompanha (só existe na estação de untar). */
  posicionar(x: number, y: number, escala = this.escala): void {
    this.x = x;
    this.y = y;
    this.escala = escala;
    this.aplicarTransformacao();
  }

  /** Vira a forma (desenformar): fator 1 → normal, -1 → de cabeça para baixo. */
  virar(fatorY: number): void {
    for (const g of [this.metal, this.conteudo, this.frente]) g.setScale(this.escala, this.escala * fatorY);
  }

  setVisible(v: boolean): void {
    for (const g of [this.metal, this.conteudo, this.frente]) g.setVisible(v);
  }

  setAlpha(a: number): void {
    for (const g of [this.metal, this.conteudo, this.frente]) g.setAlpha(a);
  }

  get objetos(): Phaser.GameObjects.Graphics[] {
    return [this.metal, this.conteudo, this.frente];
  }

  desenhar(e: EstadoForma): void {
    const chave = `${e.massa.toFixed(4)}|${e.assado.toFixed(3)}`;
    if (chave === this.ultimaChave) return;
    this.ultimaChave = chave;
    const g = this.conteudo;
    g.clear();
    if (e.massa <= 1e-4) return;
    const k = clamp(Math.sqrt(e.massa / MASSA_CHEIA), 0, 1);
    const rx = FORMA.rxInterno * (0.25 + 0.75 * k);
    const ry = FORMA.ryInterno * (0.25 + 0.75 * k);
    const subida = e.assado * FORMA.parede * 0.9;
    const cor = misturarCor(this.corMassa, corAssada(this.corMassa), clamp(e.assado * 1.2, 0, 1));
    if (e.assado > 0) {
      // lateral do bolo crescendo acima da borda
      g.fillStyle(escurecer(cor, 0.2), 1);
      g.fillEllipse(0, 0, rx * 2, ry * 2);
      g.fillRect(-rx, -subida, rx * 2, subida);
    }
    g.fillStyle(cor, 1);
    g.fillEllipse(0, -subida, rx * 2, ry * 2);
    g.fillStyle(clarear(cor, 0.25), 0.8);
    g.fillEllipse(-rx * 0.25, -subida - ry * 0.25, rx * 0.8, ry * 0.5);
  }

  /** O ponto está sobre a forma (para pegá-la). */
  contem(p: Ponto): boolean {
    const nx = (p.x - this.x) / (FORMA.rx * this.escala + 12);
    const ny = (p.y - this.y) / (FORMA.ry * this.escala + 30);
    return nx * nx + ny * ny <= 1;
  }

  destruir(): void {
    this.manteiga?.destroy();
    this.mascara?.destroy();
    for (const g of this.objetos) g.destroy();
  }
}
