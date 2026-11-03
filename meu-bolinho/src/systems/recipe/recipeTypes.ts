/**
 * Tipos de receita (formato JSON em src/data/recipes) e da receita já resolvida
 * para uma dificuldade. Puro: sem dependência de Phaser.
 */
import type { Material } from '../../config/gameplay';

export type Dificuldade = 'facil' | 'confeiteiro';
export const DIFICULDADES: readonly Dificuldade[] = ['facil', 'confeiteiro'];

export type TipoEtapa =
  | 'despejar'
  | 'quebrar_ovo'
  | 'mexer'
  | 'untar'
  | 'despejar_massa'
  | 'forno'
  | 'desenformar'
  | 'decorar';
export const TIPOS_ETAPA: readonly TipoEtapa[] = [
  'despejar',
  'quebrar_ovo',
  'mexer',
  'untar',
  'despejar_massa',
  'forno',
  'desenformar',
  'decorar',
];

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
  /** Fração de cobertura exigida (untar, decorar). Padrão: difficulty.cobertura. */
  cobertura?: number;
  /** Cor da cobertura do bolo (decorar), #RRGGBB. */
  corCobertura?: string;
  /** Tempo de forno em segundos (15–25). */
  tempoSegundos?: number;
  /** Fração máxima que pode sobrar na tigela (despejar_massa). */
  restanteMax?: number;
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
  simbolo: 'quadrado' | 'triangulo' | 'gota' | 'estrela' | 'circulo' | 'losango';
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

export interface EtapaOvo {
  tipo: 'quebrar_ovo';
  quantidade: number;
  cascaDeOvo: boolean;
}

export interface EtapaUntar {
  tipo: 'untar';
  cobertura: number;
}

export interface EtapaDespejarMassa {
  tipo: 'despejar_massa';
  restanteMax: number;
}

export interface EtapaForno {
  tipo: 'forno';
  tempoSegundos: number;
}

export interface EtapaDesenformar {
  tipo: 'desenformar';
}

export interface EtapaDecorar {
  tipo: 'decorar';
  cobertura: number;
  corCobertura: string;
}

export type EtapaResolvida =
  | EtapaDespejar
  | EtapaOvo
  | EtapaMexer
  | EtapaUntar
  | EtapaDespejarMassa
  | EtapaForno
  | EtapaDesenformar
  | EtapaDecorar;

export interface ReceitaResolvida {
  id: string;
  nome: string;
  corMassa: string;
  dificuldade: Dificuldade;
  etapas: EtapaResolvida[];
  /** Ingredientes distintos da receita (contam para maxIngredientes), em ordem. */
  ingredientes: string[];
  /** Ingredientes despejados de recipientes (os que ficam na mesa), em ordem. */
  recipientes: string[];
}
