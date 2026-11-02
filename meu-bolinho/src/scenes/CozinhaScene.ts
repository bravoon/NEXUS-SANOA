/**
 * Cena da cozinha (Milestone 1: arrastar, despejar e mexer, com formas geométricas).
 *
 * Papel da cena: traduzir input em chamadas ao núcleo puro (RecipeRunner + controladores)
 * e desenhar o estado. A cena NUNCA altera progresso por conta própria: toda quantidade
 * despejada sai de PourStep.tick() com o dedo segurando, e toda volta sai de StirStep.amostra().
 */
import Phaser from 'phaser';
import { CONFIG_DESPEJAR, DT_MAX_MS, VAZAO } from '../config/gameplay';
import {
  ALTURA,
  AREA_MEXER,
  BARRA_MEXER,
  CORES,
  DESCANSO_COLHER,
  LARGURA,
  MASCOTE,
  MESA_Y,
  POSICOES_RECIPIENTES,
  PRATINHO_DESCARTE,
  RECIPIENTE,
  TIGELA,
} from '../config/layout';
import { carregarReceita, INGREDIENTES } from '../data/registry';
import { BowlView } from '../entities/Bowl';
import { Mascot } from '../entities/Mascot';
import { PourContainer } from '../entities/PourContainer';
import { ProgressBar } from '../entities/ProgressBar';
import { RecipeCard } from '../entities/RecipeCard';
import { Spoon } from '../entities/Spoon';
import { EventBus, type MapaEventos } from '../systems/events/EventBus';
import { BowlContents } from '../systems/fill/BowlContents';
import { bicoSobreBoca, posicaoBico } from '../systems/fill/pourFlow';
import { GestureSystem, type AmostraPonteiro } from '../systems/gesture/GestureSystem';
import { TiltRecognizer } from '../systems/gesture/recognizers/TiltRecognizer';
import { RecipeRunner } from '../systems/recipe/RecipeRunner';
import type { EstadoReceita } from '../systems/recipe/recipeFsm';
import type { Dificuldade, ReceitaResolvida } from '../systems/recipe/recipeTypes';
import { PourStep } from '../systems/steps/PourStep';
import { RAIO_NORMALIZADO, StirStep } from '../systems/steps/StirStep';
import { DebugOverlay } from '../utils/DebugOverlay';
import { corHex } from '../utils/desenho';
import { amortecer, clamp, distancia, type Ponto } from '../utils/math';

export interface DadosCozinha {
  receitaId: string;
  dificuldade: Dificuldade;
}

type Arrasto =
  | { tipo: 'recipiente'; r: PourContainer; daEtapa: boolean }
  | { tipo: 'colher' }
  | { tipo: 'mexer' };

/**
 * Zona acima da tigela onde o recipiente da etapa "trava" e passa a inclinar.
 * A borda esquerda coincide com a borda esquerda da boca: inclinado, o bico fica ~50–65 px
 * à direita do centro do recipiente, então travar em qualquer ponto da zona põe o bico sobre a boca.
 */
const ZONA_DESPEJO = new Phaser.Geom.Rectangle(
  TIGELA.cx - TIGELA.raio * 0.85,
  TIGELA.bordaY - 330,
  TIGELA.raio * 0.85 + 60,
  290,
);

/** Partículas por xícara despejada (visual). */
const PARTICULAS_POR_XICARA = 160;

export class CozinhaScene extends Phaser.Scene {
  private bus!: EventBus<MapaEventos>;
  private receita!: ReceitaResolvida;
  private runner!: RecipeRunner;
  private conteudo!: BowlContents;
  private tigela!: BowlView;
  private recipientes: PourContainer[] = [];
  private colher!: Spoon;
  private colherMexer!: Spoon;
  private pratinho!: Phaser.GameObjects.Container;
  private barra!: ProgressBar;
  private guiaMexer!: Phaser.GameObjects.Graphics;
  private cartao!: RecipeCard;
  private debug!: DebugOverlay;
  private particulas!: Phaser.GameObjects.Particles.ParticleEmitter;
  private gestos!: GestureSystem;

