/**
 * Bolo no prato (cena Confeitar).
 *
 * - Bolo inteiro: base (prato + lateral + miolo) como textura estática.
 * - Bolo em camadas (etapa "rechear"): camada de baixo + recheio (RenderTexture com máscara;
 *   a % vem da CoverageGrid) + camada de cima, que a criança arrasta e solta. O topo do bolo
 *   passa a ser ONDE ela soltou (sem encaixe automático): cobertura, glacê e enfeites seguem.
 * - Cobertura e glacê: RenderTextures com máscara na elipse do topo (pinceladas só visuais;
 *   a % coberta/traçada vem dos controladores puros).
 * - Enfeites: redesenhados (CacheGrafico) só quando a Decoracao muda.
 */
import Phaser from 'phaser';
import { BOLO } from '../config/layout';
import type { Retangulo } from '../systems/coverage/CoverageGrid';
import type { Decoracao } from '../systems/decoration/Decoracao';
import { distancia, type Ponto } from '../utils/math';
import { clarear, corAssada, escurecer } from '../utils/desenho';
import { desenharEnfeite } from './Enfeites';
import { CacheGrafico, imagemVetorial, type Caixa } from '../utils/CacheGrafico';

/** Prato + bolo + velas (mundo), com folga para a camada de cima fora do centro. */
const CAIXA_BOLO: Caixa = {
  x: BOLO.cx - BOLO.pratoRx - 50,
  y: BOLO.topoY - BOLO.ry - 100,
  largura: BOLO.pratoRx * 2 + 100,
  altura: BOLO.ry + 100 + BOLO.alturaLateral + BOLO.pratoRy + 50,
};
const MEIA = BOLO.alturaLateral / 2;
/** Topo da camada de baixo (bolo em camadas). */
const Y_INFERIOR = BOLO.topoY + MEIA;
/** Onde a camada de cima espera, pequena, ao lado do bolo. */
export const DESCANSO_CAMADA = { x: 1060, y: 470, escala: 0.5 } as const;

export interface OpcoesBolo {
  camadas: boolean;
  corRecheio?: number;
}

export class CakeView {
  private readonly corMassa: number;
  private readonly pincelCobertura: Phaser.GameObjects.Image;
  private readonly pincelGlace: Phaser.GameObjects.Image;
  private readonly pincelRecheio: Phaser.GameObjects.Image;
  private readonly enfeites: CacheGrafico;
  private readonly guia: CacheGrafico;
  private cobertura: Phaser.GameObjects.RenderTexture | null = null;
  private glace: Phaser.GameObjects.RenderTexture | null = null;
  private polvilho: Phaser.GameObjects.RenderTexture | null = null;
  private readonly pincelPolvilho: Phaser.GameObjects.Image;
  private recheio: Phaser.GameObjects.RenderTexture | null = null;
  private readonly mascaras: Phaser.GameObjects.Graphics[] = [];
  /** Camada de cima (só no bolo em camadas). */
  readonly camadaSuperior: Phaser.GameObjects.Image | null = null;
  private faixaRecheio: Phaser.GameObjects.Image | null = null;
  /** Centro do topo do bolo (muda se a camada de cima foi assentada fora do centro). */
  private topoAtual: Ponto = { x: BOLO.cx, y: BOLO.topoY };

  constructor(
    private readonly scene: Phaser.Scene,
    corCobertura: number,
    corMassaCrua: number,
    private readonly opcoes: OpcoesBolo = { camadas: false },
  ) {
    this.corMassa = corAssada(corMassaCrua);
    this.pincelCobertura = scene.make.image({ key: 'pincel', add: false }).setTint(corCobertura);
    this.pincelGlace = scene.make.image({ key: 'pincel', add: false }).setTint(0xffffff);
    this.pincelPolvilho = scene.make.image({ key: 'pincel', add: false }).setTint(0xffffff);
    this.pincelRecheio = scene.make.image({ key: 'pincel', add: false }).setTint(opcoes.corRecheio ?? 0xe57373);

    if (opcoes.camadas) {
      imagemVetorial(scene, `bolo:inferior:${this.corMassa}`, CAIXA_BOLO, (g) => this.desenharBase(g, Y_INFERIOR)).setDepth(10);
      const caixaCamada: Caixa = { x: -BOLO.rx - 4, y: -BOLO.ry - 4, largura: BOLO.rx * 2 + 8, altura: BOLO.ry * 2 + MEIA + 8 };
      this.camadaSuperior = imagemVetorial(scene, `bolo:superior:${this.corMassa}`, caixaCamada, (g) => this.desenharCamada(g))
        .setPosition(DESCANSO_CAMADA.x, DESCANSO_CAMADA.y)
        .setScale(DESCANSO_CAMADA.escala)
        .setDepth(13);
    } else {
      imagemVetorial(scene, `bolo:base:${this.corMassa}`, CAIXA_BOLO, (g) => this.desenharBase(g, BOLO.topoY)).setDepth(10);
    }
    this.enfeites = new CacheGrafico(scene, CAIXA_BOLO);
    this.enfeites.imagem.setDepth(16);
    this.guia = new CacheGrafico(scene, CAIXA_BOLO);
    this.guia.imagem.setDepth(15);
  }

