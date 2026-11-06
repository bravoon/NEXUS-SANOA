/**
 * Apresenta as dicas progressivas (HintTimer decide QUANDO; a cena decide O QUÊ).
 *   nível 1: brilho no cartão da receita e no objeto certo
 *   nível 2: mão-fantasma demonstrando o gesto — imagem sem colisor e sem acesso aos
 *            controladores: é impossível ela executar a ação. Nos arrastos, leva uma
 *            cópia translúcida do objeto (o objeto real não se move).
 *   nível 3: narração explicando o passo
 */
import Phaser from 'phaser';
import { TEXTURAS } from '../art/ArteProcedural';
import type { NivelDica } from '../systems/hint/HintTimer';
import type { Ponto } from '../utils/math';
import type { RecipeCard } from './RecipeCard';

export type Demo =
  | { tipo: 'arrastar'; de: Ponto; para: Ponto; depois?: 'inclinar'; fantasma?: (g: Phaser.GameObjects.Graphics) => void }
  | { tipo: 'circular'; centro: Ponto; rx: number; ry: number }
  | { tipo: 'tocar'; ponto: Ponto; vezes: number }
  | { tipo: 'esfregar'; centro: Ponto; largura: number; altura: number }
  | { tipo: 'deslizar'; de: Ponto; distancia: number }
  | { tipo: 'sacudir'; ponto: Ponto }
  | { tipo: 'caminho'; pontos: Ponto[] };

export interface DicaEtapa {
  /** Fichas do cartão a brilhar (normalmente a etapa atual). */
  ficha: number;
  /** Objetos a destacar com um anel brilhante. */
  destaques: Ponto[];
  demo: Demo;
  /** Fala do catálogo para o nível 3. */
  fala: string;
}

export class HintPresenter {
  private readonly aneis: Phaser.GameObjects.Graphics;
  private readonly mao: Phaser.GameObjects.Image;
  private readonly fantasma: Phaser.GameObjects.Graphics;
  private tl: Phaser.Time.TimerEvent | null = null;
  private fichaBrilhando: number | null = null;
  private tweensAneis: Phaser.Tweens.Tween | null = null;

  constructor(
    private readonly cena: Phaser.Scene,
    private readonly cartao: RecipeCard,
    private readonly falar: (id: string) => void,
  ) {
    this.aneis = cena.add.graphics().setDepth(65).setVisible(false);
    this.fantasma = cena.add.graphics().setDepth(94).setVisible(false).setAlpha(0.45);
    // ponta do dedo da textura em (28, 6) de 80×100
    this.mao = cena.add.image(0, 0, TEXTURAS.mao).setOrigin(28 / 80, 6 / 100).setDepth(95).setAlpha(0).setVisible(false);
  }

  mostrar(nivel: NivelDica, dica: DicaEtapa): void {
    if (nivel >= 1) this.nivel1(dica);
    if (nivel >= 2) this.nivel2(dica.demo);
    if (nivel === 3) this.falar(dica.fala);
  }

  private nivel1(dica: DicaEtapa): void {
    if (this.fichaBrilhando !== dica.ficha) {
      this.cartao.brilhar(dica.ficha);
      this.fichaBrilhando = dica.ficha;
    }
    const g = this.aneis;
    g.clear();
    for (const p of dica.destaques) {
      g.lineStyle(8, 0xf0e442, 0.9);
      g.strokeCircle(p.x, p.y, 62);
      g.lineStyle(3, 0xffffff, 1);
      g.strokeCircle(p.x, p.y, 70);
    }
    g.setVisible(true).setAlpha(1);
    this.tweensAneis?.stop();
    this.tweensAneis = this.cena.tweens.add({ targets: g, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 });
  }

  private nivel2(demo: Demo): void {
    if (this.mao.visible) return; // demo já em loop
    this.mao.setVisible(true);
    this.rodarDemo(demo);
  }

