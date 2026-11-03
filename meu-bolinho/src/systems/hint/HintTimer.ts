/**
 * Temporizador de dicas por inatividade (puro). Sem punição: só ajuda.
 *   nível 1 (6 s):  o item certo brilha no cartão da receita
 *   nível 2 (12 s): mão-fantasma demonstra o GESTO ao lado (nunca toca o objeto real)
 *   nível 3 (20 s): narração explica o passo
 * Qualquer atividade (toque, movimento, progresso) volta ao nível 0.
 * Com `ativo = false` (comemorando, forno assando, gesto em andamento) o relógio não corre.
 */
export type NivelDica = 0 | 1 | 2 | 3;

export const LIMITES_DICA_MS: readonly [number, number, number] = [6000, 12000, 20000];

export class HintTimer {
  private inativo = 0;
  private n: NivelDica = 0;

  constructor(private readonly limites: readonly [number, number, number] = LIMITES_DICA_MS) {}

  /** Avança o relógio. Retorna o nível recém-alcançado, ou null se não mudou. */
  atualizar(dtMs: number, ativo: boolean): NivelDica | null {
    if (!ativo || !(dtMs > 0)) return null;
    this.inativo += dtMs;
    let novo: NivelDica = 0;
    if (this.inativo >= this.limites[2]) novo = 3;
    else if (this.inativo >= this.limites[1]) novo = 2;
    else if (this.inativo >= this.limites[0]) novo = 1;
    if (novo > this.n) {
      this.n = novo;
      return novo;
    }
    return null;
  }

  /** A criança fez algo: as dicas somem e o relógio recomeça. Retorna true se havia dica visível. */
  atividade(): boolean {
    const havia = this.n > 0;
    this.inativo = 0;
    this.n = 0;
    return havia;
  }

  get nivel(): NivelDica {
    return this.n;
  }

  get inativoMs(): number {
    return this.inativo;
  }
}
