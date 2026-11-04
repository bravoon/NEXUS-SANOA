/**
 * Etapa "fatiar" (pura): a faca precisa ATRAVESSAR o doce passando pelo meio — de uma borda
 * à outra, num traço só. Cada corte em direção nova divide em mais fatias.
 * Traço curto, que não passa pelo meio, ou repetido na mesma direção não conta.
 *
 * Coordenadas normalizadas pela elipse que envolve o doce (centro (0,0), borda em |p| = 1).
 * REGRA: este arquivo não usa tweens nem timers (verificado por teste).
 */
import type { Ponto } from '../../utils/math';

export type ResultadoFatia = 'cortou' | 'curto' | 'fora_do_meio' | 'repetido' | 'completo';

/** Distância máxima (normalizada) da linha ao centro. */
export const TOLERANCIA_MEIO = 0.3;
/** As duas pontas do traço precisam estar além desta distância do centro (atravessou). */
export const BORDA_FATIA = 0.75;
/** Dois cortes precisam diferir pelo menos isto (graus). */
export const ANGULO_MIN_FATIA = 25;

export class SliceStep {
  readonly tipo = 'fatiar' as const;
  /** Ângulos dos cortes aceitos (graus, 0..180). */
  private readonly angulos: number[] = [];

  constructor(readonly meta: number) {
    if (!(meta >= 1)) throw new Error('meta de cortes deve ser ≥ 1');
  }

  /** Um traço da faca de `a` até `b` (normalizados). */
  cortar(a: Ponto, b: Ponto): ResultadoFatia {
    if (this.metaAtingida()) return 'completo';
    if (Math.hypot(a.x, a.y) < BORDA_FATIA || Math.hypot(b.x, b.y) < BORDA_FATIA) return 'curto';
    const dx = b.x - a.x, dy = b.y - a.y;
    const L = Math.hypot(dx, dy);
    if (L < 2 * BORDA_FATIA) return 'curto';
    // distância do centro à reta ab, e o centro precisa estar ENTRE as pontas
    const t = -(a.x * dx + a.y * dy) / (L * L);
    const dist = Math.abs(a.x * dy - a.y * dx) / L;
    if (dist > TOLERANCIA_MEIO || t < 0 || t > 1) return 'fora_do_meio';
    const ang = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 180;
    const perto = this.angulos.some((x) => {
      const d = Math.abs(x - ang) % 180;
      return Math.min(d, 180 - d) < ANGULO_MIN_FATIA;
    });
    if (perto) return 'repetido';
    this.angulos.push(ang);
    return 'cortou';
  }

  get cortes(): readonly number[] {
    return this.angulos;
  }

  /** Fatias resultantes (cada corte pelo meio acrescenta 2). */
  get fatias(): number {
    return this.angulos.length === 0 ? 1 : this.angulos.length * 2;
  }

  get progresso(): number {
    return Math.min(1, this.angulos.length / this.meta);
  }

  metaAtingida(): boolean {
    return this.angulos.length >= this.meta;
  }
}
