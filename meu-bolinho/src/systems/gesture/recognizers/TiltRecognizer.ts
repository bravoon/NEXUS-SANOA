/**
 * Segurar-e-inclinar: converte deslocamento horizontal do dedo em ângulo.
 *
 * A referência é o ponto em que o dedo estava quando o recipiente entrou na zona de despejo.
 * Mover o dedo para a direita inclina (0° → 90°). Fora da zona o ângulo é 0.
 */
import { CONFIG_DESPEJAR } from '../../../config/gameplay';
import { clamp } from '../../../utils/math';

export function anguloPorDeslocamento(dxPx: number, pxPara90: number = CONFIG_DESPEJAR.pxPara90Graus): number {
  if (!Number.isFinite(dxPx)) return 0;
  return clamp((dxPx / pxPara90) * 90, 0, 90);
}

export class TiltRecognizer {
  private referenciaX: number | null = null;
  private angulo = 0;

  constructor(private readonly pxPara90: number = CONFIG_DESPEJAR.pxPara90Graus) {}

  /** Começa a inclinar a partir desta posição do dedo. */
  iniciar(dedoX: number): void {
    this.referenciaX = dedoX;
    this.angulo = 0;
  }

  /** Atualiza com a posição atual do dedo. Retorna o ângulo (graus). */
  atualizar(dedoX: number): number {
    if (this.referenciaX === null) return (this.angulo = 0);
    this.angulo = anguloPorDeslocamento(dedoX - this.referenciaX, this.pxPara90);
    return this.angulo;
  }

  /** Recuo do dedo para trás da referência (px, ≥ 0). */
  recuo(dedoX: number): number {
    return this.referenciaX === null ? 0 : Math.max(0, this.referenciaX - dedoX);
  }

  parar(): void {
    this.referenciaX = null;
    this.angulo = 0;
  }

  get ativo(): boolean {
    return this.referenciaX !== null;
  }

  get anguloGraus(): number {
    return this.angulo;
  }
}
