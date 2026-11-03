/**
 * Etapa "rechear": espalhar o recheio na camada de baixo (cobertura) e depois assentar a
 * camada de cima com o dedo. A camada fica ONDE a criança soltou (sem encaixe automático);
 * vale se ficou a até `tolerancia` px do centro. Puro.
 *
 * REGRA: este arquivo não usa tweens nem timers (verificado por teste).
 */
import { CONFIG_RECHEAR } from '../../config/gameplay';
import { CoverageStep } from './CoverageStep';

export class FillLayerStep {
  readonly tipo = 'rechear' as const;
  readonly recheio: CoverageStep;
  private colocada: { dx: number; dy: number } | null = null;

  constructor(
    metaCobertura: number,
    readonly corRecheio: number,
    readonly tolerancia: number = CONFIG_RECHEAR.toleranciaCamadaPx,
  ) {
    this.recheio = new CoverageStep('cobrir', metaCobertura);
  }

  get recheioOk(): boolean {
    return this.recheio.metaAtingida();
  }

  /**
   * A criança soltou a camada de cima a (dx, dy) do lugar certo.
   * Retorna true se assentou (dentro da tolerância e com recheio suficiente).
   */
  soltarCamada(dx: number, dy: number): boolean {
    if (!this.recheioOk || this.colocada) return false;
    if (Math.hypot(dx, dy) > this.tolerancia) return false;
    this.colocada = { dx, dy };
    return true;
  }

  /** Deslocamento com que a camada ficou (o bolo é montado exatamente ali). */
  get deslocamento(): { dx: number; dy: number } | null {
    return this.colocada;
  }

  fimDoGesto(): void {
    this.recheio.fimDoGesto();
  }

  get progresso(): number {
    return this.colocada ? 1 : this.recheio.progresso * 0.8;
  }

  metaAtingida(): boolean {
    return this.recheioOk && this.colocada !== null;
  }
}
