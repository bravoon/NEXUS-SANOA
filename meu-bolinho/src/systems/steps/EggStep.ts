/**
 * Etapa "quebrar_ovo" (pura).
 * Cada ovo: a criança o leva até a borda da tigela (a cena chama `apoiarNaBorda`) e toca
 * duas vezes: 1º toque trinca, 2º abre. Toques a menos de `cooldownMs` do anterior são ignorados.
 * Modo Confeiteiro: ao abrir, pode cair casca (rng injetado → testável); a casca precisa ser
 * retirada com a colher antes de concluir.
 *
 * REGRA: este arquivo não usa tweens nem timers (verificado por teste).
 */
import { CONFIG_OVO } from '../../config/gameplay';

export type EstadoOvo = 'na_caixa' | 'na_borda' | 'trincado' | 'aberto';
export type ResultadoToque = 'ignorado' | 'trincou' | 'abriu' | 'fora_da_borda';

export class EggStep {
  readonly tipo = 'quebrar_ovo' as const;
  private abertos = 0;
  private cascas = 0;
  private estado: EstadoOvo = 'na_caixa';
  private ultimoToque = Number.NEGATIVE_INFINITY;
  private caiuCascaNoUltimo = false;

  constructor(
    readonly quantidade: number,
    readonly comCasca: boolean,
    private readonly rng: () => number = Math.random,
    private readonly cfg = CONFIG_OVO,
  ) {
    if (!(quantidade >= 1) || !Number.isInteger(quantidade)) throw new Error('quantidade de ovos inválida');
  }

  /** Ovo atual colocado na zona de impacto (borda da tigela). */
  apoiarNaBorda(): boolean {
    if (this.terminouOvos || this.estado !== 'na_caixa') return false;
    this.estado = 'na_borda';
    return true;
  }

  /** O ovo foi tirado da borda antes de trincar (volta para a caixa). */
  tirarDaBorda(): void {
    if (this.estado === 'na_borda') this.estado = 'na_caixa';
  }

  toque(tMs: number): ResultadoToque {
    if (this.estado !== 'na_borda' && this.estado !== 'trincado') return 'fora_da_borda';
    if (tMs - this.ultimoToque < this.cfg.cooldownMs) return 'ignorado';
    this.ultimoToque = tMs;
    if (this.estado === 'na_borda') {
      this.estado = 'trincado';
      return 'trincou';
    }
    this.abertos++;
    this.caiuCascaNoUltimo = this.comCasca && this.rng() < this.cfg.chanceCasca;
    if (this.caiuCascaNoUltimo) this.cascas++;
    // próximo ovo (se houver) volta a estar "na caixa"
    this.estado = this.terminouOvos ? 'aberto' : 'na_caixa';
    return 'abriu';
  }

  /** Colherada que pega uma casca. Retorna true se havia casca. */
  retirarCasca(): boolean {
    if (this.cascas <= 0) return false;
    this.cascas--;
    return true;
  }

  get estadoOvo(): EstadoOvo {
    return this.estado;
  }

  get ovosAbertos(): number {
    return this.abertos;
  }

  get cascasNaTigela(): number {
    return this.cascas;
  }

  get caiuCasca(): boolean {
    return this.caiuCascaNoUltimo;
  }

  get terminouOvos(): boolean {
    return this.abertos >= this.quantidade;
  }

  get progresso(): number {
    return this.abertos / this.quantidade;
  }

  erroPendente(): boolean {
    return this.cascas > 0;
  }

  metaAtingida(): boolean {
    return this.terminouOvos && this.cascas === 0;
  }
}
