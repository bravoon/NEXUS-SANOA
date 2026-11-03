/**
 * Base das cenas de jogo (Cozinha, Forno, Confeitar).
 *
 * Responsabilidades comuns: cartão da receita, mascote, botão de pausa protegido, modo debug,
 * gestos (1 ponteiro), comemoração de etapa concluída e roteamento: quando a próxima etapa
 * pertence a outra cena (Sessao.CENA_DA_ETAPA), troca de cena levando a sessão.
 *
 * As subclasses só traduzem input em chamadas aos controladores e desenham o estado.
 */
import Phaser from 'phaser';
import { DT_MAX_MS } from '../config/gameplay';
import { MASCOTE } from '../config/layout';
import { INGREDIENTES } from '../data/registry';
import { Mascot } from '../entities/Mascot';
import { PauseButton } from '../entities/PauseButton';
import { RecipeCard } from '../entities/RecipeCard';
import type { MapaEventos } from '../systems/events/EventBus';
import { GestureSystem, type AmostraPonteiro } from '../systems/gesture/GestureSystem';
import type { RecipeRunner } from '../systems/recipe/RecipeRunner';
import type { EstadoReceita, TipoErro } from '../systems/recipe/recipeFsm';
import type { EtapaResolvida } from '../systems/recipe/recipeTypes';
import type { Sessao } from '../systems/recipe/Sessao';
import { DebugOverlay } from '../utils/DebugOverlay';
import { AudioSystem, FALAS } from '../systems/audio/AudioSystem';
import type { Continuo, Efeito } from '../systems/audio/Sintetizador';
import { FeedbackSystem } from '../systems/feedback/FeedbackSystem';
import { HintTimer } from '../systems/hint/HintTimer';
import { HintPresenter, type DicaEtapa } from '../entities/HintPresenter';
import type { Ponto } from '../utils/math';

export interface DadosCena {
  sessao: Sessao;
}

/** Tempo de comemoração antes de passar para a próxima etapa (a etapa já foi concluída pela criança). */
const COMEMORACAO_MS = 1100;

export abstract class CenaEtapas extends Phaser.Scene {
  protected sessao!: Sessao;
  protected cartao!: RecipeCard;
  protected debug!: DebugOverlay;
  protected gestos!: GestureSystem;
  protected pausa!: PauseButton;
  protected mascote!: Mascot;
  protected dedo: Ponto = { x: 0, y: 0 };
  private saindo = false;
  private desligar: Array<() => void> = [];
  private readonly dicas = new HintTimer();
  private apresentador!: HintPresenter;
  protected audio: AudioSystem | null = null;

  protected get runner(): RecipeRunner {
    return this.sessao.runner;
  }

  init(dados: DadosCena): void {
    this.sessao = dados.sessao;
    this.saindo = false;
    this.desligar = [];
  }

  create(): void {
    this.cameras.main.fadeIn(250, 255, 244, 230);
    this.criarCenario();

    this.cartao = new RecipeCard(this, 16, 12, this.sessao.receita, INGREDIENTES);
    const s = this.runner.estado;
    this.cartao.sincronizar(s.indice, s.sub === 'concluida' || s.sub === 'final');
    this.mascote = new Mascot(this, MASCOTE.x, MASCOTE.y, this.sessao.bus);
    this.pausa = new PauseButton(this, () => this.pausar());
    this.debug = new DebugOverlay(this, (g) => this.linhasDebug(g));
    this.audio = AudioSystem.get();
    this.audio?.limparFalas();
    const feedback = new FeedbackSystem(this.sessao.bus, this.audio);
    this.desligar.push(() => feedback.destruir());
    this.apresentador = new HintPresenter(this, this.cartao, (id) => this.falar(id));
    this.dicas.atividade();

    this.ouvir('fsm:mudou', (e) => this.mudouEstado(e.anterior, e.atual));
    this.ouvir('etapa:concluida', (e) => this.comemorar(e.indice));
    this.ouvir('etapa:erro', (e) => this.aoErro(e.erro));
    this.ouvir('receita:concluida', () => this.aoFinal());
    // progresso e mudanças de estado também contam como atividade (sem dica enquanto progride)
    this.ouvir('etapa:progresso', () => this.atividade());
    this.ouvir('fsm:mudou', () => this.atividade());
    this.events.once('shutdown', () => {
      for (const d of this.desligar) d();
      this.desligar = [];
    });

    this.gestos = new GestureSystem(this, {
      aoTocar: (a) => {
        this.dedo = { x: a.x, y: a.y };
        this.audio?.desbloquear();
        this.atividade();
        if (this.pausa.contem(a.x, a.y) || this.saindo || !this.runner.aceitaInput) return;
        this.aoTocar(a);
      },
      aoMover: (a) => {
        this.dedo = { x: a.x, y: a.y };
        this.atividade();
        if (!this.saindo) this.aoMover(a);
      },
      aoSoltar: (a) => {
        this.dedo = { x: a.x, y: a.y };
        this.aoSoltar(a);
      },
    });

    this.aoCriar();
    const etapa = this.runner.etapa;
    if (etapa && this.runner.aceitaInput) this.prepararEtapa(this.runner.estado.indice, etapa);
  }

