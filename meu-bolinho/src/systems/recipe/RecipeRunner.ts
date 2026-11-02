/**
 * Conduz uma receita resolvida: mantém o estado da FSM, cria o controlador de cada etapa
 * e publica eventos no EventBus. Puro (sem Phaser): a cena só traduz input em chamadas.
 */
import type { EventBus, MapaEventos } from '../events/EventBus';
import { PourStep } from '../steps/PourStep';
import { StirStep } from '../steps/StirStep';
import {
  estadoInicial,
  transicao,
  type EstadoReceita,
  type EventoReceita,
  type TipoErro,
} from './recipeFsm';
import type { EtapaResolvida, ReceitaResolvida } from './recipeTypes';

export type ControladorEtapa = PourStep | StirStep;

export function criarControlador(etapa: EtapaResolvida): ControladorEtapa {
  switch (etapa.tipo) {
    case 'despejar':
      return new PourStep({
        item: etapa.item,
        quantidade: etapa.quantidade,
        tolerancia: etapa.tolerancia,
        material: etapa.material,
      });
    case 'mexer':
      return new StirStep(etapa.voltas);
  }
}

export class RecipeRunner {
  private s: EstadoReceita;
  private ctrl: ControladorEtapa | null = null;
  private gestoAtivo = false;

  constructor(
    readonly receita: ReceitaResolvida,
    private readonly bus: EventBus<MapaEventos>,
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
    if (this.ctrl instanceof StirStep) this.ctrl.fimDoGesto();
    this.despachar({ type: 'GESTO_FIM', metaAtingida: this.ctrl?.metaAtingida() ?? false });
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
      const esperado = anterior.sub === 'correcao' && (ev.type === 'GESTO_INICIO' || ev.type === 'GESTO_FIM');
      if (!esperado && import.meta.env?.DEV) console.warn('[FSM] transição ignorada', anterior.sub, ev.type);
      return;
    }
    this.s = atual;

    const novaEtapa = atual.sub === 'aguardando' && (anterior.sub === 'introducao' || anterior.sub === 'concluida');
    if (novaEtapa) {
      const etapa = this.receita.etapas[atual.indice];
      this.ctrl = etapa ? criarControlador(etapa) : null;
    }

    this.bus.emit('fsm:mudou', { anterior, atual });
    if (atual.sub === 'correcao' && atual.erro && anterior.sub !== 'correcao') {
      this.bus.emit('etapa:erro', { indice: atual.indice, erro: atual.erro });
    }
    if (atual.sub === 'concluida') this.bus.emit('etapa:concluida', { indice: atual.indice });
    if (atual.sub === 'final') this.bus.emit('receita:concluida', { receitaId: this.receita.id });
  }
}
