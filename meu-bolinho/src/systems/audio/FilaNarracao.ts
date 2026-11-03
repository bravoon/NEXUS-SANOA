/**
 * Fila de narração (pura). Garante que duas falas NUNCA tocam ao mesmo tempo.
 *
 * Regras:
 * - Fala igual à que está tocando ou já na fila é ignorada (sem repetição em eco).
 * - A fila guarda no máximo `maxFila` falas pendentes; ao exceder, descarta a mais antiga
 *   de prioridade normal (falas antigas ficam desatualizadas rapidamente para uma criança).
 * - Prioridade "alta" (erros, avisos de segurança) entra na frente das normais, sem cortar
 *   a fala atual.
 * - `limpar()` esvazia a fila (troca de cena) sem cortar a fala atual; `parar()` corta tudo.
 */

export type Prioridade = 'normal' | 'alta';

export interface ReprodutorFala {
  /** Toca a fala e chama `fim` quando terminar (ou falhar). */
  tocar(id: string, fim: () => void): void;
  /** Interrompe a fala atual (se houver). */
  parar(): void;
}

interface Item {
  id: string;
  prioridade: Prioridade;
}

export class FilaNarracao {
  private atual: string | null = null;
  private fila: Item[] = [];
  /** Incrementa a cada fala iniciada: um `fim` atrasado de fala já interrompida é ignorado. */
  private geracao = 0;

  constructor(
    private readonly reprodutor: ReprodutorFala,
    private readonly maxFila = 2,
  ) {}

  falar(id: string, prioridade: Prioridade = 'normal'): void {
    if (id === this.atual || this.fila.some((i) => i.id === id)) return;
    const item = { id, prioridade };
    if (prioridade === 'alta') {
      const pos = this.fila.findIndex((i) => i.prioridade === 'normal');
      if (pos < 0) this.fila.push(item);
      else this.fila.splice(pos, 0, item);
    } else {
      this.fila.push(item);
    }
    while (this.fila.length > this.maxFila) {
      const antigaNormal = this.fila.findIndex((i) => i.prioridade === 'normal');
      this.fila.splice(antigaNormal >= 0 ? antigaNormal : 0, 1);
    }
    if (this.atual === null) this.proxima();
  }

  private proxima(): void {
    const item = this.fila.shift();
    if (!item) {
      this.atual = null;
      return;
    }
    this.atual = item.id;
    const g = ++this.geracao;
    this.reprodutor.tocar(item.id, () => {
      if (g !== this.geracao) return;
      this.atual = null;
      this.proxima();
    });
  }

  limpar(): void {
    this.fila = [];
  }

  parar(): void {
    this.fila = [];
    this.geracao++;
    this.atual = null;
    this.reprodutor.parar();
  }

  get falando(): string | null {
    return this.atual;
  }

  get pendentes(): readonly string[] {
    return this.fila.map((i) => i.id);
  }
}
