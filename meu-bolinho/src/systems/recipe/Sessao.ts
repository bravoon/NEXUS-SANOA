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
  bater: 'Cozinha',
  rechear: 'Confeitar',
  peneirar: 'Cozinha',
  ralar: 'Cozinha',
  abrir_massa: 'Cozinha',
  cortar: 'Cozinha',
  fatiar: 'Confeitar',
  decorar: 'Confeitar',
};

export interface EstadoForma {
  /** Fração untada (0..1). */
  untada: number;
  /** Massa despejada na forma (xícaras). */
  massa: number;
  /** Cozimento (0..1). */
  assado: number;
  /** Massa aberta com o rolo (0..1; só torta/biscoito). */
  aberta: number;
  /** Biscoitos cortados: centros normalizados no disco da forma (|p| ≤ 1). */
  biscoitos: { x: number; y: number }[];
  /** Os biscoitos foram todos cortados: a sobra de massa saiu da forma. */
  sobraRetirada: boolean;
}

export class Sessao {
  readonly bus = new EventBus<MapaEventos>();
  readonly tigela = new BowlContents(TIGELA.capacidade);
  readonly forma: EstadoForma = { untada: 0, massa: 0, assado: 0, aberta: 0, biscoitos: [], sobraRetirada: false };
  readonly runner: RecipeRunner;
  /** Mistura da massa (0..1), preservada entre estações. */
  mistura = 0;
  /** Claras em neve (0..1), preservada até a massa ser misturada. */
  espuma = 0;
  /** Chave da textura com a foto do bolo pronto (Resultado / galeria). */
  fotoBolo: string | null = null;
  /** Foto em JPEG (data URL, pequena) para salvar na galeria. */
  fotoUrl: string | null = null;
  /** Quantidade de enfeites no bolo pronto. */
  enfeites = 0;
  /** O bolo desta sessão já foi guardado (evita duplicar ao revisitar o Resultado). */
  guardado = false;
  /** Quantas vezes foi preciso corrigir "colocou demais" (estrela de medidas certinhas). */
  excessos = 0;
  /** Cobertura final do bolo (estrela de capricho). */
  coberturaFinal = 0;
  /** Estrelas ganhas nesta partida (definidas no Resultado). */
  estrelasGanhas = 0;

  constructor(
    readonly receita: ReceitaResolvida,
    rng: () => number = Math.random,
  ) {
    this.runner = new RecipeRunner(receita, this.bus, { rng, tigela: this.tigela });
    this.bus.on('etapa:erro', (e) => {
      if (e.erro === 'excesso') this.excessos++;
    });
  }

  /** Cena da etapa atual (null quando a receita terminou). */
  get cenaAtual(): CenaJogo | null {
    const e = this.runner.etapa;
    if (!e || this.runner.estado.sub === 'final') return null;
    return CENA_DA_ETAPA[e.tipo];
  }
}
