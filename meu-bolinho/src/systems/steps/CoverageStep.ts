/**
 * Etapas de cobertura (untar a forma; cobrir o bolo). Pura.
 * A cena define a superfície (área + máscara) com `definirSuperficie` e chama `pintar`
 * a cada amostra do dedo. Sem amostra, nada é pintado.
 *
 * REGRA: este arquivo não usa tweens nem timers (verificado por teste).
 */
import { CONFIG_COBERTURA } from '../../config/gameplay';
import { CoverageGrid, type Mascara, type Retangulo } from '../coverage/CoverageGrid';

export class CoverageStep {
  readonly tipo: 'untar' | 'cobrir';
  private grade: CoverageGrid | null = null;
  private anterior: { x: number; y: number } | null = null;

  constructor(
    tipo: 'untar' | 'cobrir',
    readonly meta: number,
    readonly raioPincel: number = tipo === 'untar' ? CONFIG_COBERTURA.raioPincelUntar : CONFIG_COBERTURA.raioPincelCobertura,
  ) {
    if (!(meta > 0 && meta <= 1)) throw new Error('meta de cobertura deve estar em (0, 1]');
    this.tipo = tipo;
  }

  definirSuperficie(area: Retangulo, mascara: Mascara): void {
    this.grade = new CoverageGrid(area, CONFIG_COBERTURA.colunas, CONFIG_COBERTURA.linhas, mascara);
  }

  /** Amostra do dedo pintando. Retorna o segmento pintado (para o visual) ou null. */
  pintar(x: number, y: number): { x0: number; y0: number; x1: number; y1: number } | null {
    if (!this.grade) return null;
    const ant = this.anterior ?? { x, y };
    this.anterior = { x, y };
    this.grade.pintarSegmento(ant.x, ant.y, x, y, this.raioPincel);
    return { x0: ant.x, y0: ant.y, x1: x, y1: y };
  }

  /** Dedo levantou: a próxima pincelada não liga com a anterior. */
  fimDoGesto(): void {
    this.anterior = null;
  }

  get superficie(): CoverageGrid | null {
    return this.grade;
  }

  get cobertura(): number {
    return this.grade?.razao ?? 0;
  }

  get progresso(): number {
    return Math.min(1, this.cobertura / this.meta);
  }

  metaAtingida(): boolean {
    return this.cobertura >= this.meta - 1e-9;
  }
}
