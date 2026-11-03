/**
 * Recipiente de ingrediente (xícara/copo). Segue o dedo com atraso físico (amortecimento),
 * inclina pelo ângulo dado pela cena e mostra um medidor com faixa-alvo.
 *
 * Tweens aqui são SOMENTE cosméticos e reversíveis (voltar para a mesa, balançar).
 * Nenhum deles altera quantidade ou progresso.
 */
import Phaser from 'phaser';
import { CONFIG_ARRASTAR } from '../config/gameplay';
import { ALVO_TOQUE_MIN, CORES, RECIPIENTE } from '../config/layout';
import type { IngredienteDef } from '../systems/recipe/recipeTypes';
import { amortecer, type Ponto } from '../utils/math';
import { clarear, corHex, desenharSimbolo, escurecer } from '../utils/desenho';

export type EstadoRecipiente = 'mesa' | 'arrastando' | 'voltando' | 'usado';

export interface DadosMedidor {
  despejado: number;
  capacidade: number;
  limiteInferior: number;
  limiteSuperior: number;
  disponivel: number;
}

export class PourContainer extends Phaser.GameObjects.Container {
  estado: EstadoRecipiente = 'mesa';
  private readonly corpo: Phaser.GameObjects.Graphics;
  private readonly medidor: Phaser.GameObjects.Graphics;
  readonly cor: number;
  readonly corConteudo: number;
  readonly largura = RECIPIENTE.largura;
  readonly altura = RECIPIENTE.altura;

  constructor(
    scene: Phaser.Scene,
    readonly item: string,
    readonly def: IngredienteDef,
    readonly descanso: Ponto,
  ) {
    super(scene, descanso.x, descanso.y);
    this.cor = corHex(def.corRecipiente);
    this.corConteudo = corHex(def.corConteudo);
    this.corpo = scene.add.graphics();
    this.medidor = scene.add.graphics();
    this.add([this.corpo, this.medidor]);
    this.setDepth(20);
    this.desenharCorpo(1);
    scene.add.existing(this);
  }

  private desenharCorpo(fracaoConteudo: number): void {
    const g = this.corpo;
    const w = this.largura, h = this.altura;
    g.clear();
    // conteúdo visível no topo (diminui conforme despeja)
    g.fillStyle(escurecer(this.cor, 0.35), 1);
    g.fillRoundedRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, 14);
    g.fillStyle(this.cor, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 12);
    if (fracaoConteudo > 0.02) {
      g.fillStyle(this.corConteudo, 1);
      g.fillRoundedRect(-w / 2 + 6, -h / 2 + 6, w - 12, Math.max(6, 18 * fracaoConteudo), 6);
    }
    // bico
    g.fillStyle(clarear(this.cor, 0.3), 1);
    g.fillTriangle(w / 2 - 14, -h / 2, w / 2 + 6, -h / 2 - 8, w / 2, -h / 2 + 14);
    // reflexo lateral e base mais escura (volume)
    g.fillStyle(0xffffff, 0.28);
    g.fillRoundedRect(-w / 2 + 6, -h / 2 + 28, 9, h - 40, 4);
    g.fillStyle(escurecer(this.cor, 0.15), 1);
    g.fillRoundedRect(-w / 2, h / 2 - 14, w, 14, { tl: 0, tr: 0, bl: 12, br: 12 });
    // rótulo redondo com o símbolo (forma + cor: legível sem ler)
    g.fillStyle(0xffffff, 0.95);
    g.fillCircle(-6, 14, 25);
    g.lineStyle(3, escurecer(this.cor, 0.35), 1);
    g.strokeCircle(-6, 14, 25);
    desenharSimbolo(g, this.def.simbolo, -6, 14, 30, this.cor);
  }

  /** Mostra o medidor (só no recipiente da etapa atual). */
  atualizarMedidor(m: DadosMedidor | null): void {
    const g = this.medidor;
    g.clear();
    if (!m) return;
    this.desenharCorpo(m.disponivel / m.capacidade);
    const x = this.largura / 2 - 22;
    const yBase = this.altura / 2 - 8;
    const alt = this.altura - 34;
    const larg = 14;
    const yDe = (v: number) => yBase - Math.min(1, v / m.capacidade) * alt;

    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(x - 2, yBase - alt - 2, larg + 4, alt + 4, 5);
    // faixa-alvo (verde, com marcas nas pontas)
    g.fillStyle(CORES.sucesso, 0.45);
    g.fillRect(x, yDe(m.limiteSuperior), larg, yDe(m.limiteInferior) - yDe(m.limiteSuperior));
    // nível despejado
    const passou = m.despejado > m.limiteSuperior + 1e-9;
    g.fillStyle(passou ? CORES.alerta : escurecer(this.corConteudo, 0.35), 1);
    g.fillRect(x + 3, yDe(m.despejado), larg - 6, yBase - yDe(m.despejado));
    g.lineStyle(2, CORES.sucesso, 1);
    g.lineBetween(x - 4, yDe(m.limiteSuperior), x + larg + 4, yDe(m.limiteSuperior));
    g.lineBetween(x - 4, yDe(m.limiteInferior), x + larg + 4, yDe(m.limiteInferior));
  }

  /** Área de toque (≥ 64 px lógicos garantidos). */
  contem(p: Ponto): boolean {
    if (this.estado === 'usado') return false;
    const mw = Math.max(this.largura, ALVO_TOQUE_MIN) / 2 + 10;
    const mh = Math.max(this.altura, ALVO_TOQUE_MIN) / 2 + 10;
    return Math.abs(p.x - this.x) <= mw && Math.abs(p.y - this.y) <= mh;
  }

  pegar(): void {
    this.scene.tweens.killTweensOf(this);
    this.setAngle(0);
    this.estado = 'arrastando';
    this.setDepth(40);
    // "squash" de pegar (cosmético)
    this.setScale(1);
    this.scene.tweens.add({ targets: this, scaleX: 1.1, scaleY: 0.9, duration: 80, yoyo: true });
  }

  /** Segue o alvo com atraso físico (independente do frame rate). */
  seguir(alvo: Ponto, dtMs: number, travarX: number | null = null): void {
    const dt = dtMs / 1000;
    this.x = travarX ?? amortecer(this.x, alvo.x, CONFIG_ARRASTAR.lambdaSeguir, dt);
    this.y = amortecer(this.y, alvo.y, CONFIG_ARRASTAR.lambdaSeguir, dt);
  }

  /** Volta para a mesa e endireita (cosmético). */
  voltarParaMesa(): void {
    this.estado = 'voltando';
    this.scene.tweens.add({
      targets: this,
      x: this.descanso.x,
      y: this.descanso.y,
      angle: 0,
      duration: 380,
      ease: 'Back.Out',
      onComplete: () => {
        if (this.estado === 'voltando') this.estado = 'mesa';
        this.setDepth(20);
      },
    });
  }

  /** Balança para chamar atenção (cosmético). */
  balancar(): void {
    if (this.estado !== 'mesa') return;
    this.scene.tweens.add({ targets: this, angle: { from: -8, to: 8 }, duration: 120, yoyo: true, repeat: 2, onComplete: () => this.setAngle(0) });
  }

  /** Etapa deste ingrediente acabou: sai de cena. */
  aposentar(): void {
    this.estado = 'usado';
    this.atualizarMedidor(null);
    this.scene.tweens.add({ targets: this, alpha: 0.25, scale: 0.8, duration: 400 });
  }
}