  private rodarDemo(demo: Demo): void {
    const m = this.mao;
    const t = this.cena.tweens;
    const repetir = (ms: number) => {
      this.tl = this.cena.time.delayedCall(ms, () => {
        if (m.visible) this.rodarDemo(demo);
      });
    };
    t.killTweensOf(m);
    m.setAlpha(0.9);
    this.fantasma.setVisible(false);
    switch (demo.tipo) {
      case 'arrastar': {
        m.setPosition(demo.de.x, demo.de.y).setScale(1);
        if (demo.fantasma) {
          this.fantasma.clear();
          demo.fantasma(this.fantasma);
          this.fantasma.setPosition(demo.de.x, demo.de.y).setAngle(0).setVisible(true);
        }
        const alvos: Phaser.GameObjects.GameObject[] = demo.fantasma ? [m, this.fantasma] : [m];
        t.chain({
          targets: alvos,
          tweens: [
            { scale: 0.92, duration: 200 },
            { x: demo.para.x, y: demo.para.y, duration: 1100, ease: 'Sine.InOut' },
            ...(demo.depois === 'inclinar'
              ? [{ x: demo.para.x + 120, duration: 900, ease: 'Sine.InOut', onUpdate: () => this.fantasma.setAngle(((m.x - demo.para.x) / 120) * 70) }]
              : []),
            { scale: 1, duration: 200 },
          ],
        });
        repetir(demo.depois ? 3200 : 2300);
        break;
      }
      case 'circular': {
        const estado = { a: 0 };
        t.add({
          targets: estado,
          a: Math.PI * 4,
          duration: 2600,
          onUpdate: () => m.setPosition(demo.centro.x + Math.cos(estado.a) * demo.rx, demo.centro.y + Math.sin(estado.a) * demo.ry),
        });
        repetir(3000);
        break;
      }
      case 'tocar': {
        m.setPosition(demo.ponto.x + 10, demo.ponto.y + 14).setScale(1);
        t.add({ targets: m, scale: 0.85, y: demo.ponto.y + 4, duration: 160, yoyo: true, repeat: demo.vezes - 1, hold: 120, repeatDelay: 260 });
        repetir(1200 + demo.vezes * 600);
        break;
      }
      case 'esfregar': {
        const { centro: c, largura: w, altura: h } = demo;
        const estado = { k: 0 };
        t.add({
          targets: estado,
          k: 1,
          duration: 2400,
          onUpdate: () => {
            const k = estado.k;
            const linha = Math.floor(k * 5);
            const fr = (k * 5) % 1;
            const x = c.x - w / 2 + (linha % 2 ? 1 - fr : fr) * w;
            m.setPosition(x, c.y - h / 2 + (linha / 4) * h);
          },
        });
        repetir(2800);
        break;
      }
      case 'deslizar':
        m.setPosition(demo.de.x, demo.de.y).setScale(1);
        t.chain({ targets: m, tweens: [{ scale: 0.9, duration: 200 }, { y: demo.de.y + demo.distancia, duration: 260, ease: 'Quad.In' }, { scale: 1, duration: 200 }] });
        repetir(1600);
        break;
      case 'caminho': {
        const pts = demo.pontos;
        if (pts.length < 2) break;
        const estado = { k: 0 };
        m.setPosition(pts[0]!.x, pts[0]!.y).setScale(1);
        t.add({
          targets: estado,
          k: pts.length - 1,
          duration: 2600,
          onUpdate: () => {
            const i = Math.floor(estado.k);
            const a = pts[i]!, b = pts[Math.min(i + 1, pts.length - 1)]!;
            const f = estado.k - i;
            m.setPosition(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f);
          },
        });
        repetir(3200);
        break;
      }
      case 'sacudir':
        m.setPosition(demo.ponto.x, demo.ponto.y).setScale(1);
        t.add({ targets: m, x: demo.ponto.x + 50, duration: 90, yoyo: true, repeat: 7 });
        repetir(2000);
        break;
    }
  }

  /** A criança voltou a interagir: tudo some. */
  limpar(): void {
    this.tl?.remove();
    this.tl = null;
    this.tweensAneis?.stop();
    this.tweensAneis = null;
    this.aneis.clear().setVisible(false);
    this.cena.tweens.killTweensOf([this.mao, this.fantasma]);
    this.mao.setVisible(false);
    this.fantasma.setVisible(false);
    if (this.fichaBrilhando !== null) this.cartao.apagarBrilho();
    this.fichaBrilhando = null;
  }
}
