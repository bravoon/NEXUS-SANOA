/**
 * Tigela de vidro (Graphics em coordenadas locais dentro de um Container cuja origem é o
 * centro da borda). Pode ser movida, reduzida e inclinada (despejar a massa na forma).
 *
 * A massa é desenhada em 4 estágios por crossfade, todos função de `mistura`
 * (= progresso do mexer, nunca de tempo):
 *   0,00–0,25 ingredientes separados → 0,25–0,50 grumosa → 0,50–0,75 quase lisa → 0,75–1 lisa e brilhante
 */
import Phaser from 'phaser';
import { AREA_MEXER, CORES, TIGELA } from '../config/layout';
import type { BowlContents } from '../systems/fill/BowlContents';
import type { BocaAlvo } from '../systems/fill/pourFlow';
import { RAIO_NORMALIZADO } from '../systems/steps/StirStep';
import { clamp, grausParaRad, rotacionar, smoothstep, type Ponto } from '../utils/math';
import { clarear, escurecer } from '../utils/desenho';

const PREENCHIMENTO_MAX = 0.85;
const R = TIGELA.raio;
const D = TIGELA.profundidade;
const RY = R * TIGELA.achatamento;

/** Grumos com posições fixas (polar, raio normalizado), para não "piscar" entre frames. */
const GRUMOS = Array.from({ length: 16 }, (_, i) => ({
  r: 0.25 + ((i * 37) % 60) / 100,
  a: i * 2.39996,
  tam: 7 + ((i * 13) % 6),
}));

/** Posições fixas das cascas de ovo sobre a superfície. */
const CASCAS = [
  { r: 0.45, a: 0.6 },
  { r: 0.6, a: 2.6 },
  { r: 0.3, a: 4.4 },
  { r: 0.55, a: 5.5 },
];

export class BowlView extends Phaser.GameObjects.Container {
  private readonly fundo: Phaser.GameObjects.Graphics;
  private readonly massa: Phaser.GameObjects.Graphics;
  private readonly frente: Phaser.GameObjects.Graphics;
  /** Boca da tigela na posição de casa (despejar ingredientes). */
  private ultimaChave = '';
  readonly boca: BocaAlvo = { cx: TIGELA.cx, bordaY: TIGELA.bordaY, meiaLargura: R * 0.85, alturaMax: 360 };

  constructor(
    scene: Phaser.Scene,
    private readonly corMassa: number,
  ) {
    super(scene, TIGELA.cx, TIGELA.bordaY);
    this.fundo = scene.add.graphics();
    this.massa = scene.add.graphics();
    this.frente = scene.add.graphics();
    this.add([this.fundo, this.massa, this.frente]);
    this.setDepth(10);
    this.desenharVidro();
    scene.add.existing(this);
  }

  /** Meia-largura do corpo na profundidade local y (0 = borda). */
  private meiaLarguraEm(y: number): number {
    const k = clamp(y / D, 0, 1);
    return R * Math.sqrt(1 - k * k);
  }

  private yDaAltura(h: number): number {
    return D - h;
  }

  private alturaDe(qtd: number): number {
    return clamp(qtd / TIGELA.capacidade, 0, 1) * D * PREENCHIMENTO_MAX;
  }

  private faixa(h0: number, h1: number): Ponto[] {
    const pts: Ponto[] = [];
    const passos = 14;
    const yTopo = this.yDaAltura(h1);
    const yBase = this.yDaAltura(h0);
    for (let i = 0; i <= passos; i++) {
      const y = yTopo + ((yBase - yTopo) * i) / passos;
      pts.push({ x: -this.meiaLarguraEm(y), y });
    }
    for (let i = passos; i >= 0; i--) {
      const y = yTopo + ((yBase - yTopo) * i) / passos;
      pts.push({ x: this.meiaLarguraEm(y), y });
    }
    return pts;
  }

  private desenharVidro(): void {
    const g = this.fundo;
    g.clear();
    g.fillStyle(CORES.vidro, 0.35);
    g.fillPoints(this.faixa(0, D), true);
    g.fillStyle(CORES.vidro, 0.55);
    g.fillEllipse(0, 0, R * 2, RY * 2);

    const f = this.frente;
    f.clear();
    f.lineStyle(5, CORES.vidroBorda, 1);
    f.strokeEllipse(0, 0, R * 2, RY * 2);
    f.strokePoints(this.faixa(0, D), false);
    f.lineStyle(6, 0xffffff, 0.5);
    f.beginPath();
    f.arc(0, 10, R * 0.82, Math.PI * 0.62, Math.PI * 0.85, false);
    f.strokePath();
  }

