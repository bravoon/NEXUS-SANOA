/**
 * Etapa "desenformar" (pura): colocar o prato sobre a forma e fazer swipe para baixo.
 * A virada acompanha o dedo (`progressoVirada`); soltar sem cumprir distância e
 * velocidade mínimas desfaz a virada (a forma volta, nada é concluído).
 *
 * REGRA: este arquivo não usa tweens nem timers (verificado por teste).
 */
import { SwipeRecognizer, type ResultadoSwipe } from '../gesture/recognizers/SwipeRecognizer';

export class UnmoldStep {
  readonly tipo = 'desenformar' as const;
  readonly swipe = new SwipeRecognizer();
  private prato = false;
  private feito = false;
  private virada = 0;
  private ultimo: ResultadoSwipe | null = null;

  colocarPrato(): void {
    this.prato = true;
  }

  get pratoColocado(): boolean {
    return this.prato;
  }

  iniciarSwipe(x: number, y: number, tMs: number): boolean {
    if (!this.prato || this.feito) return false;
    this.swipe.inicio(x, y, tMs);
    return true;
  }

  moverSwipe(x: number, y: number, tMs: number): number {
    if (this.feito) return 1;
    this.virada = this.swipe.mover(x, y, tMs);
    return this.virada;
  }

  terminarSwipe(x: number, y: number, tMs: number): ResultadoSwipe {
    const r = this.swipe.fim(x, y, tMs);
    this.ultimo = r;
    if (r === 'ok') this.feito = true;
    else this.virada = 0;
    return r;
  }

  get progressoVirada(): number {
    return this.feito ? 1 : this.virada;
  }

  get ultimoResultado(): ResultadoSwipe | null {
    return this.ultimo;
  }

  get progresso(): number {
    return this.feito ? 1 : this.prato ? 0.5 : 0;
  }

  metaAtingida(): boolean {
    return this.feito;
  }
}
