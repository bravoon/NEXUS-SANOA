/**
 * Etapa "cortar" (pura): a criança arrasta o cortador e SOLTA em cima da massa aberta;
 * cada soltura num lugar livre corta um biscoito ali. Fora da massa ou encostado num
 * biscoito já cortado não corta (o cortador volta). Os biscoitos ficam onde ela cortou.
 *
 * Coordenadas normalizadas: a massa aberta é o disco unitário (|p| ≤ 1).
 * REGRA: este arquivo não usa tweens nem timers (verificado por teste).
 */
import { RAIO_BISCOITO } from '../produto/Produto';
import type { Ponto } from '../../utils/math';

export type ResultadoCorte = 'cortou' | 'fora' | 'encostado' | 'completo';

export class CutStep {
  readonly tipo = 'cortar' as const;
  private readonly lista: Ponto[] = [];

  constructor(
    readonly meta: number,
    readonly raio = RAIO_BISCOITO,
  ) {
    if (!(meta >= 1)) throw new Error('meta de biscoitos deve ser ≥ 1');
  }

  /** Quantos biscoitos cabem, no máximo (para validar a meta). */
  static cabem(raio = RAIO_BISCOITO): number {
    // empacotamento hexagonal num disco de raio (1 - r): estimativa conservadora
    const R = 1 - raio;
    return Math.floor((0.78 * R * R) / (raio * raio));
  }

  cortar(nx: number, ny: number): ResultadoCorte {
    if (this.metaAtingida()) return 'completo';
    if (Math.hypot(nx, ny) > 1 - this.raio * 0.85) return 'fora';
    if (this.lista.some((b) => Math.hypot(b.x - nx, b.y - ny) < this.raio * 1.9)) return 'encostado';
    this.lista.push({ x: nx, y: ny });
    return 'cortou';
  }

  get biscoitos(): readonly Ponto[] {
    return this.lista;
  }

  get progresso(): number {
    return Math.min(1, this.lista.length / this.meta);
  }

  metaAtingida(): boolean {
    return this.lista.length >= this.meta;
  }
}