  /**
   * Redesenha o conteúdo.
   * @param mistura progresso do mexer (0..1)
   * @param redemoinho ângulo atual do dedo (rad), só cosmético
   * @param cascas cascas de ovo boiando (modo Confeiteiro)
   */
  desenhar(
    conteudo: BowlContents,
    cores: Readonly<Record<string, number>>,
    mistura: number,
    redemoinho: number,
    cascas = 0,
  ): void {
    const total = conteudo.total;
    const chave = `${total.toFixed(4)}|${conteudo.lista.length}|${mistura.toFixed(3)}|${redemoinho.toFixed(2)}|${cascas}`;
    if (chave === this.ultimaChave) return; // nada mudou: não redesenha (desempenho)
    this.ultimaChave = chave;
    const g = this.massa;
    g.clear();
    if (total <= 1e-6) return;

    const hTotal = this.alturaDe(total);
    const ySup = this.yDaAltura(hTotal);
    const wSup = this.meiaLarguraEm(ySup);
    const rySup = wSup * TIGELA.achatamento;

    const aMassa = smoothstep(0.05, 0.75, mistura);
    let acumulado = 0;
    let corTopo = this.corMassa;
    if (aMassa < 1) {
      for (const c of conteudo.lista) {
        const h0 = this.alturaDe(acumulado);
        acumulado += c.quantidade;
        const h1 = this.alturaDe(acumulado);
        corTopo = cores[c.item] ?? 0xffffff;
        g.fillStyle(corTopo, 1);
        g.fillPoints(this.faixa(h0, h1), true);
      }
      g.fillStyle(clarear(corTopo, 0.25), 1);
      g.fillEllipse(0, ySup, wSup * 2, rySup * 2);
    }
    if (aMassa > 0) {
      g.fillStyle(this.corMassa, aMassa);
      g.fillPoints(this.faixa(0, hTotal), true);
      g.fillStyle(clarear(this.corMassa, 0.15), aMassa);
      g.fillEllipse(0, ySup, wSup * 2, rySup * 2);
    }

    const aGrumos = clamp(1 - Math.abs(mistura - 0.375) / 0.375, 0, 1);
    if (aGrumos > 0.01) {
      const camadas = conteudo.lista;
      GRUMOS.forEach((gr, i) => {
        const cam = camadas[i % camadas.length];
        const cor = cam ? (cores[cam.item] ?? 0xffffff) : 0xffffff;
        const a = gr.a + redemoinho * 0.6;
        g.fillStyle(escurecer(cor, 0.08), aGrumos);
        g.fillEllipse(Math.cos(a) * gr.r * wSup * 0.9, ySup + Math.sin(a) * gr.r * rySup * 0.9, gr.tam * 1.6, gr.tam);
      });
    }

    if (mistura > 0 && mistura < 1) {
      g.lineStyle(3, escurecer(this.corMassa, 0.25), 0.35);
      const pts: Ponto[] = [];
      for (let i = 0; i <= 40; i++) {
        const k = i / 40;
        const a = redemoinho + k * Math.PI * 3;
        pts.push({ x: Math.cos(a) * k * wSup * 0.8, y: ySup + Math.sin(a) * k * rySup * 0.8 });
      }
      g.strokePoints(pts, false);
    }

    const aBrilho = smoothstep(0.75, 1, mistura);
    if (aBrilho > 0) {
      g.fillStyle(0xffffff, 0.55 * aBrilho);
      g.fillEllipse(-wSup * 0.35, ySup - rySup * 0.3, wSup * 0.5, rySup * 0.35);
      g.fillStyle(0xffffff, 0.35 * aBrilho);
      g.fillEllipse(wSup * 0.25, ySup + rySup * 0.25, wSup * 0.25, rySup * 0.18);
    }

    // Cascas de ovo: triângulos brancos com contorno escuro (visíveis sobre qualquer cor)
    for (let i = 0; i < Math.min(cascas, CASCAS.length); i++) {
      const c = CASCAS[i]!;
      const x = Math.cos(c.a) * c.r * wSup;
      const y = ySup + Math.sin(c.a) * c.r * rySup;
      g.fillStyle(0xfffaf0, 1);
      g.lineStyle(2, 0x6b5a4e, 1);
      g.fillTriangle(x - 14, y + 6, x + 4, y - 10, x + 14, y + 8);
      g.strokeTriangle(x - 14, y + 6, x + 4, y - 10, x + 14, y + 8);
    }
  }

  /** Y (mundo) da superfície, com a tigela em casa (partículas morrem ao tocá-la). */
  ySuperficie(total: number): number {
    return this.y + this.yDaAltura(this.alturaDe(total)) * this.scaleY;
  }

  /** Bico (borda direita) em coordenadas de mundo, considerando posição, escala e inclinação. */
  bicoMundo(): Ponto {
    const p = rotacionar({ x: R * this.scaleX, y: 0 }, grausParaRad(this.angle));
    return { x: this.x + p.x, y: this.y + p.y };
  }

  /** Converte um ponto de tela para o espaço normalizado do mexer (tigela em casa). */
  normalizarMexer(x: number, y: number): Ponto {
    return {
      x: ((x - AREA_MEXER.cx) / AREA_MEXER.rx) * RAIO_NORMALIZADO,
      y: ((y - AREA_MEXER.cy) / AREA_MEXER.ry) * RAIO_NORMALIZADO,
    };
  }

  dentroAreaMexer(x: number, y: number): boolean {
    const n = this.normalizarMexer(x, y);
    return Math.hypot(n.x, n.y) <= RAIO_NORMALIZADO;
  }

  /** Distância normalizada à borda (1 = sobre a elipse da borda), tigela em casa. */
  distanciaBorda(x: number, y: number): number {
    return Math.hypot((x - TIGELA.cx) / R, (y - TIGELA.bordaY) / RY);
  }

  dentroDaBoca(x: number, y: number): boolean {
    return this.distanciaBorda(x, y) <= 0.85;
  }

  /** O ponto está sobre a tigela (para pegá-la), considerando posição e escala atuais. */
  contemPonto(x: number, y: number): boolean {
    const s = this.scaleX;
    const lx = (x - this.x) / s;
    const ly = (y - this.y) / s;
    return Math.abs(lx) <= R + 10 && ly >= -RY - 10 && ly <= D + 10;
  }

  static estagio(mistura: number): number {
    return Math.min(3, Math.floor(clamp(mistura, 0, 1) * 4));
  }
}