  private readonly cores: Record<string, number> = {};
  private readonly inclinacao = new TiltRecognizer();
  private arrasto: Arrasto | null = null;
  private dedo: Ponto = { x: 0, y: 0 };
  private travaX: number | null = null;
  private bico: Ponto | null = null;
  private bicoSobre = false;
  private mistura = 0;
  private particulasPendentes = 0;
  private montesDescartados = 0;

  constructor() {
    super('Cozinha');
  }

  init(dados: DadosCozinha): void {
    this.bus = new EventBus();
    this.receita = carregarReceita(dados.receitaId, dados.dificuldade);
    this.runner = new RecipeRunner(this.receita, this.bus);
    this.conteudo = new BowlContents(TIGELA.capacidade);
    this.recipientes = [];
    this.arrasto = null;
    this.travaX = null;
    this.mistura = 0;
    this.montesDescartados = 0;
    for (const [id, def] of Object.entries(INGREDIENTES)) this.cores[id] = corHex(def.corConteudo);
  }

  create(): void {
    this.desenharCenario();

    this.tigela = new BowlView(this, corHex(this.receita.corMassa));
    this.receita.ingredientes.forEach((item, i) => {
      const def = INGREDIENTES[item];
      const x = POSICOES_RECIPIENTES[i];
      if (!def || x === undefined) throw new Error(`Sem lugar na mesa para "${item}"`);
      this.recipientes.push(new PourContainer(this, item, def, { x, y: RECIPIENTE.y }));
    });

    this.pratinho = this.criarPratinho();
    this.colher = new Spoon(this, DESCANSO_COLHER).setVisible(false);
    this.colherMexer = new Spoon(this, { x: TIGELA.cx + 40, y: TIGELA.bordaY - 10 }, 1.15).setVisible(false);
    this.barra = new ProgressBar(this, BARRA_MEXER.x, BARRA_MEXER.y, BARRA_MEXER.largura, BARRA_MEXER.altura).setVisible(false);
    this.guiaMexer = this.add.graphics().setDepth(31).setVisible(false);
    this.desenharGuiaMexer();

    this.particulas = this.add.particles(0, 0, 'gota', {
      emitting: false,
      lifespan: 600,
      speedY: { min: 40, max: 80 },
      speedX: { min: -12, max: 12 },
      gravityY: 900,
      scale: { start: 1, end: 0.7 },
      maxAliveParticles: 300,
    });
    this.particulas.setDepth(25);

    this.cartao = new RecipeCard(this, 20, 16, this.receita, INGREDIENTES);
    new Mascot(this, MASCOTE.x, MASCOTE.y, this.bus);
    this.debug = new DebugOverlay(this, (g) => this.infoDebug(g));

    this.bus.on('fsm:mudou', (e) => this.aoMudarEstado(e.anterior, e.atual));
    this.bus.on('etapa:concluida', (e) => this.comemorar(e.indice));
    this.bus.on('etapa:erro', (e) => {
      if (e.erro === 'excesso') this.falar('Opa, colocou demais! Tire um pouco com a colher.', 'surpreso');
    });
    this.bus.on('feedback:rejeicao', (e) => this.rejeitar(e.item, e.esperado));
    this.bus.on('receita:concluida', () => this.terminar());

    this.gestos = new GestureSystem(this, {
      aoTocar: (a) => this.aoTocar(a),
      aoMover: (a) => this.aoMover(a),
      aoSoltar: () => this.aoSoltar(),
    });

    this.events.once('shutdown', () => this.bus.limpar());
    this.runner.iniciar();
  }

  // ---------------------------------------------------------------- input

