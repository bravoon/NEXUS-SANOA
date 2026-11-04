/**
 * Etapa "ralar" (pura): a criança esfrega o pedaço (coco, chocolate, maçã...) para cima e
 * para baixo na face do ralador. Cada passada vertical ampla e firme rala uma porção, que
 * cai na tigela. Fora do ralador, parado, de lado ou tremendo = nada é ralado.
 *
 * REGRA: este arquivo não usa tweens nem timers (verificado por teste).
 */
import { CONFIG_RALAR } from '../../config/gameplay';
import { WhiskRecognizer } from '../gesture/recognizers/WhiskRecognizer';

export class GrateStep {
  readonly tipo = 'ralar' as const;
  private readonly passadas = new WhiskRecognizer(CONFIG_RALAR, 'y');
  private n = 0;

  constructor(
    readonly item: string,
    readonly quantidade: number,
    readonly meta: number,
  ) {
    if (!(quantidade > 0)) throw new Error('quantidade deve ser > 0');
    if (!(meta >= 1)) throw new Error('meta de raladas deve ser ≥ 1');
  }

  /** Amostra do pedaço; `noRalador` = o pedaço está encostado na face do ralador. Retorna o que caiu. */
  amostra(x: number, y: number, tMs: number, noRalador: boolean): number {
    if (this.metaAtingida()) return 0;
    if (this.passadas.amostra(x, y, tMs, noRalador) === 0) return 0;
    this.n++;
    return this.quantidade / this.meta;
  }

  fimDoGesto(): void {
    this.passadas.parar();
  }

  get raladas(): number {
    return this.n;
  }

  /** Tamanho do pedaço que sobrou (1 = inteiro). */
  get pedaco(): number {
    return 1 - this.progresso;
  }

  get progresso(): number {
    return Math.min(1, this.n / this.meta);
  }

  metaAtingida(): boolean {
    return this.n >= this.meta;
  }
}
