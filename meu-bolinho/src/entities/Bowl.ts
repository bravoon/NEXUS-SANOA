/**
 * Tigela de vidro (desenhada com Graphics). Mostra as camadas de ingredientes e a mistura
 * em 4 estágios por crossfade, todos função de `mistura` (= progresso do mexer):
 *   0,00–0,25 ingredientes separados → 0,25–0,50 grumosa → 0,50–0,75 quase lisa → 0,75–1 lisa e brilhante
 * Nada aqui avança sozinho: a cena passa o progresso a cada frame.
 */
import Phaser from 'phaser';
import { AREA_MEXER, CORES, TIGELA } from '../config/layout';
import type { BowlContents } from '../systems/fill/BowlContents';
import type { BocaAlvo } from '../systems/fill/pourFlow';
import { RAIO_NORMALIZADO } from '../systems/steps/StirStep';
import { clamp, smoothstep, type Ponto } from '../utils/math';
import { clarear, escurecer } from '../utils/desenho';

/** Fração da profundidade ocupada quando a tigela está "cheia" (capacidade). */
const PREENCHIMENTO_MAX = 0.85;

/** Grumos com posições fixas (polar, raio normalizado), para não "piscar" entre frames. */
const GRUMOS = Array.from({ length: 16 }, (_, i) => ({
  r: 0.25 + ((i * 37) % 60) / 100,
  a: i * 2.39996, // ângulo áureo
  tam: 7 + ((i * 13) % 6),
}));

export class BowlView {
  private readonly fundo: Phaser.GameObjects.Graphics;
  private readonly conteudo: Phaser.GameObjects.Graphics;
  private readonly frente: Phaser.GameObjects.Graphics;
  readonly boca: BocaAlvo;

  constructor(
    scene: Phaser.Scene,
    private readonly corMassa: number,
  ) {
    this.fundo = scene.add.graphics().setDepth(10);
    this.conteudo = scene.add.graphics().setDepth(11);
    this.frente = scene.add.graphics().setDepth(30);
    this.boca = { cx: TIGELA.cx, bordaY: TIGELA.bordaY, meiaLargura: TIGELA.raio * 0.85, alturaMax: 360 };
    this.desenharVidro();
  }

  /** Meia-largura da tigela na altura y (perfil de meia elipse). */
  private meiaLarguraEm(y: number): number {
    const k = clamp((y - TIGELA.bordaY) / TIGELA.profundidade, 0, 1);
    return TIGELA.raio * Math.sqrt(1 - k * k);
  }

  private yDaAltura(h: number): number {
    return TIGELA.bordaY + TIGELA.profundidade - h;
  }

  /** Altura (px) ocupada por uma quantidade. */
  private alturaDe(qtd: number): number {
    return clamp(qtd / TIGELA.capacidade, 0, 1) * TIGELA.profundidade * PREENCHIMENTO_MAX;
  }

  /** Polígono do corpo entre duas alturas (h0 < h1), seguindo o perfil da tigela. */
  private faixa(h0: number, h1: number): Ponto[] {
    const pts: Ponto[] = [];
    const passos = 14;
    const yTopo = this.yDaAltura(h1);
    const yBase = this.yDaAltura(h0);
    for (let i = 0; i <= passos; i++) {
      const y = yTopo + ((yBase - yTopo) * i) / passos;
      pts.push({ x: TIGELA.cx - this.meiaLarguraEm(y), y });
    }
    for (let i = passos; i >= 0; i--) {
      const y = yTopo + ((yBase - yTopo) * i) / passos;
      pts.push({ x: TIGELA.cx + this.meiaLarguraEm(y), y });
    }
    return pts;
  }

  private desenharVidro(): void {
    const g = this.fundo;
    g.clear();
    g.fillStyle(CORES.vidro, 0.35);
    g.fillPoints(this.faixa(0, TIGELA.profundidade), true);
    g.fillStyle(CORES.vidro, 0.55);
    g.fillEllipse(TIGELA.cx, TIGELA.bordaY, TIGELA.raio * 2, TIGELA.raio * 2 * TIGELA.achatamento);

    const f = this.frente;
    f.clear();
    f.lineStyle(5, CORES.vidroBorda, 1);
    f.strokeEllipse(TIGELA.cx, TIGELA.bordaY, TIGELA.raio * 2, TIGELA.raio * 2 * TIGELA.achatamento);
    // contorno do corpo (meia elipse com profundidade): borda esq. → fundo → borda dir.
    f.strokePoints(this.faixa(0, TIGELA.profundidade), false);
    // reflexo do vidro
    f.lineStyle(6, 0xffffff, 0.5);
    f.beginPath();
    f.arc(TIGELA.cx, TIGELA.bordaY + 10, TIGELA.raio * 0.82, Math.PI * 0.62, Math.PI * 0.85, false);
    f.strokePath();
  }

