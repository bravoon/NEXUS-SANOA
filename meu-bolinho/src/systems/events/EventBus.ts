/**
 * EventBus tipado e sem dependências. Os sistemas só se comunicam por aqui:
 * nenhum sistema importa outro.
 */
import type { EstadoReceita, TipoErro } from '../recipe/recipeFsm';

export interface MapaEventos {
  /** Estado da FSM mudou. */
  'fsm:mudou': { anterior: EstadoReceita; atual: EstadoReceita };
  /** Progresso de uma etapa (0..1) mudou por input da criança. */
  'etapa:progresso': { indice: number; valor: number };
  'etapa:erro': { indice: number; erro: TipoErro };
  'etapa:concluida': { indice: number };
  'receita:concluida': { receitaId: string };
  /** Ingrediente fora de ordem: rejeição suave (não é erro de FSM). */
  'feedback:rejeicao': { item: string; esperado: string | null };
  /** Fala do mascote (no Milestone 3 vira narração na fila do AudioSystem). */
  'mascote:fala': { id: string; texto: string; humor: 'feliz' | 'surpreso' | 'neutro' };
}

type Ouvinte<T> = (payload: T) => void;

export class EventBus<M extends object = MapaEventos> {
  private ouvintes = new Map<keyof M, Set<Ouvinte<never>>>();

  on<K extends keyof M>(evento: K, fn: Ouvinte<M[K]>): () => void {
    let set = this.ouvintes.get(evento);
    if (!set) {
      set = new Set();
      this.ouvintes.set(evento, set);
    }
    set.add(fn as Ouvinte<never>);
    return () => this.off(evento, fn);
  }

  off<K extends keyof M>(evento: K, fn: Ouvinte<M[K]>): void {
    this.ouvintes.get(evento)?.delete(fn as Ouvinte<never>);
  }

  emit<K extends keyof M>(evento: K, payload: M[K]): void {
    const set = this.ouvintes.get(evento);
    if (!set) return;
    for (const fn of [...set]) (fn as Ouvinte<M[K]>)(payload);
  }

  limpar(): void {
    this.ouvintes.clear();
  }
}
