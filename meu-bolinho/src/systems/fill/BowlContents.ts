/**
 * Conteúdo de um recipiente-alvo em camadas (pura). A ordem das camadas é a ordem de entrada,
 * o que permite desenhar "ingredientes separados" antes de mexer.
 */
export interface Camada {
  item: string;
  quantidade: number;
}

export class BowlContents {
  private camadas: Camada[] = [];

  constructor(readonly capacidade: number) {}

  adicionar(item: string, quantidade: number): void {
    if (!(quantidade > 0)) return;
    const topo = this.camadas[this.camadas.length - 1];
    if (topo && topo.item === item) topo.quantidade += quantidade;
    else this.camadas.push({ item, quantidade });
  }

  /** Remove até `quantidade` de `item` (da camada mais alta para a mais baixa). Retorna o removido. */
  remover(item: string, quantidade: number): number {
    let falta = quantidade;
    for (let i = this.camadas.length - 1; i >= 0 && falta > 0; i--) {
      const c = this.camadas[i];
      if (!c || c.item !== item) continue;
      const tirar = Math.min(c.quantidade, falta);
      c.quantidade -= tirar;
      falta -= tirar;
      if (c.quantidade <= 1e-9) this.camadas.splice(i, 1);
    }
    return quantidade - falta;
  }

  /** Remove `quantidade` de todas as camadas na mesma proporção (massa já misturada). */
  removerProporcional(quantidade: number): number {
    const total = this.total;
    if (total <= 0 || quantidade <= 0) return 0;
    const fator = Math.max(0, 1 - quantidade / total);
    for (const c of this.camadas) c.quantidade *= fator;
    this.camadas = this.camadas.filter((c) => c.quantidade > 1e-9);
    return total - this.total;
  }

  quantidadeDe(item: string): number {
    return this.camadas.reduce((s, c) => (c.item === item ? s + c.quantidade : s), 0);
  }

  get total(): number {
    return this.camadas.reduce((s, c) => s + c.quantidade, 0);
  }

  /** Nível de 0 a 1 em relação à capacidade. */
  get nivel(): number {
    return Math.min(1, this.total / this.capacidade);
  }

  get lista(): readonly Readonly<Camada>[] {
    return this.camadas;
  }
}