  // ---------------------------------------------------------------- geometria

  get topo(): Ponto {
    return this.topoAtual;
  }

  get areaTopo(): Retangulo {
    return { x: this.topoAtual.x - BOLO.rx, y: this.topoAtual.y - BOLO.ry, largura: BOLO.rx * 2, altura: BOLO.ry * 2 };
  }

  /** Superfície da camada de baixo (onde vai o recheio). */
  get areaRecheio(): Retangulo {
    return { x: BOLO.cx - BOLO.rx, y: Y_INFERIOR - BOLO.ry, largura: BOLO.rx * 2, altura: BOLO.ry * 2 };
  }

  /** Retângulo que enquadra prato + bolo + velas (foto do Resultado). */
  get enquadramento(): Retangulo {
    return {
      x: BOLO.cx - BOLO.pratoRx - 30,
      y: BOLO.topoY - BOLO.ry - 80,
      largura: BOLO.pratoRx * 2 + 60,
      altura: BOLO.ry + 80 + BOLO.alturaLateral + BOLO.pratoRy + 30,
    };
  }

  /** Ponto (mundo) dentro do topo do bolo? `margem` < 1 encolhe a elipse. */
  noTopo(p: Ponto, margem = 1): boolean {
    return ((p.x - this.topoAtual.x) / (BOLO.rx * margem)) ** 2 + ((p.y - this.topoAtual.y) / (BOLO.ry * margem)) ** 2 <= 1;
  }

  noRecheio(p: Ponto, margem = 1): boolean {
    return ((p.x - BOLO.cx) / (BOLO.rx * margem)) ** 2 + ((p.y - Y_INFERIOR) / (BOLO.ry * margem)) ** 2 <= 1;
  }

  /** Coordenadas relativas ao centro do topo (as da Decoracao). */
  paraRelativo(p: Ponto): Ponto {
    return { x: p.x - this.topoAtual.x, y: p.y - this.topoAtual.y };
  }

  // ---------------------------------------------------------------- desenho estático

  private desenharBase(g: Phaser.GameObjects.Graphics, yTopo: number): void {
    const yBase = BOLO.topoY + BOLO.alturaLateral;
    g.fillStyle(0xdfe7ee, 1);
    g.fillEllipse(BOLO.cx, yBase + 14, BOLO.pratoRx * 2, BOLO.pratoRy * 2);
    g.lineStyle(4, 0x8aa1b4, 1);
    g.strokeEllipse(BOLO.cx, yBase + 14, BOLO.pratoRx * 2, BOLO.pratoRy * 2);
    g.fillStyle(escurecer(this.corMassa, 0.15), 1);
    g.fillEllipse(BOLO.cx, yBase, BOLO.rx * 2, BOLO.ry * 2);
    g.fillRect(BOLO.cx - BOLO.rx, yTopo, BOLO.rx * 2, yBase - yTopo);
    this.desenharMiolo(g, BOLO.cx, yTopo);
  }

  /** Camada de cima (local: topo em (0,0)). */
  private desenharCamada(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(escurecer(this.corMassa, 0.15), 1);
    g.fillEllipse(0, MEIA, BOLO.rx * 2, BOLO.ry * 2);
    g.fillRect(-BOLO.rx, 0, BOLO.rx * 2, MEIA);
    this.desenharMiolo(g, 0, 0);
  }

  /** Topo sem cobertura: miolo com "poros" (claramente diferente de cobertura e recheio). */
  private desenharMiolo(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
    g.fillStyle(this.corMassa, 1);
    g.fillEllipse(cx, cy, BOLO.rx * 2, BOLO.ry * 2);
    g.fillStyle(clarear(this.corMassa, 0.3), 1);
    for (let i = 0; i < 40; i++) {
      const a = i * 2.39996;
      const r = Math.sqrt((i + 0.5) / 40);
      g.fillCircle(cx + Math.cos(a) * r * BOLO.rx * 0.9, cy + Math.sin(a) * r * BOLO.ry * 0.9, 3);
    }
  }

  // ---------------------------------------------------------------- camadas pintadas

  private camadaPintada(area: Retangulo, profundidade: number): Phaser.GameObjects.RenderTexture {
    const rt = this.scene.add.renderTexture(area.x, area.y, Math.ceil(area.largura), Math.ceil(area.altura)).setOrigin(0, 0).setDepth(profundidade);
    const m = this.scene.make.graphics({}, false);
    m.fillStyle(0xffffff, 1);
    m.fillEllipse(area.x + area.largura / 2, area.y + area.altura / 2, area.largura, area.altura);
    rt.setMask(m.createGeometryMask());
    this.mascaras.push(m);
    return rt;
  }

