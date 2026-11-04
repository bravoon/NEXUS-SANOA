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
import { mascaraElipse, type Mascara, type Retangulo } from '../systems/coverage/CoverageGrid';
import { RAIO_BISCOITO } from '../systems/produto/Produto';
import type { Produto } from '../systems/recipe/recipeTypes';
import type { EstadoForma } from '../systems/recipe/Sessao';
import { clamp, distancia, type Ponto } from '../utils/math';
import { clarear, corAssada, escurecer, misturarCor } from '../utils/desenho';
import { CacheGrafico, imagemVetorial, type Caixa } from '../utils/CacheGrafico';

/** Retângulo local da forma (metal + bolo crescendo acima da borda). */
const CAIXA_FORMA: Caixa = { x: -FORMA.rx - 6, y: -FORMA.ry - FORMA.parede - 8, largura: FORMA.rx * 2 + 12, altura: FORMA.ry * 2 + FORMA.parede * 1.6 + 16 };

const COR_METAL = 0x9aa4ad;
const COR_FUNDO = 0xc4ccd3;
const COR_MANTEIGA = 0xf7dc6f;
/** Forminhas da assadeira de cupcakes (local). */
const CUPS: readonly Ponto[] = [-1, 0, 1].flatMap((i) => [-1, 1].map((j) => ({ x: i * 105, y: j * 46 })));
/** Massa (xícaras) que cobre todo o fundo. */
const MASSA_CHEIA = 2;

