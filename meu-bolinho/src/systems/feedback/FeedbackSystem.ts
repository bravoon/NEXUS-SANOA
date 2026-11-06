/**
 * FeedbackSystem: liga os eventos da receita ao áudio (narração, sons de sucesso e de
 * "ops"). Todo feedback é visual + sonoro: o visual correspondente (mascote, estrelas,
 * cartão) reage aos mesmos eventos em suas próprias classes.
 */
import type { AudioSystem } from '../audio/AudioSystem';
import type { EventBus, MapaEventos } from '../events/EventBus';

export class FeedbackSystem {
  private readonly desligar: Array<() => void>;

  constructor(bus: EventBus<MapaEventos>, audio: AudioSystem | null) {
    this.desligar = [
      bus.on('mascote:fala', (e) => audio?.falar(e.id, e.humor === 'surpreso' ? 'alta' : 'normal')),
      bus.on('etapa:concluida', () => audio?.efeito('sucesso')),
      bus.on('etapa:erro', () => audio?.efeito('boing')),
      bus.on('feedback:rejeicao', () => audio?.efeito('boing')),
      bus.on('receita:concluida', () => audio?.efeito('festa')),
    ];
  }

  destruir(): void {
    for (const d of this.desligar) d();
  }
}
