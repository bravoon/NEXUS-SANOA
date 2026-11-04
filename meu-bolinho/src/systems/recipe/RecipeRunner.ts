/**
 * Conduz uma receita resolvida: mantém o estado da FSM, cria o controlador de cada etapa
 * e publica eventos no EventBus. Puro (sem Phaser): a cena só traduz input em chamadas.
 */
import type { EventBus, MapaEventos } from '../events/EventBus';
import type { BowlContents } from '../fill/BowlContents';
import { CoverageStep } from '../steps/CoverageStep';
import { DecorStep } from '../steps/DecorStep';
import { EggStep } from '../steps/EggStep';
import { OvenStep } from '../steps/OvenStep';
import { PourOutStep } from '../steps/PourOutStep';
import { PourStep } from '../steps/PourStep';
import { StirStep } from '../steps/StirStep';
import { UnmoldStep } from '../steps/UnmoldStep';
import { BeatStep } from '../steps/BeatStep';
import { FillLayerStep } from '../steps/FillLayerStep';
import { GrateStep } from '../steps/GrateStep';
import { SiftStep } from '../steps/SiftStep';
import {
  estadoInicial,
  transicao,
  type EstadoReceita,
  type EventoReceita,
  type TipoErro,
} from './recipeFsm';
import type { EtapaResolvida, ReceitaResolvida } from './recipeTypes';

export type ControladorEtapa =
  | PourStep
  | EggStep
  | StirStep
  | CoverageStep
  | PourOutStep
  | OvenStep
  | UnmoldStep
  | BeatStep
  | FillLayerStep
  | SiftStep
  | GrateStep
  | DecorStep;

/** Estado compartilhado de que alguns controladores precisam ao serem criados. */
export interface ContextoEtapas {
  /** Fonte de aleatoriedade (injetável nos testes): casca de ovo. */
  rng: () => number;
  /** Conteúdo atual da tigela (despejar_massa parte dele). */
  tigela: BowlContents;
}

export function criarControlador(etapa: EtapaResolvida, ctx: ContextoEtapas): ControladorEtapa {
  switch (etapa.tipo) {
    case 'despejar':
      return new PourStep({
        item: etapa.item,
        quantidade: etapa.quantidade,
        tolerancia: etapa.tolerancia,
        material: etapa.material,
      });
    case 'quebrar_ovo':
      return new EggStep(etapa.quantidade, etapa.cascaDeOvo, ctx.rng);
    case 'mexer':
      return new StirStep(etapa.voltas);
    case 'untar':
      return new CoverageStep('untar', etapa.cobertura);
    case 'despejar_massa':
      return new PourOutStep(ctx.tigela.total, etapa.restanteMax);
    case 'forno':
      return new OvenStep(etapa.tempoSegundos);
    case 'desenformar':
      return new UnmoldStep();
    case 'bater':
      return new BeatStep(etapa.batidas);
    case 'rechear':
      return new FillLayerStep(etapa.cobertura, Number.parseInt(etapa.corRecheio.slice(1), 16));
    case 'peneirar':
      return new SiftStep(etapa.item, etapa.quantidade, etapa.sacudidas);
    case 'ralar':
      return new GrateStep(etapa.item, etapa.quantidade, etapa.raladas);
    case 'decorar':
      return new DecorStep(etapa.cobertura, Number.parseInt(etapa.corCobertura.slice(1), 16), etapa.glace, etapa.polvilho);
  }
}

export class RecipeRunner {
  private s: EstadoReceita;
  private ctrl: ControladorEtapa | null = null;
  private gestoAtivo = false;

  constructor(
    readonly receita: ReceitaResolvida,
    private readonly bus: EventBus<MapaEventos>,
    private readonly ctx: ContextoEtapas,
  ) {
    this.s = estadoInicial(receita.etapas.length);
  }

  /** Carregar → Introdução → Aguardando a etapa 0. */
  iniciar(): void {
    this.despachar({ type: 'CARREGADA' });
    this.despachar({ type: 'INICIAR' });
  }

  get estado(): EstadoReceita {
    return this.s;
  }

  get etapa(): EtapaResolvida | null {
    return this.receita.etapas[this.s.indice] ?? null;
  }

  get controlador(): ControladorEtapa | null {
    return this.ctrl;
  }

  /** A etapa atual aceita input (não está comemorando nem terminada). */
  get aceitaInput(): boolean {
    return this.s.sub === 'aguardando' || this.s.sub === 'em_gesto' || this.s.sub === 'correcao';
  }

  get emGesto(): boolean {
    return this.gestoAtivo;
  }

  /** A criança encostou no objeto da etapa. */
  inicioDoGesto(): void {
    if (!this.aceitaInput || this.gestoAtivo) return;
    this.gestoAtivo = true;
    this.despachar({ type: 'GESTO_INICIO' });
  }

  /** A criança soltou o dedo. Única porta para concluir uma etapa. */
  fimDoGesto(): void {
    if (!this.gestoAtivo) return;
    this.gestoAtivo = false;
    if (this.ctrl && 'fimDoGesto' in this.ctrl) this.ctrl.fimDoGesto();
    this.despachar({ type: 'GESTO_FIM', metaAtingida: this.ctrl?.metaAtingida() ?? false });
    // Erro corrigido mas etapa ainda incompleta: sai da correção.
    if (this.s.sub === 'correcao' && this.ctrl && !this.erroPendente()) this.despachar({ type: 'ERRO_CORRIGIDO' });
  }

  /** O controlador ainda tem um erro a corrigir (excesso, casca, falta de luva)? */
  private erroPendente(): boolean {
    const c = this.ctrl;
    return !!c && 'erroPendente' in c && c.erroPendente();
  }

  reportarErro(erro: TipoErro): void {
    if (this.s.sub === 'correcao' && this.s.erro === erro) return;
    this.despachar({ type: 'ERRO', erro });
  }

  /** Publica progresso causado por input (chamado pela cena após alimentar o controlador). */
  notificarProgresso(): void {
    if (this.ctrl) this.bus.emit('etapa:progresso', { indice: this.s.indice, valor: this.ctrl.progresso });
  }

  /** Após a comemoração da etapa concluída, passa para a próxima. */
  proxima(): void {
    this.despachar({ type: 'PROXIMA' });
  }

  private despachar(ev: EventoReceita): void {
    const anterior = this.s;
    const atual = transicao(anterior, ev);
    if (atual === anterior) {
      // Gestos dentro da correção (ex.: pegar a colher) são no-ops esperados da FSM.
      const esperado = anterior.sub === 'correcao' && (ev.type === 'GESTO_INICIO' || ev.type === 'GESTO_FIM' || ev.type === 'ERRO_CORRIGIDO');
      if (!esperado && import.meta.env?.DEV) console.warn('[FSM] transição ignorada', anterior.sub, ev.type);
      return;
    }
    this.s = atual;

    const novaEtapa = atual.sub === 'aguardando' && (anterior.sub === 'introducao' || anterior.sub === 'concluida');
    if (novaEtapa) {
      const etapa = this.receita.etapas[atual.indice];
      this.ctrl = etapa ? criarControlador(etapa, this.ctx) : null;
    }

    this.bus.emit('fsm:mudou', { anterior, atual });
    if (atual.sub === 'correcao' && atual.erro && anterior.sub !== 'correcao') {
      this.bus.emit('etapa:erro', { indice: atual.indice, erro: atual.erro });
    }
    if (atual.sub === 'concluida') this.bus.emit('etapa:concluida', { indice: atual.indice });
    if (atual.sub === 'final') this.bus.emit('receita:concluida', { receitaId: this.receita.id });
  }
}
