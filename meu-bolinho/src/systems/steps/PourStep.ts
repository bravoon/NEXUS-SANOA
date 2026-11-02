/**
 * Etapa "despejar" (pura).
 *
 * - O progresso é `despejado / quantidade` e só muda dentro de `tick()` com o dedo segurando,
 *   ou em `retirarColherada()` (gesto manual da colher).
 * - Meta: despejado dentro da faixa [q·(1−tol), q·(1+tol)].
 * - Passou da faixa → `emExcesso` (a cena reporta ERRO 'excesso' à FSM).
 * - Cada colherada retira q·tol: menor que a largura da faixa (2·q·tol), então nunca
 *   "pula" a faixa para baixo. Só é possível retirar enquanto houver excesso.
 *
 * REGRA: este arquivo não usa tweens nem timers (verificado por teste).
 */
import { CONFIG_DESPEJAR, type Material } from '../../config/gameplay';
import { quantidadeDespejada, type EntradaDespejo } from '../fill/pourFlow';

export interface ParamsDespejar {
  item: string;
  quantidade: number;
  tolerancia: number;
  material: Material;
}

export class PourStep {
  readonly tipo = 'despejar' as const;
  private despejadoTotal = 0;
  private restante: number;
  private ultimaVazao = 0;

  constructor(readonly params: ParamsDespejar) {
    if (!(params.quantidade > 0)) throw new Error('quantidade deve ser > 0');
    this.restante = params.quantidade * CONFIG_DESPEJAR.fatorCapacidade;
  }

  /** Avança a física de despejo. Retorna a quantidade que saiu neste intervalo. */
  tick(entrada: EntradaDespejo, dtMs: number): number {
    const q = quantidadeDespejada(entrada, this.params.material, this.restante, dtMs);
    this.ultimaVazao = dtMs > 0 ? q / (dtMs / 1000) : 0;
    if (q <= 0) return 0;
    this.restante -= q;
    this.despejadoTotal += q;
    return q;
  }

  /** Remove uma colherada do excesso. Retorna quanto foi removido (0 se não há excesso). */
  retirarColherada(): number {
    if (!this.emExcesso) return 0;
    const q = Math.min(this.tamanhoColherada, this.despejadoTotal);
    this.despejadoTotal -= q;
    return q;
  }

  get tamanhoColherada(): number {
    return this.params.quantidade * this.params.tolerancia;
  }

  get despejado(): number {
    return this.despejadoTotal;
  }

  get disponivel(): number {
    return this.restante;
  }

  get capacidade(): number {
    return this.params.quantidade * CONFIG_DESPEJAR.fatorCapacidade;
  }

  get limiteInferior(): number {
    return this.params.quantidade * (1 - this.params.tolerancia);
  }

  get limiteSuperior(): number {
    return this.params.quantidade * (1 + this.params.tolerancia);
  }

  get emExcesso(): boolean {
    return this.despejadoTotal > this.limiteSuperior + 1e-9;
  }

  /** 0..1 (pode passar de 1 em caso de excesso — a barra mostra isso). */
  get progresso(): number {
    return this.despejadoTotal / this.params.quantidade;
  }

  /** Vazão do último tick (xícaras/s), para o modo debug. */
  get vazaoAtual(): number {
    return this.ultimaVazao;
  }

  metaAtingida(): boolean {
    return this.despejadoTotal >= this.limiteInferior - 1e-9 && !this.emExcesso;
  }
}
