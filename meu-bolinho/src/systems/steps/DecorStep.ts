/**
 * Etapa "decorar" (pura): primeiro a cobertura (CoverageStep), depois enfeites livres.
 * O botão "Pronto!" só aparece depois da cobertura mínima e apenas encerra a parte criativa;
 * ele não executa nenhuma ação no bolo.
 *
 * REGRA: este arquivo não usa tweens nem timers (verificado por teste).
 */
import { Decoracao } from '../decoration/Decoracao';
import { CoverageStep } from './CoverageStep';

export class DecorStep {
  readonly tipo = 'decorar' as const;
  readonly cobertura: CoverageStep;
  readonly decoracao = new Decoracao();
  private pronto = false;

  constructor(
    metaCobertura: number,
    readonly corCobertura: number,
  ) {
    this.cobertura = new CoverageStep('cobrir', metaCobertura);
  }

  /** A cobertura mínima já foi atingida (enfeites e "Pronto!" liberados). */
  get coberturaOk(): boolean {
    return this.cobertura.metaAtingida();
  }

  /** Toque em "Pronto!". Só vale depois da cobertura mínima. */
  finalizar(): boolean {
    if (!this.coberturaOk) return false;
    this.pronto = true;
    return true;
  }

  fimDoGesto(): void {
    this.cobertura.fimDoGesto();
  }

  get progresso(): number {
    return this.cobertura.progresso;
  }

  metaAtingida(): boolean {
    return this.pronto;
  }
}