  private carimbar(rt: Phaser.GameObjects.RenderTexture, pincel: Phaser.GameObjects.Image, x0: number, y0: number, x1: number, y1: number, raio: number): void {
    const passo = Math.max(2, raio / 3);
    const n = Math.max(1, Math.ceil(distancia({ x: x0, y: y0 }, { x: x1, y: y1 }) / passo));
    const k = (raio * 2) / 64;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      rt.draw(pincel.setPosition(x0 + (x1 - x0) * t - rt.x, y0 + (y1 - y0) * t - rt.y).setScale(k));
    }
  }

  /** Recheio na camada de baixo (só visual). */
  pintarRecheio(x0: number, y0: number, x1: number, y1: number, raio: number): void {
    this.recheio ??= this.camadaPintada(this.areaRecheio, 11);
    this.carimbar(this.recheio, this.pincelRecheio, x0, y0, x1, y1, raio);
  }

  /** A criança soltou a camada de cima aqui e ela assentou: o bolo é montado nesse lugar. */
  assentarCamada(x: number, y: number): void {
    const c = this.camadaSuperior;
    if (!c) return;
    // recheio aparecendo entre as camadas (cosmético)
    const cor = this.opcoes.corRecheio ?? 0xe57373;
    const caixa: Caixa = { x: -BOLO.rx - 12, y: -BOLO.ry - 8, largura: BOLO.rx * 2 + 24, altura: BOLO.ry * 2 + 30 };
    this.faixaRecheio?.destroy();
    this.faixaRecheio = imagemVetorial(this.scene, `bolo:faixa:${cor}`, caixa, (g) => {
      g.fillStyle(escurecer(cor, 0.15), 1);
      g.fillEllipse(0, 6, BOLO.rx * 2 + 14, BOLO.ry * 2 + 10);
      g.fillStyle(cor, 1);
      g.fillEllipse(0, 0, BOLO.rx * 2 + 12, BOLO.ry * 2 + 8);
      for (let i = -3; i <= 3; i++) g.fillEllipse(i * 52, BOLO.ry * 0.9 + 6 + Math.abs(i) * -2, 18, 24);
    })
      .setPosition(x, y + MEIA)
      .setDepth(12);
    c.setPosition(x, y).setScale(1);
    this.topoAtual = { x, y };
  }

  /** Cria a camada de cobertura no topo atual (chamar ao começar a decorar). */
  prepararCobertura(): void {
    this.cobertura ??= this.camadaPintada(this.areaTopo, 14);
  }

  pintar(x0: number, y0: number, x1: number, y1: number, raio: number): void {
    this.prepararCobertura();
    this.carimbar(this.cobertura!, this.pincelCobertura, x0, y0, x1, y1, raio);
  }

  /** Glacê (só visual): traço fino na cor pedida pela receita. */
  pintarGlace(cor: number, x0: number, y0: number, x1: number, y1: number, raio: number): void {
    this.glace ??= this.camadaPintada(this.areaTopo, 15);
    this.pincelGlace.setTint(cor);
    this.carimbar(this.glace, this.pincelGlace, x0, y0, x1, y1, raio);
  }

  /** Polvilho (só visual): pontinhos na cor do polvilho, por cima do glacê. */
  pintarPolvilho(cor: number, pontos: readonly Ponto[], raio: number): void {
    this.polvilho ??= this.camadaPintada(this.areaTopo, 16);
    this.pincelPolvilho.setTint(cor);
    for (const p of pontos) this.carimbar(this.polvilho, this.pincelPolvilho, p.x, p.y, p.x, p.y, raio);
  }

  /** Pontinhos-guia do desenho de glacê (redesenha só quando muda). */
  desenharGuia(pontos: readonly Ponto[], visitado: (i: number) => boolean, chave: string): void {
    this.guia.desenhar((g) => {
      pontos.forEach((p, i) => {
        if (i % 2) return;
        if (visitado(i)) return;
        g.fillStyle(0x3b2a20, 0.35);
        g.fillCircle(p.x + 1, p.y + 1, 4);
        g.fillStyle(0xffffff, 0.95);
        g.fillCircle(p.x, p.y, 4);
      });
    }, chave);
  }

  apagarGuia(): void {
    this.guia.limpar();
  }

  desenharEnfeites(d: Decoracao): void {
    const t = this.topoAtual;
    this.enfeites.desenhar((g) => {
      for (const e of d.itens) desenharEnfeite(g, { ...e, x: t.x + e.x, y: t.y + e.y });
    });
  }
}
