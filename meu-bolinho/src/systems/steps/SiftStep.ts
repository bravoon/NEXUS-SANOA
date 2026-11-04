/**
 * Etapa "peneirar" (pura): a peneira já vem com a medida certa do ingrediente; cada
 * SACUDIDA (vai e vem lateral) com a peneira sobre a tigela deixa cair uma porção.
 * Peneira parada, fora da tigela ou arrastada reto = nada cai. Não há excesso possível:
 * o que está na peneira é exatamente a medida.
 *
 * REGRA: este arquivo não usa tweens nem timers (verificado por teste).
 */
import { CONFIG_PENEIRAR } from '../../config/gameplay';
import { ShakeRecognizer } from '../gesture/recognizers/ShakeRecognizer';

export class SiftStep {
  readonly tipo = 'peneirar' as const;
  private readonly sacudir = new ShakeRecognizer(CONFIG_PENEIRAR);
  private n = 0;

  constructor(
    readonly item: string,
    readonly quantidade: number,
    readonly meta: number,
  ) {
    if (!(quantidade > 0)) throw new Error('quantidade deve ser > 0');
    if (!(meta >= 1)) throw new Error('meta de sacudidas deve ser ≥ 1');
  }

  /** Amostra do dedo segurando a peneira. Retorna a quantidade que caiu na tigela (0 se nada). */
  amostra(x: number, tMs: number, sobreTigela: boolean): number {
    if (!sobreTigela || this.metaAtingida()) {
      this.sacudir.parar();
      return 0;
    }
    if (this.sacudir.amostra(x, tMs) === 0) return 0;
    this.n++;
    return this.quantidade / this.meta;
  }

  fimDoGesto(): void {
    this.sacudir.parar();
  }

  get sacudidas(): number {
    return this.n;
  }

  /** Quanto ainda está na peneira (xícaras). */
  get restante(): number {
    return this.quantidade * (1 - this.progresso);
  }

  get progresso(): number {
    return Math.min(1, this.n / this.meta);
  }

  metaAtingida(): boolean {
    return this.n >= this.meta;
  }
}