  /**
   * Redesenha o conteúdo.
   * @param mistura progresso do mexer (0..1)
   * @param redemoinho ângulo atual do dedo (rad), só cosmético
   */
  desenhar(
    conteudo: BowlContents,
    cores: Readonly<Record<string, number>>,
    mistura: number,
    redemoinho: number,
  ): void {
    const g = this.conteudo;
    g.clear();
    const total = conteudo.total;
    if (total <= 1e-6) return;

    const hTotal = this.alturaDe(total);
    const ySup = this.yDaAltura(hTotal);
    const wSup = this.meiaLarguraEm(ySup);
    const rySup = wSup * TIGELA.achatamento;

    // Estágio 1: camadas separadas (desaparecem conforme a massa homogeneiza)
    const aMassa = smoothstep(0.05, 0.75, mistura);
    let acumulado = 0;
    let corTopo = this.corMassa;
    for (const c of conteudo.lista) {
      const h0 = this.alturaDe(acumulado);
      acumulado += c.quantidade;
      const h1 = this.alturaDe(acumulado);
      corTopo = cores[c.item] ?? 0xffffff;
      g.fillStyle(corTopo, 1);
      g.fillPoints(this.faixa(h0, h1), true);
    }
    g.fillStyle(clarear(corTopo, 0.25), 1);
    g.fillEllipse(TIGELA.cx, ySup, wSup * 2, rySup * 2);

    // Massa homogênea por cima (crossfade)
    if (aMassa > 0) {
      g.fillStyle(this.corMassa, aMassa);
      g.fillPoints(this.faixa(0, hTotal), true);
      g.fillStyle(clarear(this.corMassa, 0.15), aMassa);
      g.fillEllipse(TIGELA.cx, ySup, wSup * 2, rySup * 2);
    }

    // Estágio 2–3: grumos, mais fortes em ~0,375 e somem até 0,75
    const aGrumos = clamp(1 - Math.abs(mistura - 0.375) / 0.375, 0, 1);
    if (aGrumos > 0.01) {
      const camadas = conteudo.lista;
      GRUMOS.forEach((gr, i) => {
        const cam = camadas[i % camadas.length];
        const cor = cam ? (cores[cam.item] ?? 0xffffff) : 0xffffff;
        const a = gr.a + redemoinho * 0.6;
        const x = TIGELA.cx + Math.cos(a) * gr.r * wSup * 0.9;
        const y = ySup + Math.sin(a) * gr.r * rySup * 0.9;
        g.fillStyle(escurecer(cor, 0.08), aGrumos);
        g.fillEllipse(x, y, gr.tam * 1.6, gr.tam);
      });
    }

    // Redemoinho (só enquanto mistura está em andamento)
    if (mistura > 0 && mistura < 1) {
      g.lineStyle(3, escurecer(this.corMassa, 0.25), 0.35);
      const pts: Ponto[] = [];
      for (let i = 0; i <= 40; i++) {
        const k = i / 40;
        const a = redemoinho + k * Math.PI * 3;
        pts.push({ x: TIGELA.cx + Math.cos(a) * k * wSup * 0.8, y: ySup + Math.sin(a) * k * rySup * 0.8 });
      }
      g.strokePoints(pts, false);
    }

    // Estágio 4: brilho
    const aBrilho = smoothstep(0.75, 1, mistura);
    if (aBrilho > 0) {
      g.fillStyle(0xffffff, 0.55 * aBrilho);
      g.fillEllipse(TIGELA.cx - wSup * 0.35, ySup - rySup * 0.3, wSup * 0.5, rySup * 0.35);
      g.fillStyle(0xffffff, 0.35 * aBrilho);
      g.fillEllipse(TIGELA.cx + wSup * 0.25, ySup + rySup * 0.25, wSup * 0.25, rySup * 0.18);
    }
  }

  /** Y da superfície do conteúdo (para as partículas "morrerem" ao tocar nela). */
  ySuperficie(total: number): number {
    return this.yDaAltura(this.alturaDe(total));
  }

  /** Converte um ponto de tela para o espaço normalizado do mexer (círculo de raio RAIO_NORMALIZADO). */
  normalizarMexer(x: number, y: number): Ponto {
    return {
      x: ((x - AREA_MEXER.cx) / AREA_MEXER.rx) * RAIO_NORMALIZADO,
      y: ((y - AREA_MEXER.cy) / AREA_MEXER.ry) * RAIO_NORMALIZADO,
    };
  }

  /** O ponto está dentro da área de mexer (elipse)? */
  dentroAreaMexer(x: number, y: number): boolean {
    const n = this.normalizarMexer(x, y);
    return Math.hypot(n.x, n.y) <= RAIO_NORMALIZADO;
  }

  /** O ponto (ex.: cabeça da colher) está dentro da boca da tigela? */
  dentroDaBoca(x: number, y: number): boolean {
    const nx = (x - TIGELA.cx) / TIGELA.raio;
    const ny = (y - TIGELA.bordaY) / (TIGELA.raio * TIGELA.achatamento);
    return Math.hypot(nx, ny) <= 0.85;
  }

  /** Estágio visual da massa (0..3), para o modo debug. */
  static estagio(mistura: number): number {
    return Math.min(3, Math.floor(clamp(mistura, 0, 1) * 4));
  }
}
