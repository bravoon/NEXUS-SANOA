/**
 * Desempenho: Graphics do Phaser reprocessam TODOS os comandos a cada quadro (medido: 47
 * Graphics na cozinha = ~13 ms de CPU por quadro num servidor; 3–5× isso num celular médio).
 * Aqui a arte vetorial é "assada" em texturas:
 *
 * - `imagemVetorial`: arte ESTÁTICA, desenhada uma vez em canvas 2D (com antialias) e
 *   compartilhada por chave entre cenas. Custo por quadro = 1 sprite.
 * - `CacheGrafico`: arte que MUDA às vezes (massa na tigela, medidor, barras). Redesenhada numa
 *   RenderTexture só quando o conteúdo muda, em 2× (superamostragem: bordas suaves sem MSAA).
 *
 * Coordenadas: quem desenha usa as mesmas coordenadas locais de antes; a `caixa` diz qual
 * retângulo local cabe na textura.
 */
import Phaser from 'phaser';

export interface Caixa {
  x: number;
  y: number;
  largura: number;
  altura: number;
}

type Desenho = (g: Phaser.GameObjects.Graphics) => void;

/** Garante a textura `chave` (desenhada uma vez) e devolve a chave. */
export function texturaVetorial(cena: Phaser.Scene, chave: string, caixa: Caixa, desenhar: Desenho): string {
  if (cena.textures.exists(chave)) return chave;
  // desenha num Graphics à parte e copia os comandos depois do deslocamento: assim um
  // g.clear() dentro do desenho não apaga o translateCanvas (bug real encontrado na forma)
  const g = cena.make.graphics({}, false);
  desenhar(g);
  const t = cena.make.graphics({}, false);
  t.translateCanvas(-caixa.x, -caixa.y);
  t.commandBuffer.push(...g.commandBuffer);
  t.generateTexture(chave, Math.ceil(caixa.largura), Math.ceil(caixa.altura));
  t.destroy();
  g.destroy();
  return chave;
}

/** Imagem de arte estática posicionada para que as coordenadas locais do desenho coincidam. */
export function imagemVetorial(cena: Phaser.Scene, chave: string, caixa: Caixa, desenhar: Desenho, x = 0, y = 0): Phaser.GameObjects.Image {
  texturaVetorial(cena, chave, caixa, desenhar);
  return cena.add.image(x, y, chave).setOrigin(-caixa.x / caixa.largura, -caixa.y / caixa.altura);
}

/** Troca a textura de uma imagem criada por `imagemVetorial` mantendo o alinhamento. */
export function trocarTextura(img: Phaser.GameObjects.Image, cena: Phaser.Scene, chave: string, caixa: Caixa, desenhar: Desenho): void {
  texturaVetorial(cena, chave, caixa, desenhar);
  if (img.texture.key !== chave) img.setTexture(chave).setOrigin(-caixa.x / caixa.largura, -caixa.y / caixa.altura);
}

const SUPERAMOSTRA = 2;

export class CacheGrafico {
  /** Objeto a exibir (adicione a um Container ou ajuste a profundidade). */
  readonly imagem: Phaser.GameObjects.RenderTexture;
  private readonly g: Phaser.GameObjects.Graphics;
  private chave: string | null = null;
  private redesenhos = 0;

  constructor(
    cena: Phaser.Scene,
    private readonly caixa: Caixa,
    adicionarNaCena = true,
  ) {
    const s = SUPERAMOSTRA;
    this.imagem = new Phaser.GameObjects.RenderTexture(cena, caixa.x, caixa.y, Math.ceil(caixa.largura * s), Math.ceil(caixa.altura * s));
    this.imagem.setOrigin(0, 0).setScale(1 / s);
    if (adicionarNaCena) cena.add.existing(this.imagem);
    this.g = cena.make.graphics({}, false);
  }

  /**
   * Redesenha se `chave` mudou (ou sempre, se chave for undefined).
   * Retorna true se redesenhou.
   */
  desenhar(desenho: Desenho, chave?: string): boolean {
    if (chave !== undefined && chave === this.chave) return false;
    this.chave = chave ?? null;
    const s = SUPERAMOSTRA;
    const g = this.g;
    g.clear();
    g.setScale(s);
    desenho(g);
    this.imagem.clear();
    this.imagem.draw(g, -this.caixa.x * s, -this.caixa.y * s);
    this.redesenhos++;
    return true;
  }

  limpar(): void {
    this.chave = null;
    this.imagem.clear();
  }

  /** Quantas vezes foi redesenhado (debug/desempenho). */
  get totalRedesenhos(): number {
    return this.redesenhos;
  }

  destroy(): void {
    this.g.destroy();
    this.imagem.destroy();
  }
}

/**
 * Assa um Graphics JÁ DESENHADO (estático) numa textura compartilhada `chave` e o substitui por
 * uma Image no mesmo lugar (mesmo Container/índice ou mesma posição na lista de exibição).
 * Use chaves estáveis (que dependem só do conteúdo) para reaproveitar entre cenas sem vazar memória.
 */
export function assarGraphics(cena: Phaser.Scene, g: Phaser.GameObjects.Graphics, chave: string, caixa: Caixa): Phaser.GameObjects.Image {
  if (!cena.textures.exists(chave)) {
    const t = cena.make.graphics({}, false);
    t.translateCanvas(-caixa.x, -caixa.y);
    t.commandBuffer.push(...g.commandBuffer);
    t.generateTexture(chave, Math.ceil(caixa.largura), Math.ceil(caixa.altura));
    t.destroy();
  }
  const img = cena.add
    .image(g.x, g.y, chave)
    .setOrigin(-caixa.x / caixa.largura, -caixa.y / caixa.altura)
    .setDepth(g.depth)
    .setAlpha(g.alpha)
    .setVisible(g.visible)
    .setScale(g.scaleX, g.scaleY);
  const pai = g.parentContainer;
  if (pai) {
    const i = pai.getIndex(g);
    pai.addAt(img, i);
    pai.remove(g, true);
  } else {
    cena.children.moveAbove(img, g);
    g.destroy();
  }
  return img;
}
