/**
 * Batedor (bater claras): conta BATIDAS = inversões de sentido de um movimento rápido e
 * amplo, em qualquer eixo (vai e vem lateral, vertical ou em roda). Puro.
 *
 * Uma batida conta quando o dedo inverte o sentido depois de percorrer ≥ amplitudeMin px
 * com velocidade média ≥ velocidadeMin. Tremor (pouca amplitude), arrastar reto (sem
 * inversão), movimento lento e dedo parado não contam.
 */
import { CONFIG_BATER } from '../../../config/gameplay';

interface Eixo {
  sentido: -1 | 0 | 1;
  extremo: number;
  tExtremo: number;
  ultimo: number;
  tUltimo: number;
}

const novoEixo = (v: number, t: number): Eixo => ({ sentido: 0, extremo: v, tExtremo: t, ultimo: v, tUltimo: t });

export class WhiskRecognizer {
  private ex: Eixo | null = null;
  private ey: Eixo | null = null;
  private ultimaBatida = Number.NEGATIVE_INFINITY;

  constructor(private readonly cfg = CONFIG_BATER) {}

  /** Amostra do dedo; `dentro` = o batedor está dentro da tigela. Retorna batidas novas (0 ou 1). */
  amostra(x: number, y: number, tMs: number, dentro: boolean): number {
    if (!dentro) {
      this.parar();
      return 0;
    }
    if (!this.ex || !this.ey) {
      this.ex = novoEixo(x, tMs);
      this.ey = novoEixo(y, tMs);
      return 0;
    }
    const bx = this.eixo(this.ex, x, tMs);
    const by = this.eixo(this.ey, y, tMs);
    if ((bx || by) && tMs - this.ultimaBatida >= this.cfg.intervaloMinMs) {
      this.ultimaBatida = tMs;
      return 1;
    }
    return 0;
  }

  private eixo(e: Eixo, v: number, t: number): boolean {
    const d = v - e.ultimo;
    if (Math.abs(d) < 0.5) return false;
    const s: -1 | 1 = d > 0 ? 1 : -1;
    let valeu = false;
    if (e.sentido === 0) e.sentido = s;
    else if (s !== e.sentido) {
      // inverteu no ponto anterior: o traço foi de `extremo` até `ultimo`
      const amplitude = Math.abs(e.ultimo - e.extremo);
      const dur = Math.max(1, e.tUltimo - e.tExtremo);
      valeu = amplitude >= this.cfg.amplitudeMin && amplitude / dur >= this.cfg.velocidadeMin;
      e.extremo = e.ultimo;
      e.tExtremo = e.tUltimo;
      e.sentido = s;
    }
    e.ultimo = v;
    e.tUltimo = t;
    return valeu;
  }

  parar(): void {
    this.ex = null;
    this.ey = null;
  }
}
