/**
 * Forno: corpo, porta com vidro (aberta/fechada), botão do timer e luz.
 * O estado vem do OvenStep; aqui só se desenha.
 */
import Phaser from 'phaser';
import { CORES, FORNO } from '../config/layout';
import type { Ponto } from '../utils/math';
import { CacheGrafico, imagemVetorial, type Caixa } from '../utils/CacheGrafico';

const CAIXA_CORPO: Caixa = { x: FORNO.x - 10, y: FORNO.y - 10, largura: FORNO.largura + 20, altura: FORNO.altura + 40 };
const CAIXA_PORTA: Caixa = { x: FORNO.porta.x - 14, y: FORNO.porta.y - 14, largura: FORNO.porta.largura + 28, altura: FORNO.porta.altura + 80 };
const CAIXA_PAINEL: Caixa = { x: FORNO.luz.x - 80, y: FORNO.luz.y - 30, largura: 160, altura: FORNO.botao.y + FORNO.botao.raio + 40 - (FORNO.luz.y - 30) };

export class OvenView {
  private readonly porta: CacheGrafico;
  private readonly painel: CacheGrafico;
  private aberta = true;
  private chavePorta = '';
  private chavePainel = '';

  constructor(private readonly scene: Phaser.Scene) {
    // corpo: textura estática; porta e painel: caches redesenhados só quando o estado muda
    imagemVetorial(scene, 'forno:corpo', CAIXA_CORPO, (g) => this.desenharCorpo(g)).setPosition(0, 0).setDepth(5);
    this.porta = new CacheGrafico(scene, CAIXA_PORTA);
    this.porta.imagem.setDepth(20);
    this.painel = new CacheGrafico(scene, CAIXA_PAINEL);
    this.painel.imagem.setDepth(21);
    this.desenharPorta(true, false, 0);
    this.desenharPainel(0, false, false, 0);
  }

  private desenharCorpo(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(0xe4572e, 1);
    g.fillRoundedRect(FORNO.x, FORNO.y, FORNO.largura, FORNO.altura, 26);
    g.lineStyle(6, 0x8f2d14, 1);
    g.strokeRoundedRect(FORNO.x, FORNO.y, FORNO.largura, FORNO.altura, 26);
    // cavidade
    const p = FORNO.porta;
    g.fillStyle(0x3b2a20, 1);
    g.fillRoundedRect(p.x, p.y, p.largura, p.altura, 14);
    g.fillStyle(0x5c4033, 1);
    g.fillRect(p.x + 20, p.y + p.altura - 90, p.largura - 40, 8); // grade
    // pés
    g.fillStyle(0x8f2d14, 1);
    g.fillRect(FORNO.x + 30, FORNO.y + FORNO.altura, 40, 20);
    g.fillRect(FORNO.x + FORNO.largura - 70, FORNO.y + FORNO.altura, 40, 20);
  }

  /** @param brilho 0..1 luz interna (assando) */
  desenharPorta(aberta: boolean, ligado: boolean, brilho: number): void {
    // brilho quantizado em 8 níveis: a luz pulsa sem redesenhar a cada quadro
    const nivel = ligado ? Math.round(brilho * 8) / 8 : 0;
    const chave = `${aberta}|${ligado}|${nivel}`;
    if (chave === this.chavePorta) return;
    this.chavePorta = chave;
    this.aberta = aberta;
    this.porta.desenhar((g) => this.pintarPorta(g, aberta, ligado, nivel));
  }

  private pintarPorta(g: Phaser.GameObjects.Graphics, aberta: boolean, ligado: boolean, brilho: number): void {
    const p = FORNO.porta;
    if (aberta) {
      // porta caída para baixo (aberta), vista de frente como uma faixa
      g.fillStyle(0xc8471f, 1);
      g.fillRoundedRect(p.x - 10, p.y + p.altura + 4, p.largura + 20, 40, 10);
      g.fillStyle(0xf2f2f2, 1);
      g.fillRoundedRect(p.x + p.largura / 2 - 60, p.y + p.altura + 16, 120, 14, 7);
      return;
    }
    // moldura em 4 peças: o vidro no meio fica translúcido e deixa ver o bolo crescendo
    g.fillStyle(0xc8471f, 1);
    g.fillRect(p.x - 10, p.y - 10, p.largura + 20, 40);
    g.fillRect(p.x - 10, p.y + p.altura - 60, p.largura + 20, 70);
    g.fillRect(p.x - 10, p.y - 10, 40, p.altura + 20);
    g.fillRect(p.x + p.largura - 30, p.y - 10, 40, p.altura + 20);
    g.fillStyle(ligado ? 0xffb347 : 0x9fc5e8, ligado ? 0.2 + 0.2 * brilho : 0.25);
    g.fillRoundedRect(p.x + 30, p.y + 30, p.largura - 60, p.altura - 90, 12);
    g.lineStyle(5, 0x8f2d14, 1);
    g.strokeRoundedRect(p.x + 30, p.y + 30, p.largura - 60, p.altura - 90, 12);
    // puxador
    g.fillStyle(0xf2f2f2, 1);
    g.fillRoundedRect(p.x + p.largura / 2 - 80, p.y + p.altura - 40, 160, 18, 9);
  }

