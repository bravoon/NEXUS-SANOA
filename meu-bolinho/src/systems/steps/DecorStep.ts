/**
 * Etapa "decorar" (pura): cobertura (CoverageStep) → [glacê: seguir o desenho, se a receita
 * pedir] → enfeites livres. O botão "Pronto!" só aparece depois das partes obrigatórias e
 * apenas encerra a parte criativa; ele não executa nenhuma ação no bolo.
 *
 * REGRA: este arquivo não usa tweens nem timers (verificado por teste).
 */
import type { GlaceResolvido } from '../recipe/recipeTypes';
import { Decoracao } from '../decoration/Decoracao';
import type { Ponto } from '../../utils/math';
import { CoverageStep } from './CoverageStep';
import { TraceStep } from './TraceStep';

export type FaseDecorar = 'cobrir' | 'glace' | 'enfeitar';

export class DecorStep {
  readonly tipo = 'decorar' as const;
  readonly cobertura: CoverageStep;
  readonly decoracao = new Decoracao();
  private traco: TraceStep | null = null;
  private pronto = false;

  constructor(
    metaCobertura: number,
    readonly corCobertura: number,
    readonly glace: GlaceResolvido | null = null,
  ) {
    this.cobertura = new CoverageStep('cobrir', metaCobertura);
  }

  /** A cena define o caminho do desenho (coordenadas de tela) quando a cobertura fica pronta. */
  definirGlace(caminho: readonly Ponto[]): void {
    if (!this.glace || this.traco) return;
    this.traco = new TraceStep(caminho, this.glace.tolerancia, this.glace.tracado);
  }

  get tracoGlace(): TraceStep | null {
    return this.traco;
  }

  /** A cobertura mínima já foi atingida. */
  get coberturaOk(): boolean {
    return this.cobertura.metaAtingida();
  }

  get glaceOk(): boolean {
    return !this.glace || (this.traco?.metaAtingida() ?? false);
  }

  get fase(): FaseDecorar {
    if (!this.coberturaOk) return 'cobrir';
    if (!this.glaceOk) return 'glace';
    return 'enfeitar';
  }

  /** Toque em "Pronto!". Só vale depois da cobertura (e do glacê, se houver). */
  finalizar(): boolean {
    if (this.fase !== 'enfeitar') return false;
    this.pronto = true;
    return true;
  }

  fimDoGesto(): void {
    this.cobertura.fimDoGesto();
    this.traco?.fimDoGesto();
  }

  get progresso(): number {
    if (!this.glace) return this.cobertura.progresso;
    return this.cobertura.progresso * 0.5 + (this.traco?.progresso ?? 0) * 0.5;
  }

  metaAtingida(): boolean {
    return this.pronto;
  }
}
