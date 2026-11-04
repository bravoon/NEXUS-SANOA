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
  | 'bater'
  | 'rechear'
  | 'peneirar'
  | 'ralar'
  | 'abrir_massa'
  | 'cortar'
  | 'decorar'
  | 'fatiar';
export const TIPOS_ETAPA: readonly TipoEtapa[] = [
  'despejar',
  'quebrar_ovo',
  'mexer',
  'untar',
  'despejar_massa',
  'forno',
  'desenformar',
  'bater',
  'rechear',
  'peneirar',
  'ralar',
  'abrir_massa',
  'cortar',
  'decorar',
  'fatiar',
];

/** O que a receita produz (muda a forma, o forno e o prato; as etapas vêm do JSON). */
export type Produto = 'bolo' | 'torta' | 'biscoito' | 'brownie' | 'cupcake';
export const PRODUTOS: readonly Produto[] = ['bolo', 'torta', 'biscoito', 'brownie', 'cupcake'];

/** Desenhos para escrever com glacê. */
export type DesenhoGlace = 'coracao' | 'estrela' | 'circulo' | 'onda';
export const DESENHOS_GLACE: readonly DesenhoGlace[] = ['coracao', 'estrela', 'circulo', 'onda'];

/** O que se polvilha por cima do bolo (decorar). */
export type TipoPolvilho = 'acucar' | 'canela' | 'granulado' | 'coco';
export const TIPOS_POLVILHO: readonly TipoPolvilho[] = ['acucar', 'canela', 'granulado', 'coco'];
export const COR_POLVILHO: Record<TipoPolvilho, string> = { acucar: '#FFFFFF', canela: '#9C5B2E', granulado: '#6B3E26', coco: '#FBF7EE' };

export interface ParametrosDificuldade {
  maxIngredientes: number;
  voltas: number;
  tolerancia: number;
  cascaDeOvo: boolean;
  cobertura: number;
  /** Batidas para bater claras. */
  batidas: number;
  /** Fração do desenho de glacê que precisa ser coberta. */
  tracado: number;
  /** Distância (px) do dedo ao desenho que ainda conta. */
  toleranciaGlace: number;
  /** Sacudidas da peneira para passar todo o ingrediente (peneirar). */
  sacudidas: number;
  /** Raladas (vai e vem no ralador) para ralar todo o pedaço (ralar). */
  raladas: number;
  /** Fração do topo do bolo que precisa ser polvilhada (decorar com polvilho). */
  polvilho: number;
  /** Passadas do rolo para abrir a massa (abrir_massa). */
  passadasRolo: number;
  /** Biscoitos a cortar (cortar). */
  biscoitos: number;
  /** Cortes de faca (fatiar): 2 cortes = 4 fatias. */
  cortesFatia: number;
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
  /** Batidas (bater). */
  batidas?: number;
  /** Cor do recheio (rechear), #RRGGBB. */
  corRecheio?: string;
  /** Desenho de glacê (decorar). */
  glace?: string;
  /** Cor do glacê (decorar), #RRGGBB. */
  corGlace?: string;
  /** Sacudidas (peneirar). */
  sacudidas?: number;
  /** Raladas (ralar). */
  raladas?: number;
  /** Polvilhar por cima no fim (decorar). */
  polvilhar?: string;
  /** Passadas do rolo (abrir_massa). */
  passadas?: number;
  /** Biscoitos (cortar). */
  biscoitos?: number;
  /** Cortes (fatiar). */
  cortes?: number;
  apenas?: Dificuldade;
}

export interface ReceitaJson {
  id: string;
  nome: string;
  /** Padrão: "bolo". */
  produto?: Produto;
  corMassa: string;
  etapas: EtapaJson[];
}

export interface IngredienteDef {
  nome: string;
  material: Material;
  corConteudo: string;
  corRecipiente: string;
  simbolo: 'quadrado' | 'triangulo' | 'gota' | 'estrela' | 'circulo' | 'losango' | 'tablete' | 'hexagono' | 'folha' | 'cruz' | 'lua' | 'coracao' | 'anel' | 'nuvem' | 'raio';
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

export interface EtapaBater {
  tipo: 'bater';
  batidas: number;
}

export interface EtapaRechear {
  tipo: 'rechear';
  cobertura: number;
  corRecheio: string;
}

export interface EtapaPeneirar {
  tipo: 'peneirar';
  item: string;
  quantidade: number;
  sacudidas: number;
}

export interface EtapaRalar {
  tipo: 'ralar';
  item: string;
  quantidade: number;
  raladas: number;
}

export interface EtapaAbrirMassa {
  tipo: 'abrir_massa';
  passadas: number;
}

export interface EtapaCortar {
  tipo: 'cortar';
  biscoitos: number;
}

export interface EtapaFatiar {
  tipo: 'fatiar';
  cortes: number;
}

export interface PolvilhoResolvido {
  tipo: TipoPolvilho;
  cor: string;
  cobertura: number;
}

export interface GlaceResolvido {
  desenho: DesenhoGlace;
  cor: string;
  tracado: number;
  tolerancia: number;
}

export interface EtapaDecorar {
  tipo: 'decorar';
  /** Escrever com glacê (opcional), entre a cobertura e os enfeites. */
  glace: GlaceResolvido | null;
  /** Polvilhar por cima (opcional), depois do glacê e antes dos enfeites. */
  polvilho: PolvilhoResolvido | null;
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
  | EtapaBater
  | EtapaRechear
  | EtapaPeneirar
  | EtapaRalar
  | EtapaAbrirMassa
  | EtapaCortar
  | EtapaFatiar
  | EtapaDecorar;

export interface ReceitaResolvida {
  id: string;
  nome: string;
  produto: Produto;
  corMassa: string;
  dificuldade: Dificuldade;
  etapas: EtapaResolvida[];
  /** Ingredientes distintos da receita (contam para maxIngredientes), em ordem. */
  ingredientes: string[];
  /** Ingredientes despejados de recipientes (os que ficam na mesa), em ordem. */
  recipientes: string[];
}