  private aoTocar(a: AmostraPonteiro): void {
    this.dedo = { x: a.x, y: a.y };
    if (!this.runner.aceitaInput || this.arrasto) return;
    const etapa = this.runner.etapa;

    if (this.runner.estado.sub === 'correcao' && this.colher.contem(a)) {
      this.arrasto = { tipo: 'colher' };
      this.runner.inicioDoGesto();
      return;
    }

    const r = this.recipientes.find((rc) => rc.contem(a));
    if (r) {
      const daEtapa = etapa?.tipo === 'despejar' && etapa.item === r.item;
      r.pegar();
      this.arrasto = { tipo: 'recipiente', r, daEtapa };
      if (daEtapa) this.runner.inicioDoGesto();
      return;
    }

    if (etapa?.tipo === 'mexer' && this.tigela.dentroAreaMexer(a.x, a.y)) {
      this.arrasto = { tipo: 'mexer' };
      this.runner.inicioDoGesto();
      this.guiaMexer.setVisible(false);
      this.alimentarMexer(a);
    }
  }

  private aoMover(a: AmostraPonteiro): void {
    this.dedo = { x: a.x, y: a.y };
    if (this.arrasto?.tipo === 'mexer') this.alimentarMexer(a);
  }

  private aoSoltar(): void {
    const arr = this.arrasto;
    this.arrasto = null;
    if (!arr) return;

    switch (arr.tipo) {
      case 'recipiente': {
        const soltouNaTigela = ZONA_DESPEJO.contains(arr.r.x, arr.r.y);
        this.inclinacao.parar();
        this.travaX = null;
        this.bico = null;
        arr.r.voltarParaMesa();
        if (arr.daEtapa) this.runner.fimDoGesto();
        else if (soltouNaTigela) {
          const etapa = this.runner.etapa;
          this.bus.emit('feedback:rejeicao', { item: arr.r.item, esperado: etapa?.tipo === 'despejar' ? etapa.item : null });
        }
        break;
      }
      case 'colher':
        this.colher.voltar();
        this.runner.fimDoGesto();
        break;
      case 'mexer':
        this.runner.fimDoGesto();
        this.tweens.add({ targets: this.colherMexer, x: this.colherMexer.descanso.x, y: this.colherMexer.descanso.y, duration: 250 });
        if (this.runner.etapa?.tipo === 'mexer' && this.runner.estado.sub === 'aguardando') this.guiaMexer.setVisible(true);
        break;
    }
  }

  private alimentarMexer(a: AmostraPonteiro): void {
    const ctrl = this.runner.controlador;
    if (!(ctrl instanceof StirStep)) return;
    const n = this.tigela.normalizarMexer(a.x, a.y);
    const r = ctrl.amostra(n.x, n.y, a.t);
    if (r.ganho > 0) this.runner.notificarProgresso();
  }

  // ---------------------------------------------------------------- loop

  override update(_tempo: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, DT_MAX_MS);
    const arr = this.arrasto;

    if (arr?.tipo === 'recipiente') this.atualizarRecipiente(arr.r, arr.daEtapa, dt);
    if (arr?.tipo === 'colher') this.atualizarColher(dt);
    if (arr?.tipo === 'mexer') this.colherMexer.seguir({ x: this.dedo.x, y: this.dedo.y + 10 }, dt);

