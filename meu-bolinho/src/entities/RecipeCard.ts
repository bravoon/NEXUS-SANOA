/**
 * Cartão da receita: uma ficha por etapa com ícone e número grande.
 * Não depende de leitura: forma + cor do ingrediente, número da quantidade e seta de mexer.
 */
import Phaser from 'phaser';
import { CORES } from '../config/layout';
import type { IngredienteDef, ReceitaResolvida } from '../systems/recipe/recipeTypes';
import { corHex, desenharSetaCircular, desenharSimbolo } from '../utils/desenho';

const TAM = 76;
const ESPACO = 14;

/** 0.5 → "½", 0.75 → "¾", 1 → "1". */
export function fracaoLegivel(q: number): string {
  const inteiro = Math.floor(q + 1e-9);
  const resto = q - inteiro;
  const frac = Math.abs(resto - 0.5) < 0.01 ? '½' : Math.abs(resto - 0.25) < 0.01 ? '¼' : Math.abs(resto - 0.75) < 0.01 ? '¾' : '';
  if (!frac) return Number(q.toFixed(2)).toString();
  return inteiro > 0 ? `${inteiro}${frac}` : frac;
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
    fundo.fillRoundedRect(0, 0, largura, TAM + ESPACO * 2, 18);
    fundo.lineStyle(4, CORES.mesaBorda, 1);
    fundo.strokeRoundedRect(0, 0, largura, TAM + ESPACO * 2, 18);
    this.add(fundo);

    receita.etapas.forEach((etapa, i) => {
      const cx = ESPACO + i * (TAM + ESPACO) + TAM / 2;
      const cy = ESPACO + TAM / 2;
      const ficha = scene.add.container(cx, cy);
      const moldura = scene.add.graphics();
      const g = scene.add.graphics();
      let numero = '';
      if (etapa.tipo === 'despejar') {
        const def = ingredientes[etapa.item];
        if (def) desenharSimbolo(g, def.simbolo, -10, -6, 36, corHex(def.corRecipiente));
        numero = fracaoLegivel(etapa.quantidade);
      } else {
        desenharSetaCircular(g, -8, -6, 18, CORES.texto, 5);
        numero = String(etapa.voltas);
      }
      const txt = scene.add
        .text(TAM / 2 - 6, TAM / 2 - 4, numero, { fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif', fontSize: '28px', color: '#3b2a20', fontStyle: 'bold' })
        .setOrigin(1, 1);
      const check = scene.add
        .text(0, 0, '✓', { fontFamily: 'Arial, sans-serif', fontSize: '56px', color: '#009e73', fontStyle: 'bold' })
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
    m.fillRoundedRect(-TAM / 2, -TAM / 2, TAM, TAM, 14);
    m.lineStyle(tipo === 'atual' ? 5 : 3, tipo === 'feita' ? CORES.sucesso : CORES.mesaBorda, 1);
    m.strokeRoundedRect(-TAM / 2, -TAM / 2, TAM, TAM, 14);
    f.setAlpha(tipo === 'pendente' ? 0.6 : 1);
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
    this.desenharMoldura(indice, 'feita');
    this.checks[indice]?.setVisible(true);
  }

  /** Brilho rápido na ficha (rejeição de ingrediente fora de ordem). */
  destacar(indice: number): void {
    const f = this.fichas[indice];
    if (!f) return;
    this.scene.tweens.add({ targets: f, angle: { from: -10, to: 10 }, duration: 90, yoyo: true, repeat: 3, onComplete: () => f.setAngle(0) });
  }
}
