/**
 * Etapa "bater" (claras em neve): cada batida do batedor faz a espuma crescer.
 * Parou de bater → a espuma para de crescer. Puro.
 *
 * REGRA: este arquivo não usa tweens nem timers (verificado por teste).
 */
import { WhiskRecognizer } from '../gesture/recognizers/WhiskRecognizer';

export class BeatStep {
  readonly tipo = 'bater' as const;
  private readonly batedor = new WhiskRecognizer();
  private n = 0;

  constructor(readonly meta: number) {
    if (!(meta >= 1)) throw new Error('meta de batidas deve ser ≥ 1');
  }

  amostra(x: number, y: number, tMs: number, dentro: boolean): number {
    const b = this.batedor.amostra(x, y, tMs, dentro);
    this.n += b;
    return b;
  }

  fimDoGesto(): void {
    this.batedor.parar();
  }

  get batidas(): number {
    return this.n;
  }

  get progresso(): number {
    return Math.min(1, this.n / this.meta);
  }

  metaAtingida(): boolean {
    return this.n >= this.meta;
  }
}