  /** "Recorta" o vidro: a porta fechada precisa deixar o bolo visível, então a porta fica atrás do vidro desenhado. */
  get portaAberta(): boolean {
    return this.aberta;
  }

  /**
   * @param voltas 0..1 posição do botão
   * @param ligado forno ligado (luz acesa)
   * @param apito piscando (bolo pronto)
   * @param restante 0..1 tempo restante (arco do timer)
   */
  desenharPainel(voltas: number, ligado: boolean, apito: boolean, restante: number): void {
    const chave = `${voltas.toFixed(3)}|${ligado}|${apito}|${restante.toFixed(2)}`;
    if (chave === this.chavePainel) return;
    this.chavePainel = chave;
    this.painel.desenhar((g) => this.pintarPainel(g, voltas, ligado, apito, Math.round(restante * 100) / 100));
  }

  private pintarPainel(g: Phaser.GameObjects.Graphics, voltas: number, ligado: boolean, apito: boolean, restante: number): void {
    const b = FORNO.botao;
    // luz
    g.fillStyle(apito ? CORES.destaque : ligado ? 0xff7a00 : 0x5c4033, 1);
    g.fillCircle(FORNO.luz.x, FORNO.luz.y, 18);
    g.lineStyle(4, 0x3b2a20, 1);
    g.strokeCircle(FORNO.luz.x, FORNO.luz.y, 18);
    // escala do timer
    g.lineStyle(8, 0xf2d0a4, 1);
    g.strokeCircle(b.x, b.y, b.raio + 14);
    if (restante > 0) {
      g.lineStyle(8, CORES.sucesso, 1);
      g.beginPath();
      g.arc(b.x, b.y, b.raio + 14, -Math.PI / 2, -Math.PI / 2 + restante * Math.PI * 2, false);
      g.strokePath();
    } else if (voltas > 0) {
      g.lineStyle(8, CORES.pendente, 1);
      g.beginPath();
      g.arc(b.x, b.y, b.raio + 14, -Math.PI / 2, -Math.PI / 2 + voltas * Math.PI * 2, false);
      g.strokePath();
    }
    // botão
    g.fillStyle(0xf2f2f2, 1);
    g.fillCircle(b.x, b.y, b.raio);
    g.lineStyle(5, 0x3b2a20, 1);
    g.strokeCircle(b.x, b.y, b.raio);
    const a = -Math.PI / 2 + voltas * Math.PI * 2;
    g.lineStyle(10, 0x3b2a20, 1);
    g.lineBetween(b.x, b.y, b.x + Math.cos(a) * (b.raio - 10), b.y + Math.sin(a) * (b.raio - 10));
  }

  pontoNaPorta(p: Ponto): boolean {
    const r = FORNO.porta;
    // porta aberta fica como faixa embaixo; fechada ocupa toda a frente
    if (this.aberta) return p.x >= r.x - 10 && p.x <= r.x + r.largura + 10 && p.y >= r.y + r.altura - 10 && p.y <= r.y + r.altura + 70;
    return p.x >= r.x - 10 && p.x <= r.x + r.largura + 10 && p.y >= r.y - 10 && p.y <= r.y + r.altura + 10;
  }

  pontoNaCavidade(p: Ponto): boolean {
    const r = FORNO.porta;
    return p.x >= r.x && p.x <= r.x + r.largura && p.y >= r.y && p.y <= r.y + r.altura;
  }

  pontoNoBotao(p: Ponto): boolean {
    return Math.hypot(p.x - FORNO.botao.x, p.y - FORNO.botao.y) <= FORNO.botao.raioGesto;
  }

  /** Espaço normalizado do botão para o acumulador angular (raio 100 = raioGesto). */
  normalizarBotao(p: Ponto): Ponto {
    const b = FORNO.botao;
    return { x: ((p.x - b.x) / b.raioGesto) * 100, y: ((p.y - b.y) / b.raioGesto) * 100 };
  }

  get profundidadePorta(): number {
    return this.porta.imagem.depth;
  }

  sacudir(): void {
    const img = this.painel.imagem;
    const x0 = CAIXA_PAINEL.x;
    this.scene.tweens.add({ targets: img, x: { from: x0 - 4, to: x0 + 4 }, duration: 60, yoyo: true, repeat: 5, onComplete: () => img.setX(x0) });
  }
}
