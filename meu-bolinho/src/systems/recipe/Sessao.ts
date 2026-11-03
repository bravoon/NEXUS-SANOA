/**
 * Sessão de uma receita em andamento. Atravessa as cenas (Cozinha → Forno → Confeitar →
 * Resultado) carregando o runner, o EventBus e o estado físico (tigela, forma, decoração).
 * Pura: sem Phaser.
 */
import { TIGELA } from '../../config/layout';
import { EventBus, type MapaEventos } from '../events/EventBus';
import { BowlContents } from '../fill/BowlContents';
import { RecipeRunner } from './RecipeRunner';
import type { ReceitaResolvida, TipoEtapa } from './recipeTypes';

export type CenaJogo = 'Cozinha' | 'Forno' | 'Confeitar';

/** Em que cena cada tipo de etapa acontece (fluxo de cenas da arquitetura). */
export const CENA_DA_ETAPA: Record<TipoEtapa, CenaJogo> = {
  despejar: 'Cozinha',
  quebrar_ovo: 'Cozinha',
  mexer: 'Cozinha',
  untar: 'Cozinha',
  despejar_massa: 'Cozinha',
  forno: 'Forno',
  desenformar: 'Forno',
  decorar: 'Confeitar',
};

export interface EstadoForma {
  /** Fração untada (0..1). */
  untada: number;
  /** Massa despejada na forma (xícaras). */
  massa: number;
  /** Cozimento (0..1). */
  assado: number;
}

export class Sessao {
  readonly bus = new EventBus<MapaEventos>();
  readonly tigela = new BowlContents(TIGELA.capacidade);
  readonly forma: EstadoForma = { untada: 0, massa: 0, assado: 0 };
  readonly runner: RecipeRunner;
  /** Mistura da massa (0..1), preservada entre estações. */
  mistura = 0;
  /** Chave da textura com a foto do bolo pronto (Resultado / galeria). */
  fotoBolo: string | null = null;

  constructor(
    readonly receita: ReceitaResolvida,
    rng: () => number = Math.random,
  ) {
    this.runner = new RecipeRunner(receita, this.bus, { rng, tigela: this.tigela });
  }

  /** Cena da etapa atual (null quando a receita terminou). */
  get cenaAtual(): CenaJogo | null {
    const e = this.runner.etapa;
    if (!e || this.runner.estado.sub === 'final') return null;
    return CENA_DA_ETAPA[e.tipo];
  }
}
