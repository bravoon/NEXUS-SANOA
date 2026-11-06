/**
 * Adapta Pointer Events do Phaser (toque e mouse unificados) para um fluxo de amostras
 * com UM ponteiro ativo. Toques extras são ignorados enquanto o primeiro estiver na tela.
 * Perder o foco da janela equivale a soltar (o progresso para, nunca continua sozinho).
 */
import type Phaser from 'phaser';

export interface AmostraPonteiro {
  id: number;
  x: number;
  y: number;
  /** Timestamp em ms (performance.now). */
  t: number;
}

export interface OuvintesGesto {
  aoTocar(a: AmostraPonteiro): void;
  aoMover(a: AmostraPonteiro): void;
  aoSoltar(a: AmostraPonteiro): void;
}

export class GestureSystem {
  private ativo: number | null = null;
  private ultima: AmostraPonteiro | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ouvintes: OuvintesGesto,
  ) {
    const input = scene.input;
    input.on('pointerdown', this.down, this);
    input.on('pointermove', this.move, this);
    input.on('pointerup', this.up, this);
    input.on('pointerupoutside', this.up, this);
    scene.game.events.on('blur', this.cancelar, this);
    scene.game.events.on('hidden', this.cancelar, this);
    // Pausar a cena: o "soltar" do dedo acontece com a cena pausada e nunca chegaria aqui.
    // Sem isto, o ponteiro ficaria "ativo" para sempre e a cena não aceitaria mais toques.
    scene.events.on('pause', this.cancelar, this);
    scene.events.on('resume', this.zerar, this);
    scene.events.once('shutdown', this.destruir, this);
  }

  /** Posição atual do ponteiro ativo (ou null). */
  get atual(): AmostraPonteiro | null {
    return this.ativo === null ? null : this.ultima;
  }

  private amostra(p: Phaser.Input.Pointer): AmostraPonteiro {
    return { id: p.id, x: p.x, y: p.y, t: performance.now() };
  }

  private down(p: Phaser.Input.Pointer): void {
    if (this.ativo !== null) return;
    this.ativo = p.id;
    this.ultima = this.amostra(p);
    this.ouvintes.aoTocar(this.ultima);
  }

  private move(p: Phaser.Input.Pointer): void {
    if (p.id !== this.ativo || !p.isDown) return;
    this.ultima = this.amostra(p);
    this.ouvintes.aoMover(this.ultima);
  }

  private up(p: Phaser.Input.Pointer): void {
    if (p.id !== this.ativo) return;
    this.ativo = null;
    this.ouvintes.aoSoltar(this.amostra(p));
  }

  private cancelar(): void {
    if (this.ativo === null || !this.ultima) return;
    this.ativo = null;
    this.ouvintes.aoSoltar({ ...this.ultima, t: performance.now() });
  }

  private zerar(): void {
    this.ativo = null;
    this.ultima = null;
  }

  destruir(): void {
    this.scene.events.off('pause', this.cancelar, this);
    this.scene.events.off('resume', this.zerar, this);
    const input = this.scene.input;
    input.off('pointerdown', this.down, this);
    input.off('pointermove', this.move, this);
    input.off('pointerup', this.up, this);
    input.off('pointerupoutside', this.up, this);
    this.scene.game.events.off('blur', this.cancelar, this);
    this.scene.game.events.off('hidden', this.cancelar, this);
  }
}