export class PanView {
  private readonly metal: Phaser.GameObjects.Image;
  private readonly conteudo: CacheGrafico;
  private readonly frente: Phaser.GameObjects.Image;
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
    readonly produto: Produto = 'bolo',
  ) {
    this.x = x;
    this.y = y;
    this.escala = escala;
    this.pincel = scene.make.image({ key: 'pincel', add: false }).setTint(COR_MANTEIGA);
    // metal e borda: texturas estáticas; massa/bolo: cache redesenhado só quando o estado muda
    this.metal = imagemVetorial(scene, `forma:metal:${produto}`, CAIXA_FORMA, (g) => this.desenharMetal(g)).setDepth(profundidade);
    this.conteudo = new CacheGrafico(scene, CAIXA_FORMA);
    this.conteudo.imagem.setOrigin(-CAIXA_FORMA.x / CAIXA_FORMA.largura, -CAIXA_FORMA.y / CAIXA_FORMA.altura).setDepth(profundidade + 2);
    this.frente = imagemVetorial(scene, `forma:frente:${produto}`, CAIXA_FORMA, (g) => this.desenharFrente(g)).setDepth(profundidade + 3);
    this.aplicarTransformacao();
  }

  /** Retângulo (mundo) do fundo da forma — superfície da grade de cobertura. */
  get areaFundo(): Retangulo {
    const rx = FORMA.rxInterno * this.escala;
    const ry = FORMA.ryInterno * this.escala;
    return { x: this.x - rx, y: this.y - ry, largura: rx * 2, altura: ry * 2 };
  }

  /** Máscara do fundo (untar): elipse na forma redonda, retângulo na de brownie. */
  get mascaraFundo(): Mascara {
    const a = this.areaFundo;
    if (this.produto === 'brownie') return (x, y) => x >= a.x && x <= a.x + a.largura && y >= a.y && y <= a.y + a.altura;
    return mascaraElipse(a);
  }

  /** Ponto (mundo) → coordenadas no disco da massa aberta (|p| ≤ 1 = dentro). */
  normalizar(p: Ponto): Ponto {
    return { x: (p.x - this.x) / (FORMA.rxInterno * this.escala), y: (p.y - this.y) / (FORMA.ryInterno * this.escala) };
  }

  /** Cria a camada de manteiga (forma parada no lugar). */
  criarCamadaManteiga(): void {
    const a = this.areaFundo;
    this.manteiga = this.scene.add.renderTexture(a.x, a.y, Math.ceil(a.largura), Math.ceil(a.altura)).setOrigin(0, 0);
    this.manteiga.setDepth(this.metal.depth + 1);
    this.mascara = this.scene.make.graphics({}, false);
    this.mascara.fillStyle(0xffffff, 1);
    if (this.produto === 'brownie') this.mascara.fillRect(a.x, a.y, a.largura, a.altura);
    else this.mascara.fillEllipse(this.x, this.y, a.largura, a.altura);
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

  private desenharMetal(g: Phaser.GameObjects.Graphics): void {
    const R = FORMA.rx, Ry = FORMA.ry, P = FORMA.parede;
    switch (this.produto) {
      case 'torta':
        // forma de torta: baixa, com borda ondulada
        g.fillStyle(escurecer(COR_METAL, 0.25), 1);
        g.fillEllipse(0, P * 0.3, R * 2, Ry * 2);
        g.fillStyle(COR_METAL, 1);
        for (let i = 0; i < 32; i++) {
          const a = (i / 32) * Math.PI * 2;
          g.fillCircle(Math.cos(a) * (R - 8), Math.sin(a) * (Ry - 6), 12);
        }
        g.fillEllipse(0, 0, R * 2 - 10, Ry * 2 - 8);
        g.fillStyle(COR_FUNDO, 1);
        g.fillEllipse(0, 0, FORMA.rxInterno * 2, FORMA.ryInterno * 2);
        return;
      case 'biscoito':
        // assadeira lisa (retângulo arredondado, quase sem parede)
        g.fillStyle(escurecer(COR_METAL, 0.3), 1);
        g.fillRoundedRect(-R, -Ry + 10, R * 2, Ry * 2, 18);
        g.fillStyle(COR_METAL, 1);
        g.fillRoundedRect(-R, -Ry, R * 2, Ry * 2, 18);
        g.fillStyle(COR_FUNDO, 1);
        g.fillRoundedRect(-R + 10, -Ry + 8, R * 2 - 20, Ry * 2 - 16, 12);
        return;
      case 'brownie':
        g.fillStyle(escurecer(COR_METAL, 0.25), 1);
        g.fillRoundedRect(-R, -Ry + P * 0.5, R * 2, Ry * 2, 12);
        g.fillStyle(COR_METAL, 1);
        g.fillRoundedRect(-R, -Ry, R * 2, Ry * 2, 12);
        g.fillStyle(COR_FUNDO, 1);
        g.fillRect(-FORMA.rxInterno, -FORMA.ryInterno, FORMA.rxInterno * 2, FORMA.ryInterno * 2);
        return;
      case 'cupcake':
        g.fillStyle(escurecer(COR_METAL, 0.25), 1);
        g.fillRoundedRect(-R, -Ry + 14, R * 2, Ry * 2, 18);
        g.fillStyle(COR_METAL, 1);
        g.fillRoundedRect(-R, -Ry, R * 2, Ry * 2, 18);
        for (const c of CUPS) {
          g.fillStyle(0xf4a6c0, 1); // forminha de papel
          g.fillEllipse(c.x, c.y, 82, 46);
          g.fillStyle(escurecer(0xf4a6c0, 0.2), 1);
          g.fillEllipse(c.x, c.y + 4, 64, 32);
        }
        return;
      case 'bolo':
        break;
    }
    // parede externa (sombra) + borda
    g.fillStyle(escurecer(COR_METAL, 0.25), 1);
    g.fillEllipse(0, FORMA.parede * 0.5, FORMA.rx * 2, FORMA.ry * 2);
    g.fillRect(-FORMA.rx, 0, FORMA.rx * 2, FORMA.parede * 0.5);
    g.fillStyle(COR_METAL, 1);
    g.fillEllipse(0, 0, FORMA.rx * 2, FORMA.ry * 2);
    g.fillStyle(COR_FUNDO, 1);
    g.fillEllipse(0, 0, FORMA.rxInterno * 2, FORMA.ryInterno * 2);
  }

  private desenharFrente(f: Phaser.GameObjects.Graphics): void {
    if (this.produto === 'biscoito' || this.produto === 'cupcake' || this.produto === 'brownie') {
      f.lineStyle(4, escurecer(COR_METAL, 0.45), 1);
      f.strokeRoundedRect(-FORMA.rx, -FORMA.ry, FORMA.rx * 2, FORMA.ry * 2, this.produto === 'brownie' ? 12 : 18);
      return;
    }
    if (this.produto === 'torta') {
      f.lineStyle(3, escurecer(COR_METAL, 0.4), 1);
      f.strokeEllipse(0, 0, FORMA.rxInterno * 2, FORMA.ryInterno * 2);
      return;
    }
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

  /** Objetos exibidos e a escala-base de cada um (o cache é desenhado em 2×). */
  private get partes(): Array<[Phaser.GameObjects.Image | Phaser.GameObjects.RenderTexture, number]> {
    return [[this.metal, 1], [this.conteudo.imagem, 0.5], [this.frente, 1]];
  }

  private aplicarTransformacao(): void {
    for (const [o, base] of this.partes) o.setPosition(this.x, this.y).setScale(this.escala * base);
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
    for (const [o, base] of this.partes) o.setScale(this.escala * base, this.escala * base * fatorY);
  }

  setVisible(v: boolean): void {
    for (const [o] of this.partes) o.setVisible(v);
  }

  setAlpha(a: number): void {
    for (const [o] of this.partes) o.setAlpha(a);
  }

  get objetos(): Array<Phaser.GameObjects.Image | Phaser.GameObjects.RenderTexture> {
    return this.partes.map(([o]) => o);
  }

  desenhar(e: EstadoForma): void {
    const chave = `${e.massa.toFixed(4)}|${e.assado.toFixed(3)}|${e.aberta.toFixed(3)}|${e.biscoitos.length}|${e.sobraRetirada}`;
    if (chave === this.ultimaChave) return;
    this.ultimaChave = chave;
    this.conteudo.desenhar((g) => this.pintarConteudo(g, e));
  }

  private pintarConteudo(g: Phaser.GameObjects.Graphics, e: EstadoForma): void {
    if (e.massa <= 1e-4) return;
    if (this.produto !== 'bolo') {
      this.pintarProduto(g, e);
      return;
    }
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

  private pintarProduto(g: Phaser.GameObjects.Graphics, e: EstadoForma): void {
    const cor = misturarCor(this.corMassa, corAssada(this.corMassa), clamp(e.assado * 1.2, 0, 1));
    const rI = FORMA.rxInterno, ryI = FORMA.ryInterno;
    const subida = e.assado;
    switch (this.produto) {
      case 'torta':
      case 'biscoito': {
        if (!e.sobraRetirada) {
          if (e.aberta <= 0) {
            // bola de massa recém-colocada
            g.fillStyle(escurecer(cor, 0.15), 1);
            g.fillEllipse(0, 10, 110, 56);
            g.fillStyle(cor, 1);
            g.fillCircle(0, -4, 46);
            g.fillStyle(clarear(cor, 0.3), 0.8);
            g.fillEllipse(-14, -20, 34, 18);
          } else {
            const k = 0.3 + 0.7 * e.aberta;
            g.fillStyle(escurecer(cor, 0.12), 1);
            g.fillEllipse(0, 4 * (1 - e.aberta) + 3, rI * 2 * k, ryI * 2 * k);
            g.fillStyle(cor, 1);
            g.fillEllipse(0, 0, rI * 2 * k, ryI * 2 * k);
            if (this.produto === 'torta' && e.aberta >= 1) {
              // borda da torta (casca) levemente mais escura
              g.lineStyle(12, escurecer(cor, 0.1 + 0.15 * subida), 1);
              g.strokeEllipse(0, 0, rI * 2 - 10, ryI * 2 - 8);
            }
          }
        }
        // biscoitos: furos do cortador na massa; depois, só os biscoitos
        for (const b of e.biscoitos) {
          const x = b.x * rI, y = b.y * ryI, rx = RAIO_BISCOITO * rI, ry = RAIO_BISCOITO * ryI;
          if (e.sobraRetirada) {
            g.fillStyle(escurecer(cor, 0.2), 1);
            g.fillEllipse(x, y + 4, rx * 2, ry * 2);
            g.fillStyle(cor, 1);
            g.fillEllipse(x, y, rx * 2, ry * 2);
          } else {
            g.lineStyle(3, escurecer(cor, 0.35), 1);
            g.strokeEllipse(x, y, rx * 2, ry * 2);
          }
        }
        return;
      }
      case 'brownie': {
        const k = clamp(Math.sqrt(e.massa / MASSA_CHEIA), 0, 1);
        const w = rI * (0.3 + 0.7 * k), h = ryI * (0.3 + 0.7 * k);
        const s = subida * FORMA.parede * 0.4;
        if (subida > 0) {
          g.fillStyle(escurecer(cor, 0.2), 1);
          g.fillRect(-w, -h, w * 2, h * 2);
        }
        g.fillStyle(cor, 1);
        g.fillRoundedRect(-w, -h - s, w * 2, h * 2, 8);
        return;
      }
      case 'cupcake': {
        const k = clamp(Math.sqrt(e.massa / MASSA_CHEIA), 0, 1);
        for (const c of CUPS) {
          const rx = 32 * (0.4 + 0.6 * k), ry = 16 * (0.4 + 0.6 * k);
          const s = subida * 18;
          g.fillStyle(escurecer(cor, 0.2), 1);
          g.fillEllipse(c.x, c.y + 4, rx * 2, ry * 2);
          g.fillStyle(cor, 1);
          g.fillEllipse(c.x, c.y + 2 - s, (rx + s * 0.6) * 2, (ry + s * 0.5) * 2);
        }
        return;
      }
      case 'bolo':
        return;
    }
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
