/**
 * Etapa "despejar_massa" (pura): esvaziar a tigela na forma até sobrar < restanteMax.
 * Mesma física de despejar (material "massa": vazão menor). Só sai com o dedo segurando.
 *
 * REGRA: este arquivo não usa tweens nem timers (verificado por teste).
 */
import { quantidadeDespejada, type EntradaDespejo } from '../fill/pourFlow';

export class PourOutStep {
  readonly tipo = 'despejar_massa' as const;
  private resta: number;
  private ultimaVazao = 0;

  constructor(
    readonly inicial: number,
    readonly restanteMax: number,
  ) {
    if (!(inicial > 0)) throw new Error('a tigela está vazia');
    this.resta = inicial;
  }

  tick(entrada: EntradaDespejo, dtMs: number): number {
    const q = quantidadeDespejada(entrada, 'massa', this.resta, dtMs);
    this.ultimaVazao = dtMs > 0 ? q / (dtMs / 1000) : 0;
    this.resta -= q;
    return q;
  }

  get restante(): number {
    return this.resta;
  }

  get fracaoRestante(): number {
    return this.resta / this.inicial;
  }

  get despejado(): number {
    return this.inicial - this.resta;
  }

  get vazaoAtual(): number {
    return this.ultimaVazao;
  }

  get progresso(): number {
    return Math.min(1, (1 - this.fracaoRestante) / (1 - this.restanteMax));
  }

  metaAtingida(): boolean {
    return this.fracaoRestante < this.restanteMax;
  }
}
