/**
 * Reconhecedor de rotação circular (mexer, timer do forno).
 *
 * Algoritmo por amostra:
 *  1. r = distância ao centro / raio. Fora do anel [anelInterno, anelExterno] → descarta
 *     e esquece a amostra anterior (o retorno ao anel não gera salto).
 *  2. Movimento < movimentoMinPx desde a última amostra avaliada → aguarda (filtra tremor).
 *  3. d = normalizar(ângulo − ânguloAnterior) em [-π, π].
 *  4. |d| > saltoMax → salto, descarta.  |d|/dt < velocidadeAngularMin → parado, descarta.
 *  5. d alimenta o "trecho" atual (rotação contínua num mesmo sentido, com histerese).
 *
 * Contagem por trechos: um trecho só passa a contar depois de varrer `limiarTrecho` (π).
 * A partir daí conta ao vivo. Consequências:
 *  - Linha reta nunca conta: qualquer segmento de reta visto do centro varre menos de π.
 *  - "Vai e vem" nunca conta: cada inversão inicia um trecho novo, que nunca chega a π.
 *  - Trocar de sentido no meio NÃO faz o progresso voltar (sem punição para a criança);
 *    o novo sentido passa a contar depois de meia volta.
 *  - Soltar o dedo encerra o trecho; a parte ainda não contada é descartada.
 *
 * O progresso só aumenta dentro de addSample(): sem amostra nova, nada muda.
 */
import { CONFIG_MEXER, type ConfigMexer } from '../../../config/gameplay';
import { TAU, normalizarAngulo, type Ponto } from '../../../utils/math';

export type MotivoAmostra =
  | 'aceita'
  | 'inicio'
  | 'fora_do_anel'
  | 'pouco_movimento'
  | 'salto'
  | 'parado'
  | 'tempo_invalido';

export interface ResultadoAmostra {
  motivo: MotivoAmostra;
  /** Delta angular aceito (rad, com sinal). 0 se descartado. */
  delta: number;
  /** Quanto o total contado aumentou com esta amostra (rad, ≥ 0). */
  ganho: number;
}

interface AmostraAnterior {
  x: number;
  y: number;
  t: number;
  angulo: number;
}

export class AngularAccumulator {
  private anterior: AmostraAnterior | null = null;

  /** Total contado (rad). Nunca diminui. */
  private total = 0;

  // Trecho atual
  private sentido: -1 | 0 | 1 = 0;
  private liquido = 0; // rotação com sinal desde o início do trecho
  private pico = 0; // maior avanço no sentido do trecho
  private jaContado = 0; // parte do pico já somada ao total

  private ultimaVelocidade = 0;
  private ultimoAngulo = 0;
  private ultimoMotivo: MotivoAmostra = 'inicio';

  constructor(
    private centro: Ponto,
    private raio: number,
    private readonly cfg: ConfigMexer = CONFIG_MEXER,
  ) {
    if (!(raio > 0)) throw new Error('raio deve ser > 0');
  }

  /** Alimenta uma amostra do ponteiro. `tMs` é o timestamp em milissegundos. */
  addSample(x: number, y: number, tMs: number): ResultadoAmostra {
    const dx = x - this.centro.x;
    const dy = y - this.centro.y;
    const r = Math.hypot(dx, dy) / this.raio;
    const angulo = Math.atan2(dy, dx);

    if (r < this.cfg.anelInterno || r > this.cfg.anelExterno) {
      this.anterior = null;
      return this.resultado('fora_do_anel', 0, 0);
    }

    const ant = this.anterior;
    if (!ant) {
      this.anterior = { x, y, t: tMs, angulo };
      this.ultimoAngulo = angulo;
      return this.resultado('inicio', 0, 0);
    }

    if (Math.hypot(x - ant.x, y - ant.y) < this.cfg.movimentoMinPx) {
      return this.resultado('pouco_movimento', 0, 0);
    }

    const dtSeg = (tMs - ant.t) / 1000;
    this.anterior = { x, y, t: tMs, angulo };
    this.ultimoAngulo = angulo;
    if (!(dtSeg > 0)) return this.resultado('tempo_invalido', 0, 0);

    const d = normalizarAngulo(angulo - ant.angulo);
    if (Math.abs(d) > this.cfg.saltoMax) return this.resultado('salto', 0, 0);

    const w = Math.abs(d) / dtSeg;
    this.ultimaVelocidade = w;
    if (w < this.cfg.velocidadeAngularMin) return this.resultado('parado', 0, 0);

    const ganho = this.acumular(d);
    return this.resultado('aceita', d, ganho);
  }

  /** O dedo saiu da tela: encerra o trecho. O que não foi contado é descartado. */
  endGesture(): void {
    this.anterior = null;
    this.iniciarTrecho(0, 0);
    this.ultimaVelocidade = 0;
  }

  /** Zera tudo (nova etapa). */
  reset(centro?: Ponto, raio?: number): void {
    if (centro) this.centro = centro;
    if (raio !== undefined) this.raio = raio;
    this.total = 0;
    this.endGesture();
  }

  /** Total contado em radianos. */
  get totalRad(): number {
    return this.total;
  }

  /** Voltas contadas (= total / 2π). */
  get voltas(): number {
    return this.total / TAU;
  }

  /** Rotação do trecho atual que ainda não conta (para feedback visual "quase"). */
  get pendenteRad(): number {
    return this.pico >= this.cfg.limiarTrecho ? 0 : this.pico;
  }

  get velocidadeAngular(): number {
    return this.ultimaVelocidade;
  }

  /** Ângulo atual do dedo (rad), para animar a colher e o redemoinho. */
  get anguloAtual(): number {
    return this.ultimoAngulo;
  }

  get motivo(): MotivoAmostra {
    return this.ultimoMotivo;
  }

  get sentidoAtual(): -1 | 0 | 1 {
    return this.sentido;
  }

  // ---------------------------------------------------------------------------

  private acumular(d: number): number {
    this.liquido += d;

    if (this.sentido === 0) {
      if (Math.abs(this.liquido) >= this.cfg.histerese) {
        this.sentido = this.liquido > 0 ? 1 : -1;
        this.pico = Math.abs(this.liquido);
      }
      return this.contar();
    }

    const avanco = this.sentido * this.liquido;
    if (avanco > this.pico) this.pico = avanco;

    const recuo = this.pico - avanco;
    if (recuo > this.cfg.histerese) {
      // Inversão de sentido: o recuo vira o começo de um trecho novo no sentido oposto.
      const novoSentido = this.sentido === 1 ? -1 : 1;
      this.iniciarTrecho(novoSentido, recuo);
    }
    return this.contar();
  }

  private iniciarTrecho(sentido: -1 | 0 | 1, inicial: number): void {
    this.sentido = sentido;
    this.liquido = sentido * inicial;
    this.pico = inicial;
    this.jaContado = 0;
  }

  private contar(): number {
    if (this.sentido === 0 || this.pico < this.cfg.limiarTrecho) return 0;
    const ganho = this.pico - this.jaContado;
    if (ganho <= 0) return 0;
    this.jaContado = this.pico;
    this.total += ganho;
    return ganho;
  }

  private resultado(motivo: MotivoAmostra, delta: number, ganho: number): ResultadoAmostra {
    this.ultimoMotivo = motivo;
    return { motivo, delta, ganho };
  }
}