  override update(_t: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, DT_MAX_MS);
    if (!this.saindo) this.atualizar(dt);
    this.audio?.atualizar();
    this.atualizarDicas(dt);
    this.debug.atualizar();
  }

  // ------------------------------------------------------------ dicas

  private atividade(): void {
    if (this.dicas.atividade()) this.apresentador.limpar();
  }

  private atualizarDicas(dt: number): void {
    const s = this.runner.estado;
    const podeDar = !this.saindo && !this.runner.emGesto && (s.sub === 'aguardando' || s.sub === 'correcao');
    const nivel = this.dicas.atualizar(dt, podeDar && this.dicaAtual() !== null);
    if (!nivel) return;
    const dica = this.dicaAtual();
    if (dica) this.apresentador.mostrar(nivel, dica);
  }

  /** Nível de dica atual (debug). */
  protected get nivelDica(): number {
    return this.dicas.nivel;
  }

  // ------------------------------------------------------------ áudio (atalhos)

  protected som(e: Efeito): void {
    this.audio?.efeito(e);
  }

  /** Som contínuo proporcional ao input (silencia sozinho se não for chamado no frame). */
  protected somContinuo(tipo: Continuo, intensidade: number): void {
    if (intensidade > 0.01) this.audio?.continuo(tipo, intensidade);
  }

  // ------------------------------------------------------------ ganchos das subclasses

  protected abstract criarCenario(): void;
  /** Depois de cartão, mascote e gestos existirem. */
  protected aoCriar(): void {}
  protected abstract prepararEtapa(indice: number, etapa: EtapaResolvida): void;
  protected abstract aoTocar(a: AmostraPonteiro): void;
  protected abstract aoMover(a: AmostraPonteiro): void;
  protected abstract aoSoltar(a: AmostraPonteiro): void;
  protected abstract atualizar(dtMs: number): void;
  protected abstract infoDebug(g: Phaser.GameObjects.Graphics): string[];
  /**
   * O que a dica deve mostrar AGORA (objeto certo, gesto e fala), ou null quando não
   * cabe dica (ex.: forno assando). Chamado só quando o nível de dica muda.
   */
  protected abstract dicaAtual(): DicaEtapa | null;
  /** Mudanças de estado da FSM específicas da cena (ex.: mostrar colher na correção). */
  protected aoMudarEstado(_anterior: EstadoReceita, _atual: EstadoReceita): void {}
  /** Visual específico após uma etapa concluída (ex.: aposentar o recipiente). */
  protected aoConcluirEtapa(_indice: number, _etapa: EtapaResolvida): void {}
  protected aoErro(_erro: TipoErro): void {}
  /** Receita terminou nesta cena. Padrão: ir ao Resultado. */
  protected aoFinal(): void {
    this.trocarCena('Resultado');
  }

  // ------------------------------------------------------------ comum

  protected ouvir<K extends keyof MapaEventos>(evento: K, fn: (p: MapaEventos[K]) => void): void {
    this.desligar.push(this.sessao.bus.on(evento, fn));
  }

  /** Fala do mascote pelo id do catálogo (data/falas.json): balão + narração. */
  protected falar(id: string, humor: 'feliz' | 'surpreso' | 'neutro' = 'feliz'): void {
    const texto = FALAS[id];
    if (!texto) {
      if (import.meta.env.DEV) console.warn(`[falas] id sem texto: ${id}`);
      return;
    }
    this.sessao.bus.emit('mascote:fala', { id, texto, humor });
  }

  private mudouEstado(anterior: EstadoReceita, atual: EstadoReceita): void {
    const novaEtapa = atual.sub === 'aguardando' && (anterior.sub === 'introducao' || anterior.sub === 'concluida');
    if (novaEtapa) {
      const destino = this.sessao.cenaAtual;
      if (destino && destino !== this.scene.key) {
        this.trocarCena(destino);
        return;
      }
      const etapa = this.runner.etapa;
      this.cartao.definirAtual(atual.indice);
      if (etapa) this.prepararEtapa(atual.indice, etapa);
    }
    this.aoMudarEstado(anterior, atual);
  }

  private comemorar(indice: number): void {
    this.cartao.marcarFeita(indice);
    const etapa = this.sessao.receita.etapas[indice];
    if (etapa) this.aoConcluirEtapa(indice, etapa);
    if (etapa?.tipo !== 'decorar') this.falar(`elogio.${(indice % 3) + 1}`);
    this.estrelas(this.dedo.x, this.dedo.y - 30);
    this.time.delayedCall(COMEMORACAO_MS, () => this.runner.proxima());
  }

  protected trocarCena(chave: string): void {
    if (this.saindo) return;
    this.saindo = true;
    this.cameras.main.fadeOut(300, 255, 244, 230);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(chave, { sessao: this.sessao }));
  }

  private pausar(): void {
    this.scene.launch('Pausa', { origem: this.scene.key });
    this.scene.pause();
  }

  protected estrelas(x: number, y: number, n = 14): void {
    const e = this.add
      .particles(x, y, 'estrela', {
        speed: { min: 150, max: 350 },
        angle: { min: 200, max: 340 },
        gravityY: 500,
        lifespan: 900,
        scale: { start: 1, end: 0.3 },
        alpha: { start: 1, end: 0 },
        tint: [0xf0e442, 0xffffff, 0xe69f00],
        emitting: false,
      })
      .setDepth(80);
    e.explode(n);
    this.time.delayedCall(1200, () => e.destroy());
  }

  private linhasDebug(g: Phaser.GameObjects.Graphics): string[] {
    const s = this.runner.estado;
    const etapa = this.runner.etapa;
    return [
      `${this.scene.key} · ${this.sessao.receita.id} [${this.sessao.receita.dificuldade}]`,
      `FSM ${s.sub}  etapa ${s.indice + 1}/${s.total} (${etapa?.tipo ?? '-'})${s.erro ? `  erro=${s.erro}` : ''}`,
      `Dica nível ${this.dicas.nivel}  inativo ${(this.dicas.inativoMs / 1000).toFixed(1)} s`,
      ...this.infoDebug(g),
    ];
  }
}
