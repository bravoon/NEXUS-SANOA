/**
 * Etapa "decorar" (pura): cobertura (CoverageStep) → [glacê: seguir o desenho, se a receita
 * pedir] → [polvilhar: sacudir o polvilhador sobre o bolo, se a receita pedir] → enfeites livres. O botão "Pronto!" só aparece depois das partes obrigatórias e
 * apenas encerra a parte criativa; ele não executa nenhuma ação no bolo.
 *
 * REGRA: este arquivo não usa tweens nem timers (verificado por teste).
 */
import type { GlaceResolvido, PolvilhoResolvido } from '../recipe/recipeTypes';
import { Decoracao } from '../decoration/Decoracao';
import type { Ponto } from '../../utils/math';
import { CoverageStep } from './CoverageStep';
import { SprinkleStep } from './SprinkleStep';
import { TraceStep } from './TraceStep';

export type FaseDecorar = 'cobrir' | 'glace' | 'polvilhar' | 'enfeitar';

export class DecorStep {
  readonly tipo = 'decorar' as const;
  readonly cobertura: CoverageStep;
  readonly decoracao = new Decoracao();
  private traco: TraceStep | null = null;
  readonly polvilhador: SprinkleStep | null;
  private pronto = false;

  constructor(
    metaCobertura: number,
    readonly corCobertura: number,
    readonly glace: GlaceResolvido | null = null,
    readonly polvilho: PolvilhoResolvido | null = null,
  ) {
    this.cobertura = new CoverageStep('cobrir', metaCobertura);
    this.polvilhador = polvilho ? new SprinkleStep(polvilho.cobertura) : null;
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

  get polvilhoOk(): boolean {
    return !this.polvilhador || this.polvilhador.metaAtingida();
  }

  get fase(): FaseDecorar {
    if (!this.coberturaOk) return 'cobrir';
    if (!this.glaceOk) return 'glace';
    if (!this.polvilhoOk) return 'polvilhar';
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
    this.polvilhador?.fimDoGesto();
  }

  get progresso(): number {
    const partes = [this.cobertura.progresso];
    if (this.glace) partes.push(this.traco?.progresso ?? 0);
    if (this.polvilhador) partes.push(this.polvilhador.progresso);
    return partes.reduce((a, b) => a + b, 0) / partes.length;
  }

  metaAtingida(): boolean {
    return this.pronto;
  }
}
