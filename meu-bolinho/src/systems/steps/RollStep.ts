/**
 * Etapa "abrir_massa" (pura): 1) a criança leva a bola de massa da tigela até a forma;
 * 2) passa o rolo para a frente e para trás em cima da massa — cada passada ampla e firme
 * abre um pouco mais. Rolo parado, fora da massa ou tremendo = a massa não abre.
 *
 * REGRA: este arquivo não usa tweens nem timers (verificado por teste).
 */
import { CONFIG_ROLO } from '../../config/gameplay';
import { WhiskRecognizer } from '../gesture/recognizers/WhiskRecognizer';

export class RollStep {
  readonly tipo = 'abrir_massa' as const;
  private readonly rolo = new WhiskRecognizer(CONFIG_ROLO);
  private naForma = false;
  private n = 0;

  constructor(readonly meta: number) {
    if (!(meta >= 1)) throw new Error('meta de passadas deve ser ≥ 1');
  }

  /** A bola de massa foi solta em cima da forma. */
  colocarMassa(): boolean {
    if (this.naForma) return false;
    this.naForma = true;
    return true;
  }

  get massaNaForma(): boolean {
    return this.naForma;
  }

  /** Amostra do rolo; `sobreMassa` = o rolo está em cima da massa. Retorna passadas novas. */
  amostra(x: number, y: number, tMs: number, sobreMassa: boolean): number {
    if (!this.naForma || this.metaAtingida()) return 0;
    const b = this.rolo.amostra(x, y, tMs, sobreMassa);
    this.n += b;
    return b;
  }

  fimDoGesto(): void {
    this.rolo.parar();
  }

  get passadas(): number {
    return this.n;
  }

  /** 0..1: quanto a massa já foi aberta. */
  get abertura(): number {
    return Math.min(1, this.n / this.meta);
  }

  get progresso(): number {
    return (this.naForma ? 0.15 : 0) + 0.85 * this.abertura;
  }

  metaAtingida(): boolean {
    return this.naForma && this.n >= this.meta;
  }
}
