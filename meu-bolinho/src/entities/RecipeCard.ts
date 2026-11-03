/**
 * Cartão da receita: uma ficha por etapa com ícone e número grande.
 * Não depende de leitura: forma + cor do ingrediente, número da quantidade e ícones de ação.
 */
import Phaser from 'phaser';
import { CORES } from '../config/layout';
import type { EtapaResolvida, IngredienteDef, ReceitaResolvida } from '../systems/recipe/recipeTypes';
import { corHex, desenharSetaCircular, desenharSimbolo } from '../utils/desenho';

const TAM = 64;
const ESPACO = 10;

/** 0.5 → "½", 0.75 → "¾", 1 → "1". */
export function fracaoLegivel(q: number): string {
  const inteiro = Math.floor(q + 1e-9);
  const resto = q - inteiro;
  const frac = Math.abs(resto - 0.5) < 0.01 ? '½' : Math.abs(resto - 0.25) < 0.01 ? '¼' : Math.abs(resto - 0.75) < 0.01 ? '¾' : '';
  if (!frac) return Number(q.toFixed(2)).toString();
  return inteiro > 0 ? `${inteiro}${frac}` : frac;
}

/** Desenha o ícone de uma etapa centrado em (x, y). Retorna o número/legenda (ou ''). */
export function desenharIconeEtapa(
  g: Phaser.GameObjects.Graphics,
  etapa: EtapaResolvida,
  ingredientes: Record<string, IngredienteDef>,
  x: number,
  y: number,
): string {
  const t = CORES.texto;
  switch (etapa.tipo) {
    case 'despejar': {
      const def = ingredientes[etapa.item];
      if (def) desenharSimbolo(g, def.simbolo, x, y, 30, corHex(def.corRecipiente));
      return fracaoLegivel(etapa.quantidade);
    }
    case 'quebrar_ovo':
      g.fillStyle(0xfff8e7, 1);
      g.lineStyle(3, 0xc9a66b, 1);
      g.fillEllipse(x, y, 26, 34);
      g.strokeEllipse(x, y, 26, 34);
      return String(etapa.quantidade);
    case 'mexer':
      desenharSetaCircular(g, x, y, 15, t, 4);
      return String(etapa.voltas);
    case 'untar':
      g.fillStyle(0x9aa4ad, 1);
      g.fillEllipse(x, y + 4, 40, 24);
      g.fillStyle(0xf7dc6f, 1);
      g.fillRoundedRect(x - 6, y - 20, 14, 22, 3);
      return '';
    case 'despejar_massa':
      g.fillStyle(0x9aa4ad, 1);
      g.fillEllipse(x, y + 8, 40, 20);
      g.fillStyle(0xebc57e, 1);
      g.fillEllipse(x, y + 7, 30, 13);
      g.fillTriangle(x - 4, y - 18, x + 4, y - 18, x, y + 2);
      return '';
    case 'forno':
      g.fillStyle(0xe4572e, 1);
      g.fillRoundedRect(x - 18, y - 16, 36, 32, 5);
      g.fillStyle(0x3b2a20, 1);
      g.fillRect(x - 12, y - 10, 20, 20);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(x + 13, y - 7, 3);
      return '';
    case 'desenformar':
      g.fillStyle(0xdfe7ee, 1);
      g.fillEllipse(x, y + 12, 40, 12);
      g.fillStyle(0xd9a05b, 1);
      g.fillRect(x - 14, y - 4, 28, 14);
      g.lineStyle(4, t, 1);
      g.lineBetween(x, y - 22, x, y - 8);
      g.fillStyle(t, 1);
      g.fillTriangle(x - 7, y - 10, x + 7, y - 10, x, y - 2);
      return '';
    case 'decorar':
      g.fillStyle(0xd9a05b, 1);
      g.fillRect(x - 18, y - 2, 36, 16);
      g.fillStyle(corHex(etapa.corCobertura), 1);
      g.fillEllipse(x, y - 2, 36, 12);
      g.fillStyle(0x56b4e9, 1);
      g.fillRect(x - 2, y - 20, 5, 16);
      g.fillStyle(0xff9f1c, 1);
      g.fillEllipse(x + 0.5, y - 24, 6, 9);
      return '';
  }
}

