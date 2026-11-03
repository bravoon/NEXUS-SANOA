/**
 * Swipe para baixo (desenformar). Puro.
 * - `mover()` devolve o progresso visual 0..1 = deslocamento para baixo / distância mínima,
 *   para a virada da forma acompanhar o dedo (nunca anima sozinha).
 * - `fim()` decide se o swipe valeu: distância ≥ mínima, velocidade média ≥ mínima e
 *   desvio horizontal pequeno.
 */
import { CONFIG_SWIPE } from '../../../config/gameplay';
import { clamp } from '../../../utils/math';

export type ResultadoSwipe = 'ok' | 'curto' | 'lento' | 'torto' | 'inativo';

export class SwipeRecognizer {
  private ini: { x: number; y: number; t: number } | null = null;
  private ult: { x: number; y: number; t: number } | null = null;

  constructor(private readonly cfg = CONFIG_SWIPE) {}

  inicio(x: number, y: number, tMs: number): void {
    this.ini = { x, y, t: tMs };
    this.ult = { x, y, t: tMs };
  }

  /** Progresso visual (0..1). Se o dedo sobe acima do ponto inicial, o trecho recomeça dali. */
  mover(x: number, y: number, tMs: number): number {
    if (!this.ini) return 0;
    if (y < this.ini.y) this.ini = { x, y, t: tMs };
    this.ult = { x, y, t: tMs };
    return clamp((y - this.ini.y) / this.cfg.distanciaMinPx, 0, 1);
  }

  fim(x: number, y: number, tMs: number): ResultadoSwipe {
    const ini = this.ini;
    this.ini = null;
    this.ult = null;
    if (!ini) return 'inativo';
    const dy = y - ini.y;
    const dx = Math.abs(x - ini.x);
    if (dy < this.cfg.distanciaMinPx) return 'curto';
    if (dx > dy * this.cfg.desvioMax) return 'torto';
    const dt = Math.max(1, tMs - ini.t);
    if (dy / dt < this.cfg.velocidadeMin) return 'lento';
    return 'ok';
  }

  get ativo(): boolean {
    return this.ini !== null;
  }

  /** Velocidade média atual (px/ms), para o debug. */
  get velocidade(): number {
    if (!this.ini || !this.ult) return 0;
    return Math.max(0, this.ult.y - this.ini.y) / Math.max(1, this.ult.t - this.ini.t);
  }
}
