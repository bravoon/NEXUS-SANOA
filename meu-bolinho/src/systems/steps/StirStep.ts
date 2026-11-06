/**
 * Etapa "mexer" (pura). Embrulha o AngularAccumulator e expõe o progresso 0..1.
 * A cena converte a elipse da tigela em círculo antes de chamar `amostra()`
 * (coordenadas normalizadas: raio 1 = borda da área de mexer).
 *
 * REGRA: este arquivo não usa tweens nem timers (verificado por teste).
 */
import { AngularAccumulator, type ResultadoAmostra } from '../gesture/recognizers/AngularAccumulator';
import { TAU } from '../../utils/math';

/** Raio do espaço normalizado: usamos 100 "unidades" para manter movimentoMinPx em escala de pixels. */
export const RAIO_NORMALIZADO = 100;

export class StirStep {
  readonly tipo = 'mexer' as const;
  readonly acumulador: AngularAccumulator;

  constructor(readonly voltasMeta: number) {
    if (!(voltasMeta > 0)) throw new Error('voltasMeta deve ser > 0');
    this.acumulador = new AngularAccumulator({ x: 0, y: 0 }, RAIO_NORMALIZADO);
  }

  /** (nx, ny) no espaço normalizado, centro (0,0), raio RAIO_NORMALIZADO. */
  amostra(nx: number, ny: number, tMs: number): ResultadoAmostra {
    return this.acumulador.addSample(nx, ny, tMs);
  }

  fimDoGesto(): void {
    this.acumulador.endGesture();
  }

  get voltas(): number {
    return this.acumulador.voltas;
  }

  get progresso(): number {
    return Math.min(1, this.acumulador.voltas / this.voltasMeta);
  }

  /** Progresso "quase contando" (trecho ainda abaixo de meia volta), só visual. */
  get progressoPendente(): number {
    return this.acumulador.pendenteRad / TAU / this.voltasMeta;
  }

  metaAtingida(): boolean {
    return this.acumulador.voltas >= this.voltasMeta - 1e-9;
  }
}