export class RecipeCard extends Phaser.GameObjects.Container {
  private readonly fichas: Phaser.GameObjects.Container[] = [];
  private readonly molduras: Phaser.GameObjects.Graphics[] = [];
  private readonly checks: Phaser.GameObjects.Text[] = [];
  private pulso: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, receita: ReceitaResolvida, ingredientes: Record<string, IngredienteDef>) {
    super(scene, x, y);
    const fundo = scene.add.graphics();
    const largura = receita.etapas.length * (TAM + ESPACO) + ESPACO;
    fundo.fillStyle(0xffffff, 0.9);
    fundo.fillRoundedRect(0, 0, largura, TAM + ESPACO * 2, 16);
    fundo.lineStyle(4, CORES.mesaBorda, 1);
    fundo.strokeRoundedRect(0, 0, largura, TAM + ESPACO * 2, 16);
    this.add(fundo);

    receita.etapas.forEach((etapa, i) => {
      const cx = ESPACO + i * (TAM + ESPACO) + TAM / 2;
      const cy = ESPACO + TAM / 2;
      const ficha = scene.add.container(cx, cy);
      const moldura = scene.add.graphics();
      const g = scene.add.graphics();
      const numero = desenharIconeEtapa(g, etapa, ingredientes, -6, -4);
      const txt = scene.add
        .text(TAM / 2 - 4, TAM / 2 - 2, numero, { fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif', fontSize: '24px', color: '#3b2a20', fontStyle: 'bold' })
        .setOrigin(1, 1);
      const check = scene.add
        .text(0, 0, '✓', { fontFamily: 'Arial, sans-serif', fontSize: '48px', color: '#009e73', fontStyle: 'bold' })
        .setOrigin(0.5)
        .setVisible(false);
      ficha.add([moldura, g, txt, check]);
      this.add(ficha);
      this.fichas.push(ficha);
      this.molduras.push(moldura);
      this.checks.push(check);
      this.desenharMoldura(i, 'pendente');
    });

    this.setDepth(60);
    scene.add.existing(this);
  }

  private desenharMoldura(i: number, tipo: 'pendente' | 'atual' | 'feita'): void {
    const m = this.molduras[i];
    const f = this.fichas[i];
    if (!m || !f) return;
    m.clear();
    m.fillStyle(tipo === 'atual' ? CORES.destaque : 0xfdf6ee, 1);
    m.fillRoundedRect(-TAM / 2, -TAM / 2, TAM, TAM, 12);
    m.lineStyle(tipo === 'atual' ? 5 : 3, tipo === 'feita' ? CORES.sucesso : CORES.mesaBorda, 1);
    m.strokeRoundedRect(-TAM / 2, -TAM / 2, TAM, TAM, 12);
    f.setAlpha(tipo === 'pendente' ? 0.6 : 1);
  }

  /** Estado inicial ao entrar numa cena: etapas anteriores feitas, a atual destacada. */
  sincronizar(indice: number, atualFeita = false): void {
    for (let i = 0; i < indice; i++) this.marcarFeita(i);
    if (atualFeita) this.marcarFeita(indice);
    else this.definirAtual(indice);
  }

  definirAtual(indice: number): void {
    this.pulso?.stop();
    this.fichas.forEach((f, i) => {
      f.setScale(1);
      if (i === indice) this.desenharMoldura(i, 'atual');
      else if (!this.checks[i]?.visible) this.desenharMoldura(i, 'pendente');
    });
    const atual = this.fichas[indice];
    if (atual) this.pulso = this.scene.tweens.add({ targets: atual, scale: 1.08, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  }

  marcarFeita(indice: number): void {
    if (this.fichas[indice]) {
      this.pulso?.stop();
      this.fichas[indice]!.setScale(1);
    }
    this.desenharMoldura(indice, 'feita');
    this.checks[indice]?.setVisible(true);
  }

  /** Balanço rápido na ficha (rejeição de ingrediente fora de ordem). */
  destacar(indice: number): void {
    const f = this.fichas[indice];
    if (!f) return;
    this.scene.tweens.add({ targets: f, angle: { from: -10, to: 10 }, duration: 90, yoyo: true, repeat: 3, onComplete: () => f.setAngle(0) });
  }
}
