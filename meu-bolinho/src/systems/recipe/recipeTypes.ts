/**
 * Tipos de receita (formato JSON em src/data/recipes) e da receita já resolvida
 * para uma dificuldade. Puro: sem dependência de Phaser.
 */
import type { Material } from '../../config/gameplay';

export type Dificuldade = 'facil' | 'confeiteiro';
export const DIFICULDADES: readonly Dificuldade[] = ['facil', 'confeiteiro'];

/** Tipos de etapa implementados até agora. Novos tipos entram aqui no Milestone 2. */
export type TipoEtapa = 'despejar' | 'mexer';
export const TIPOS_ETAPA: readonly TipoEtapa[] = ['despejar', 'mexer'];

export interface ParametrosDificuldade {
  maxIngredientes: number;
  voltas: number;
  tolerancia: number;
  cascaDeOvo: boolean;
  cobertura: number;
}

/** Etapa como escrita no JSON (campos de dificuldade são opcionais e sobrescrevem o padrão). */
export interface EtapaJson {
  tipo: string;
  item?: string;
  alvo?: string;
  quantidade?: number;
  tolerancia?: number;
  voltas?: number;
  apenas?: Dificuldade;
}

export interface ReceitaJson {
  id: string;
  nome: string;
  corMassa: string;
  etapas: EtapaJson[];
}

export interface IngredienteDef {
  nome: string;
  material: Material;
  corConteudo: string;
  corRecipiente: string;
  simbolo: 'quadrado' | 'triangulo' | 'gota' | 'estrela' | 'circulo';
}

export interface EtapaDespejar {
  tipo: 'despejar';
  item: string;
  alvo: string;
  quantidade: number;
  tolerancia: number;
  material: Material;
}

export interface EtapaMexer {
  tipo: 'mexer';
  voltas: number;
}

export type EtapaResolvida = EtapaDespejar | EtapaMexer;

export interface ReceitaResolvida {
  id: string;
  nome: string;
  corMassa: string;
  dificuldade: Dificuldade;
  etapas: EtapaResolvida[];
  /** Ingredientes que aparecem na mesa, em ordem da receita. */
  ingredientes: string[];
}
