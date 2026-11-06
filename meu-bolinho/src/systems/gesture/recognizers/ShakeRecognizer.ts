/**
 * Sacudir (vai e vem rápido na horizontal). Puro.
 * Conta inversões de sinal da velocidade horizontal com |vx| acima do mínimo; ao juntar
 * `inversoesPorPorcao` inversões dentro da janela, emite uma porção e recomeça a contagem.
 * Parou de sacudir → nenhuma porção nova.
 */
import { CONFIG_SACUDIR } from '../../../config/gameplay';

export interface ConfigSacudir {
  readonly janelaMs: number;
  readonly velocidadeMin: number;
  readonly inversoesPorPorcao: number;
}

export class ShakeRecognizer {
  private anterior: { x: number; t: number } | null = null;
  private sinal: -1 | 0 | 1 = 0;
  private inversoes: number[] = [];
  private ultimaVx = 0;

  constructor(private readonly cfg: ConfigSacudir = CONFIG_SACUDIR) {}

  /** Alimenta uma amostra; retorna quantas porções foram emitidas (0 ou 1). */
  amostra(x: number, tMs: number): number {
    const ant = this.anterior;
    this.anterior = { x, t: tMs };
    if (!ant) return 0;
    const dt = tMs - ant.t;
    if (!(dt > 0)) return 0;
    const vx = (x - ant.x) / dt;
    this.ultimaVx = vx;
    if (Math.abs(vx) < this.cfg.velocidadeMin) return 0;
    const s: -1 | 1 = vx > 0 ? 1 : -1;
    if (this.sinal !== 0 && s !== this.sinal) this.inversoes.push(tMs);
    this.sinal = s;
    this.inversoes = this.inversoes.filter((t) => tMs - t <= this.cfg.janelaMs);
    if (this.inversoes.length >= this.cfg.inversoesPorPorcao) {
      this.inversoes = [];
      return 1;
    }
    return 0;
  }

  parar(): void {
    this.anterior = null;
    this.sinal = 0;
    this.inversoes = [];
    this.ultimaVx = 0;
  }

  get velocidadeX(): number {
    return this.ultimaVx;
  }

  get inversoesNaJanela(): number {
    return this.inversoes.length;
  }
}
