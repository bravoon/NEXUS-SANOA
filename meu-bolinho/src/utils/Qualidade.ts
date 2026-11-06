/**
 * Qualidade adaptativa: se o aparelho não sustenta a fluidez, o jogo entra em "modo leve"
 * (menos partículas, sem vapor/poeira). Nunca altera regras do jogo — só efeitos visuais.
 *
 * Detector (puro): média móvel exponencial do fps; abaixo de `fpsMin` por `toleranciaMs`
 * seguidos → leve. Os primeiros `aquecimentoMs` (carregamento de cena) são ignorados.
 * Uma vez leve, fica leve na sessão (evita alternar e "piscar" efeitos).
 */
export class DetectorDesempenho {
  private media = 60;
  private abaixoMs = 0;
  private decorrido = 0;
  private leve = false;

  constructor(
    private readonly fpsMin = 40,
    private readonly toleranciaMs = 3000,
    private readonly aquecimentoMs = 2000,
  ) {}

  /** Registra um quadro. Retorna true no quadro em que decide entrar no modo leve. */
  quadro(dtMs: number): boolean {
    if (this.leve || !(dtMs > 0) || dtMs > 1000) return false;
    this.decorrido += dtMs;
    const fps = 1000 / dtMs;
    this.media += (fps - this.media) * 0.05;
    if (this.decorrido < this.aquecimentoMs) return false;
    this.abaixoMs = this.media < this.fpsMin ? this.abaixoMs + dtMs : 0;
    if (this.abaixoMs >= this.toleranciaMs) {
      this.leve = true;
      return true;
    }
    return false;
  }

  /** Troca de cena: o carregamento da nova cena não conta. */
  reiniciarAquecimento(): void {
    this.decorrido = 0;
    this.abaixoMs = 0;
  }

  get modoLeve(): boolean {
    return this.leve;
  }

  get fpsMedio(): number {
    return this.media;
  }
}

/** Estado global de qualidade (uma instância por jogo). */
export const Qualidade = {
  detector: new DetectorDesempenho(),
  /** Forçar via URL: ?qualidade=leve (útil para testar em aparelho fraco). */
  forcadaLeve: typeof location !== 'undefined' && new URLSearchParams(location.search).get('qualidade') === 'leve',
  get leve(): boolean {
    return this.forcadaLeve || this.detector.modoLeve;
  },
  /** Fator de partículas (1 normal, 0,35 leve). */
  get particulas(): number {
    return this.leve ? 0.35 : 1;
  },
};
