/**
 * Modelo da decoração (puro e serializável — a galeria do Milestone 4 salva isto).
 * Cada ação (um enfeite arrastado, uma porção de granulado) pode ser desfeita.
 * Coordenadas relativas ao centro do topo do bolo.
 */
import { CONFIG_DECORACAO } from '../../config/gameplay';

export type TipoEnfeite = 'confeito' | 'morango' | 'vela' | 'granulado';

export interface Enfeite {
  tipo: TipoEnfeite;
  x: number;
  y: number;
  rot: number;
  cor: number;
}

export class Decoracao {
  private acoes: Enfeite[][] = [];

  constructor(readonly maxItens: number = CONFIG_DECORACAO.maxItens) {}

  /** Adiciona uma ação. Retorna false se o bolo já está cheio. */
  adicionar(enfeites: Enfeite[]): boolean {
    if (enfeites.length === 0) return false;
    const livres = this.maxItens - this.total;
    if (livres <= 0) return false;
    this.acoes.push(enfeites.slice(0, livres));
    return true;
  }

  desfazer(): Enfeite[] | null {
    return this.acoes.pop() ?? null;
  }

  get podeDesfazer(): boolean {
    return this.acoes.length > 0;
  }

  get total(): number {
    return this.acoes.reduce((s, a) => s + a.length, 0);
  }

  /** Itens em ordem de camada (z): o mais recente fica por cima. */
  get itens(): readonly Enfeite[] {
    return this.acoes.flat();
  }

  serializar(): Enfeite[][] {
    return this.acoes.map((a) => a.map((e) => ({ ...e })));
  }
}