    const ctrl = this.runner.controlador;
    if (ctrl instanceof StirStep) {
      this.mistura = ctrl.progresso;
      this.barra.definir(ctrl.progresso, ctrl.progressoPendente);
    }
    const redemoinho = ctrl instanceof StirStep ? ctrl.acumulador.anguloAtual : 0;
    this.tigela.desenhar(this.conteudo, this.cores, this.mistura, redemoinho);
    this.debug.atualizar();
  }

  private atualizarRecipiente(r: PourContainer, daEtapa: boolean, dt: number): void {
    if (this.travaX === null) {
      r.seguir(this.dedo, dt);
      // Só o ingrediente da vez trava sobre a tigela; os outros passam reto (e são rejeitados ao soltar).
      if (daEtapa && ZONA_DESPEJO.contains(r.x, r.y)) {
        this.travaX = r.x;
        this.inclinacao.iniciar(this.dedo.x);
      }
    } else {
      const yAlvo = clamp(this.dedo.y, ZONA_DESPEJO.top, ZONA_DESPEJO.bottom);
      r.seguir({ x: this.travaX, y: yAlvo }, dt, this.travaX);
      this.inclinacao.atualizar(this.dedo.x);
      const saiu =
        this.inclinacao.recuo(this.dedo.x) > CONFIG_DESPEJAR.recuoParaSairPx ||
        this.dedo.y < ZONA_DESPEJO.top - 60 ||
        this.dedo.y > ZONA_DESPEJO.bottom + 60;
      if (saiu) {
        this.travaX = null;
        this.inclinacao.parar();
      }
    }
    const angulo = this.inclinacao.anguloGraus;
    r.angle = amortecer(r.angle, angulo, 25, dt / 1000);

    const ctrl = this.runner.controlador;
    if (!daEtapa || !(ctrl instanceof PourStep)) return;

    this.bico = posicaoBico(r.x, r.y, r.largura, r.altura, r.angle);
    this.bicoSobre = bicoSobreBoca(this.bico, this.tigela.boca);
    const q = ctrl.tick({ segurando: true, anguloGraus: r.angle, bicoSobreAlvo: this.bicoSobre }, dt);
    if (q > 0) {
      this.conteudo.adicionar(ctrl.params.item, q);
      this.emitirParticulas(this.bico, q, r.corConteudo, ctrl.params.material);
      this.runner.notificarProgresso();
    }
    if (ctrl.emExcesso) this.runner.reportarErro('excesso');
    r.atualizarMedidor(ctrl);
  }

  private atualizarColher(dt: number): void {
    this.colher.seguir(this.dedo, dt);
    const ctrl = this.runner.controlador;
    if (!(ctrl instanceof PourStep)) return;

    if (!this.colher.carregada && ctrl.emExcesso && this.tigela.dentroDaBoca(this.colher.x, this.colher.y)) {
      const removido = ctrl.retirarColherada();
      if (removido > 0) {
        this.conteudo.remover(ctrl.params.item, removido);
        this.colher.carregar(this.cores[ctrl.params.item] ?? 0xffffff);
        this.recipienteDaEtapa()?.atualizarMedidor(ctrl);
        this.runner.notificarProgresso();
        if (!ctrl.emExcesso) this.falar('Isso! Agora está certinho. Pode soltar a colher.', 'feliz');
      }
    }
    if (this.colher.carregada && distancia(this.colher, PRATINHO_DESCARTE) < PRATINHO_DESCARTE.raio) {
      this.colher.descarregar();
      this.montesDescartados++;
      this.desenharMontes();
    }
  }

  private emitirParticulas(bico: Ponto, q: number, cor: number, material: keyof typeof VAZAO): void {
    this.particulasPendentes += q * PARTICULAS_POR_XICARA;
    const n = Math.floor(this.particulasPendentes);
    if (n <= 0) return;
    this.particulasPendentes -= n;
    const v0 = VAZAO[material].velocidadeParticula;
    const queda = Math.max(10, this.tigela.ySuperficie(this.conteudo.total) - bico.y);
    // tempo até tocar a superfície: queda = v0·t + g·t²/2
    const t = (-v0 + Math.sqrt(v0 * v0 + 2 * 900 * queda)) / 900;
    this.particulas.particleTint = cor;
    this.particulas.setParticleLifespan(t * 1000);
    this.particulas.setParticleSpeed(0, v0);
    this.particulas.emitParticleAt(bico.x, bico.y, n);
  }

  // ---------------------------------------------------------------- estado

  private aoMudarEstado(anterior: EstadoReceita, atual: EstadoReceita): void {
    const novaEtapa = atual.sub === 'aguardando' && (anterior.sub === 'introducao' || anterior.sub === 'concluida');
    if (novaEtapa) this.prepararEtapa(atual.indice);

    if (atual.sub === 'correcao' && anterior.sub !== 'correcao') {
      this.colher.setPosition(DESCANSO_COLHER.x, DESCANSO_COLHER.y).setVisible(true).setAlpha(0);
      this.tweens.add({ targets: [this.colher, this.pratinho], alpha: 1, duration: 300 });
      this.pratinho.setVisible(true);
    }
    if (anterior.sub === 'correcao' && atual.sub !== 'correcao') {
      this.tweens.add({ targets: [this.colher, this.pratinho], alpha: 0, duration: 300, onComplete: () => { this.colher.setVisible(false); this.pratinho.setVisible(false); } });
    }
  }

  private prepararEtapa(indice: number): void {
    this.cartao.definirAtual(indice);
    const etapa = this.receita.etapas[indice];
    if (!etapa) return;
    if (etapa.tipo === 'despejar') {
      const def = INGREDIENTES[etapa.item];
      this.falar(`Agora: ${def?.nome ?? etapa.item}! Leve até a tigela e incline.`, 'feliz');
      const r = this.recipienteDaEtapa();
      const ctrl = this.runner.controlador;
      if (r && ctrl instanceof PourStep) r.atualizarMedidor(ctrl);
      r?.balancar();
    } else {
      this.falar('Hora de mexer! Gire o dedo dentro da tigela.', 'feliz');
      this.colherMexer.setVisible(true);
      this.barra.setVisible(true);
      this.guiaMexer.setVisible(true);
    }
  }

  private comemorar(indice: number): void {
    this.cartao.marcarFeita(indice);
    const etapa = this.receita.etapas[indice];
    if (etapa?.tipo === 'despejar') this.recipientes.find((r) => r.item === etapa.item)?.aposentar();
    if (etapa?.tipo === 'mexer') this.guiaMexer.setVisible(false);
    this.falar(['Muito bem!', 'Isso aí!', 'Que capricho!'][indice % 3] ?? 'Muito bem!', 'feliz');
    this.estrelas(TIGELA.cx, TIGELA.bordaY - 40);
    // A etapa JÁ foi concluída pela criança; aqui só esperamos a comemoração terminar.
    this.time.delayedCall(1100, () => this.runner.proxima());
  }

  private rejeitar(item: string, esperado: string | null): void {
    const nomeEsperado = esperado ? INGREDIENTES[esperado]?.nome : null;
    this.falar(nomeEsperado ? `Ainda não! Agora é a vez do ${nomeEsperado}.` : 'Esse agora não!', 'neutro');
    this.cartao.destacar(this.runner.estado.indice);
    this.recipientes.find((r) => r.item === esperado)?.balancar();
    void item;
  }

  private terminar(): void {
    this.colherMexer.setVisible(false);
    const painel = this.add.container(LARGURA / 2, ALTURA / 2).setDepth(200).setScale(0.6).setAlpha(0);
    const fundo = this.add.graphics();
    fundo.fillStyle(0xffffff, 0.97);
    fundo.fillRoundedRect(-280, -150, 560, 300, 28);
    fundo.lineStyle(6, CORES.sucesso, 1);
    fundo.strokeRoundedRect(-280, -150, 560, 300, 28);
    const titulo = this.add.text(0, -80, 'Massa pronta! ⭐', { fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif', fontSize: '48px', color: '#3b2a20', fontStyle: 'bold' }).setOrigin(0.5);
    const sub = this.add.text(0, -20, 'Fim do protótipo (Milestone 1)', { fontFamily: 'Arial, sans-serif', fontSize: '22px', color: '#6b5a4e' }).setOrigin(0.5);
    const botao = this.add.container(0, 80);
    const bg = this.add.graphics();
    bg.fillStyle(CORES.sucesso, 1);
    bg.fillRoundedRect(-150, -40, 300, 80, 40);
    const txt = this.add.text(0, 0, '↻  De novo', { fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif', fontSize: '34px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    botao.add([bg, txt]).setSize(300, 80).setInteractive({ useHandCursor: true });
    botao.on('pointerup', () => this.scene.start('Menu'));
    painel.add([fundo, titulo, sub, botao]);
    this.tweens.add({ targets: painel, scale: 1, alpha: 1, duration: 450, ease: 'Back.Out' });
    this.estrelas(LARGURA / 2, ALTURA / 2 - 100, 30);
  }

  // ---------------------------------------------------------------- visual

  private recipienteDaEtapa(): PourContainer | undefined {
    const etapa = this.runner.etapa;
    return etapa?.tipo === 'despejar' ? this.recipientes.find((r) => r.item === etapa.item) : undefined;
  }

  private falar(texto: string, humor: 'feliz' | 'surpreso' | 'neutro'): void {
    this.bus.emit('mascote:fala', { texto, humor });
  }

  private desenharCenario(): void {
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(CORES.parede, 1);
    g.fillRect(0, 0, LARGURA, MESA_Y);
    g.fillStyle(0xffffff, 0.35);
    for (let x = 0; x < LARGURA; x += 80) for (let y = 0; y < MESA_Y; y += 80) if (((x + y) / 80) % 2 === 0) g.fillRect(x, y, 80, 80);
    g.fillStyle(CORES.mesa, 1);
    g.fillRect(0, MESA_Y, LARGURA, ALTURA - MESA_Y);
    g.fillStyle(CORES.mesaBorda, 1);
    g.fillRect(0, MESA_Y, LARGURA, 10);
  }

  private criarPratinho(): Phaser.GameObjects.Container {
    const c = this.add.container(PRATINHO_DESCARTE.x, PRATINHO_DESCARTE.y).setDepth(15).setVisible(false);
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(0, 0, PRATINHO_DESCARTE.raio * 2, PRATINHO_DESCARTE.raio * 0.9);
    g.lineStyle(4, CORES.vidroBorda, 1);
    g.strokeEllipse(0, 0, PRATINHO_DESCARTE.raio * 2, PRATINHO_DESCARTE.raio * 0.9);
    const montes = this.add.graphics().setName('montes');
    c.add([g, montes]);
    return c;
  }

  private desenharMontes(): void {
    const m = this.pratinho.getByName('montes') as Phaser.GameObjects.Graphics;
    const etapa = this.runner.etapa;
    const cor = etapa?.tipo === 'despejar' ? (this.cores[etapa.item] ?? 0xffffff) : 0xffffff;
    m.fillStyle(cor, 1);
    const i = this.montesDescartados - 1;
    m.fillEllipse(-20 + (i % 3) * 20, -4 - Math.floor(i / 3) * 6, 26, 14);
  }

  private desenharGuiaMexer(): void {
    const g = this.guiaMexer;
    g.lineStyle(5, 0xffffff, 0.7);
    const rx = AREA_MEXER.rx * 0.62, ry = AREA_MEXER.ry * 0.62;
    const pts: Ponto[] = [];
    for (let i = 0; i <= 40; i++) {
      const a = -Math.PI / 2 + (i / 40) * Math.PI * 1.7;
      pts.push({ x: AREA_MEXER.cx + Math.cos(a) * rx, y: AREA_MEXER.cy + Math.sin(a) * ry });
    }
    g.strokePoints(pts, false);
    const fim = pts[pts.length - 1]!;
    g.fillStyle(0xffffff, 0.8);
    g.fillTriangle(fim.x - 12, fim.y - 10, fim.x + 12, fim.y - 6, fim.x - 2, fim.y + 14);
  }

  private estrelas(x: number, y: number, n = 14): void {
    const e = this.add.particles(x, y, 'estrela', {
      speed: { min: 150, max: 350 },
      angle: { min: 200, max: 340 },
      gravityY: 500,
      lifespan: 900,
      scale: { start: 1, end: 0.3 },
      alpha: { start: 1, end: 0 },
      tint: [CORES.destaque, 0xffffff, 0xe69f00],
      emitting: false,
    }).setDepth(80);
    e.explode(n);
    this.time.delayedCall(1200, () => e.destroy());
  }

  // ---------------------------------------------------------------- debug

  private infoDebug(g: Phaser.GameObjects.Graphics): string[] {
    const s = this.runner.estado;
    const etapa = this.runner.etapa;
    const ctrl = this.runner.controlador;
    const linhas = [
      `Receita ${this.receita.id} [${this.receita.dificuldade}]`,
      `FSM ${s.sub}  etapa ${s.indice + 1}/${s.total} (${etapa?.tipo ?? '-'})${s.erro ? `  erro=${s.erro}` : ''}`,
      `Tigela: total ${this.conteudo.total.toFixed(2)} xíc  nível ${(this.conteudo.nivel * 100).toFixed(0)}%`,
    ];

    // colisores
    g.lineStyle(2, 0xff00ff, 1);
    g.strokeRectShape(ZONA_DESPEJO);
    const b = this.tigela.boca;
    g.lineStyle(2, 0x00ffff, 1);
    g.strokeRect(b.cx - b.meiaLargura, b.bordaY - b.alturaMax, b.meiaLargura * 2, b.alturaMax);
    for (const r of this.recipientes) {
      g.lineStyle(1, 0xffff00, 0.8);
      g.strokeRect(r.x - r.largura / 2 - 10, r.y - r.altura / 2 - 10, r.largura + 20, r.altura + 20);
    }
    if (this.pratinho.visible) g.strokeCircle(PRATINHO_DESCARTE.x, PRATINHO_DESCARTE.y, PRATINHO_DESCARTE.raio);

    if (ctrl instanceof PourStep) {
      const r = this.recipienteDaEtapa();
      const segurando = this.arrasto?.tipo === 'recipiente' && this.arrasto.daEtapa;
      linhas.push(
        `Despejar ${ctrl.params.item} (${ctrl.params.material})`,
        `  ângulo ${(r?.angle ?? 0).toFixed(0)}°  vazão ${(segurando ? ctrl.vazaoAtual : 0).toFixed(3)} xíc/s  bico sobre: ${segurando && this.bicoSobre ? 'SIM' : 'não'}`,
        `  despejado ${ctrl.despejado.toFixed(3)}  faixa [${ctrl.limiteInferior.toFixed(2)}, ${ctrl.limiteSuperior.toFixed(2)}]  restante ${ctrl.disponivel.toFixed(2)}`,
        `  travado ${this.travaX !== null}  meta ${ctrl.metaAtingida() ? 'OK' : '—'}  excesso ${ctrl.emExcesso}`,
      );
      if (this.bico && this.arrasto?.tipo === 'recipiente') {
        g.fillStyle(this.bicoSobre ? 0x00ff00 : 0xff0000, 1);
        g.fillCircle(this.bico.x, this.bico.y, 7);
      }
    }
    if (ctrl instanceof StirStep) {
      const acc = ctrl.acumulador;
      linhas.push(
        `Mexer: voltas ${ctrl.voltas.toFixed(2)} / ${ctrl.voltasMeta}   pendente ${(acc.pendenteRad / Math.PI).toFixed(2)}π`,
        `  ω ${acc.velocidadeAngular.toFixed(2)} rad/s  sentido ${acc.sentidoAtual}  amostra: ${acc.motivo}`,
        `  massa estágio ${BowlView.estagio(this.mistura) + 1}/4 (${(this.mistura * 100).toFixed(0)}%)`,
      );
      const elipse = (k: number, cor: number) => {
        g.lineStyle(2, cor, 1);
        g.strokeEllipse(AREA_MEXER.cx, AREA_MEXER.cy, AREA_MEXER.rx * 2 * k, AREA_MEXER.ry * 2 * k);
      };
      elipse(0.3, 0xff0000);
      elipse(0.95, 0x00ff00);
      elipse(1, 0xffffff);
      const atual = this.gestos.atual;
      if (atual && this.arrasto?.tipo === 'mexer') {
        const n = this.tigela.normalizarMexer(atual.x, atual.y);
        const dentro = Math.hypot(n.x, n.y) / RAIO_NORMALIZADO;
        g.fillStyle(dentro >= 0.3 && dentro <= 0.95 ? 0x00ff00 : 0xff0000, 1);
        g.fillCircle(atual.x, atual.y, 8);
      }
    }
    return linhas;
  }
}
