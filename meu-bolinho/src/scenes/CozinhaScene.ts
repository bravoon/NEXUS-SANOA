/**
 * Cozinha: estação da tigela (despejar, quebrar ovo, mexer) e estação da forma
 * (untar, despejar a massa).
 *
 * A cena NUNCA altera progresso por conta própria: toda quantidade sai de tick() com o dedo
 * segurando, toda volta de amostra(), toda área untada de pintar(), todo ovo de toque().
 * Tweens aqui são só cosméticos (voltar à mesa, trocar de estação, cascas se abrindo).
 */
import Phaser from 'phaser';
import { assarGraphics } from '../utils/CacheGrafico';
import { CONFIG_DESPEJAR, CONFIG_OVO, VAZAO, type Material } from '../config/gameplay';
import {
  AREA_MEXER,
  BARRA_MEXER,
  CAIXA_OVOS,
  CORES,
  DESCANSO_COLHER,
  FORMA,
  PRATELEIRA,
  posicoesRecipientes,
  PRATINHO_DESCARTE,
  RECIPIENTE,
  TIGELA,
  TIGELA_LATERAL,
} from '../config/layout';
import { INGREDIENTES } from '../data/registry';
import { sombra, TEXTURAS } from '../art/ArteProcedural';
import type { DicaEtapa } from '../entities/HintPresenter';
import { BowlView } from '../entities/Bowl';
import { EggView } from '../entities/Egg';
import { Ferramenta } from '../entities/Ferramentas';
import { PanView } from '../entities/Pan';
import { PourContainer } from '../entities/PourContainer';
import { ProgressBar } from '../entities/ProgressBar';
import { Spoon } from '../entities/Spoon';
import { mascaraElipse } from '../systems/coverage/CoverageGrid';
import { bicoSobreBoca, posicaoBico, type BocaAlvo } from '../systems/fill/pourFlow';
import type { AmostraPonteiro } from '../systems/gesture/GestureSystem';
import { TiltRecognizer } from '../systems/gesture/recognizers/TiltRecognizer';
import { ITEM_OVO } from '../systems/recipe/recipeLoader';
import type { EstadoReceita, TipoErro } from '../systems/recipe/recipeFsm';
import type { EtapaResolvida } from '../systems/recipe/recipeTypes';
import { CoverageStep } from '../systems/steps/CoverageStep';
import { EggStep } from '../systems/steps/EggStep';
import { PourOutStep } from '../systems/steps/PourOutStep';
import { BeatStep } from '../systems/steps/BeatStep';
import { GrateStep } from '../systems/steps/GrateStep';
import { SiftStep } from '../systems/steps/SiftStep';
import { PourStep } from '../systems/steps/PourStep';
import { RAIO_NORMALIZADO, StirStep } from '../systems/steps/StirStep';
import { corHex, desenharSimbolo, escurecer } from '../utils/desenho';
import { amortecer, clamp, distancia, type Ponto } from '../utils/math';
import { CenaEtapas } from './CenaEtapas';
import { Qualidade } from '../utils/Qualidade';

type Arrasto =
  | { tipo: 'recipiente'; r: PourContainer; daEtapa: boolean }
  | { tipo: 'colher' }
  | { tipo: 'mexer' }
  | { tipo: 'ovo'; ovo: EggView }
  | { tipo: 'tocar_ovo' }
  | { tipo: 'untar' }
  | { tipo: 'tigela'; offset: Ponto }
  | { tipo: 'bater' }
  | { tipo: 'peneira' }
  | { tipo: 'pedaco' };

type Estacao = 'tigela' | 'forma';

/** Zona acima da tigela onde o recipiente da etapa trava e passa a inclinar (ver §12 da arquitetura). */
const ZONA_DESPEJO = new Phaser.Geom.Rectangle(TIGELA.cx - TIGELA.raio * 0.85, TIGELA.bordaY - 330, TIGELA.raio * 0.85 + 60, 290);
/** Zona (centro da borda da tigela reduzida) onde ela trava acima da forma. */
const ZONA_FORMA = new Phaser.Geom.Rectangle(FORMA.cx - 130, FORMA.cy - 330, 160, 220);
const BOCA_FORMA: BocaAlvo = { cx: FORMA.cx, bordaY: FORMA.cy, meiaLargura: FORMA.rxInterno * 0.85, alturaMax: 420 };
const PARTICULAS_POR_XICARA = 160;
/** Peneira: descanso e região "sobre a tigela" (centro do aro). */
const DESCANSO_PENEIRA = { x: 1110, y: 300 };
const SOBRE_TIGELA = new Phaser.Geom.Rectangle(TIGELA.cx - TIGELA.raio * 0.8, TIGELA.bordaY - 280, TIGELA.raio * 1.6, 260);
/** Ralador em pé dentro da tigela; a face (onde o pedaço rala) é este retângulo. */
const RALADOR = { x: TIGELA.cx + 10, y: TIGELA.bordaY - 120 };
const FACE_RALADOR = new Phaser.Geom.Rectangle(RALADOR.x - 70, RALADOR.y - 105, 140, 210);
const DESCANSO_PEDACO = { x: 1110, y: 420 };

export class CozinhaScene extends CenaEtapas {
  private tigela!: BowlView;
  private recipientes: PourContainer[] = [];
  private colher!: Spoon;
  private colherMexer!: Spoon;
  private pratinho!: Phaser.GameObjects.Container;
  private barra!: ProgressBar;
  private guiaMexer!: Phaser.GameObjects.Image;
  private particulas!: Phaser.GameObjects.Particles.ParticleEmitter;
  private poeira!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sombraTigela!: Phaser.GameObjects.Image;
  private oitavoMexer = 0;
  private caixaOvos: Phaser.GameObjects.Image | null = null;
  private ovos: EggView[] = [];
  private ovoNaBorda: EggView | null = null;
  private forma: PanView | null = null;
  private manteiga: Ferramenta | null = null;
  private batedor: Ferramenta | null = null;
  private peneira: Ferramenta | null = null;
  private montePeneira: Phaser.GameObjects.Graphics | null = null;
  private ralador: Ferramenta | null = null;
  private pedaco: Phaser.GameObjects.Container | null = null;

  private readonly cores: Record<string, number> = {};
  private readonly inclinacao = new TiltRecognizer();
  private estacao: Estacao = 'tigela';
  private arrasto: Arrasto | null = null;
  private travaX: number | null = null;
  private bico: Ponto | null = null;
  private bicoSobre = false;
  private particulasPendentes = 0;
  private montesDescartados = 0;

  constructor() {
    super('Cozinha');
  }

  override init(dados: Parameters<CenaEtapas['init']>[0]): void {
    super.init(dados);
    this.recipientes = [];
    this.ovos = [];
    this.ovoNaBorda = null;
    this.forma = null;
    this.manteiga = null;
    this.batedor = null;
    this.peneira = null;
    this.montePeneira = null;
    this.ralador = null;
    this.pedaco = null;
    this.caixaOvos = null;
    this.arrasto = null;
    this.travaX = null;
    this.estacao = 'tigela';
    this.montesDescartados = 0;
    for (const [id, def] of Object.entries(INGREDIENTES)) this.cores[id] = corHex(def.corConteudo);
  }

  // ================================================================ cenário

  protected criarCenario(): void {
    this.add.image(0, 0, TEXTURAS.fundoCozinha).setOrigin(0).setDepth(0);

    const receita = this.sessao.receita;
    // sombra estreita e baixa: o vidro é transparente, então ela não pode aparecer "dentro" da tigela
    this.sombraTigela = sombra(this, TIGELA.cx, TIGELA.bordaY + TIGELA.profundidade + 8, 220, 2).setDisplaySize(220, 34).setAlpha(0.55);
    this.tigela = new BowlView(this, corHex(receita.corMassa));
    const posicoes = posicoesRecipientes(receita.recipientes.length);
    if (posicoes.some((p) => p.y === PRATELEIRA.y)) {
      // prateleira de trás para receitas com mais de 4 potes
      const t = this.add.graphics().setDepth(1);
      t.fillStyle(0x8a5530, 1);
      t.fillRect(40, PRATELEIRA.tabuaY, 500, 14);
      t.fillStyle(0xc98b55, 1);
      t.fillRect(40, PRATELEIRA.tabuaY, 500, 6);
    }
    receita.recipientes.forEach((item, i) => {
      const def = INGREDIENTES[item];
      const pos = posicoes[i];
      if (!def || !pos) throw new Error(`Sem lugar na mesa para "${item}"`);
      sombra(this, pos.x, pos.y + RECIPIENTE.altura / 2 + 2, 110, 2);
      this.recipientes.push(new PourContainer(this, item, def, pos));
    });

    this.pratinho = this.criarPratinho();
    this.colher = new Spoon(this, DESCANSO_COLHER).setVisible(false);
    this.colherMexer = new Spoon(this, { x: TIGELA.cx + 40, y: TIGELA.bordaY - 10 }, 1.15).setVisible(false);
    this.barra = new ProgressBar(this, BARRA_MEXER.x, BARRA_MEXER.y, BARRA_MEXER.largura, BARRA_MEXER.altura).setVisible(false);
    const guia = this.add.graphics().setDepth(31).setVisible(false);
    this.desenharGuiaMexer(guia);
    this.guiaMexer = assarGraphics(this, guia, 'guia:mexer', { x: AREA_MEXER.cx - 140, y: AREA_MEXER.cy - 100, largura: 280, altura: 200 });

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
    this.poeira = this.add.particles(0, 0, TEXTURAS.po, {
      emitting: false,
      lifespan: 700,
      speed: { min: 20, max: 60 },
      angle: { min: 200, max: 340 },
      scale: { start: 0.8, end: 2.2 },
      alpha: { start: 0.7, end: 0 },
      maxAliveParticles: 60,
    });
    this.poeira.setDepth(26);

    // Ingredientes já despejados (ao voltar para a cena) saem da mesa
    const indice = this.runner.estado.indice;
    this.sessao.receita.etapas.slice(0, indice).forEach((e) => {
      if (e.tipo === 'despejar') this.recipientes.find((r) => r.item === e.item)?.aposentar();
    });
  }

  // ================================================================ etapas

  protected prepararEtapa(_indice: number, etapa: EtapaResolvida): void {
    const ctrl = this.runner.controlador;
    switch (etapa.tipo) {
      case 'despejar': {
        this.irParaEstacao('tigela');
        const def = INGREDIENTES[etapa.item];
        this.falar(`despejar.${etapa.item}`);
        void def;
        const r = this.recipienteDaEtapa();
        if (r && ctrl instanceof PourStep) r.atualizarMedidor(ctrl);
        r?.balancar();
        break;
      }
      case 'quebrar_ovo':
        this.irParaEstacao('tigela');
        this.criarOvos(etapa.quantidade);
        this.falar('ovo.inicio');
        break;
      case 'mexer':
        this.irParaEstacao('tigela');
        this.falar('mexer.inicio');
        this.colherMexer.setVisible(true);
        this.barra.setVisible(true);
        this.guiaMexer.setVisible(true);
        break;
      case 'untar': {
        this.irParaEstacao('forma');
        const forma = this.forma!;
        forma.criarCamadaManteiga();
        if (ctrl instanceof CoverageStep) ctrl.definirSuperficie(forma.areaFundo, mascaraElipse(forma.areaFundo));
        this.manteiga = new Ferramenta(this, 'manteiga', { x: FORMA.cx + FORMA.rx + 90, y: FORMA.cy });
        this.barra.setVisible(true);
        this.falar('untar.inicio');
        break;
      }
      case 'despejar_massa':
        this.irParaEstacao('forma');
        this.barra.setVisible(true);
        this.falar('massa.inicio');
        this.tweens.add({ targets: this.tigela, angle: { from: -6, to: 6 }, duration: 120, yoyo: true, repeat: 2, onComplete: () => this.tigela.setAngle(0) });
        break;
      case 'bater':
        this.irParaEstacao('tigela');
        this.batedor = new Ferramenta(this, 'batedor', { x: TIGELA.cx + TIGELA.raio + 70, y: TIGELA.bordaY + 40 });
        this.barra.setVisible(true);
        this.falar('bater.inicio');
        break;
      case 'peneirar': {
        this.irParaEstacao('tigela');
        this.peneira = new Ferramenta(this, 'peneira', { ...DESCANSO_PENEIRA }, 150);
        this.montePeneira = this.add.graphics();
        this.peneira.add(this.montePeneira);
        this.desenharMontePeneira(1);
        this.barra.setVisible(true);
        this.falar('peneirar.inicio');
        break;
      }
      case 'ralar': {
        this.irParaEstacao('tigela');
        this.ralador = new Ferramenta(this, 'ralador', { ...RALADOR });
        this.ralador.setDepth(22);
        this.pedaco = this.criarPedaco(etapa.item);
        this.barra.setVisible(true);
        this.falar('ralar.inicio');
        break;
      }
      default:
        break;
    }
  }

  /** Monte do ingrediente dentro da peneira (encolhe conforme cai). */
  private desenharMontePeneira(fracao: number): void {
    const g = this.montePeneira;
    const etapa = this.runner.etapa;
    if (!g || etapa?.tipo !== 'peneirar') return;
    g.clear();
    if (fracao <= 0.001) return;
    const cor = this.cores[etapa.item] ?? 0xffffff;
    const k = 0.35 + 0.65 * fracao;
    g.fillStyle(cor, 1);
    g.fillEllipse(0, -6 * k, 120 * k, 40 * k);
    g.fillStyle(escurecer(cor, 0.12), 1);
    g.fillEllipse(-14 * k, -14 * k, 50 * k, 18 * k);
  }

  /** Pedaço a ralar (coco, chocolate, maçã...): cor do ingrediente + símbolo dele. */
  private criarPedaco(item: string): Phaser.GameObjects.Container {
    const def = INGREDIENTES[item];
    const cor = def ? corHex(def.corRecipiente) : 0xaaaaaa;
    const c = this.add.container(DESCANSO_PEDACO.x, DESCANSO_PEDACO.y).setDepth(55);
    const g = this.add.graphics();
    g.fillStyle(cor, 1);
    g.fillRoundedRect(-40, -50, 80, 100, 22);
    g.lineStyle(4, escurecer(cor, 0.45), 1);
    g.strokeRoundedRect(-40, -50, 80, 100, 22);
    g.fillStyle(def ? corHex(def.corConteudo) : 0xffffff, 1);
    g.fillRoundedRect(-30, 26, 60, 18, 8); // lado já ralado (aparece por baixo)
    if (def) desenharSimbolo(g, def.simbolo, 0, -8, 36, 0xffffff);
    c.add(g);
    assarGraphics(this, g, `pedaco:${item}`, { x: -46, y: -56, largura: 92, altura: 112 });
    return c;
  }

  protected override aoConcluirEtapa(_indice: number, etapa: EtapaResolvida): void {
    switch (etapa.tipo) {
      case 'despejar':
        this.recipientes.find((r) => r.item === etapa.item)?.aposentar();
        break;
      case 'quebrar_ovo':
        this.caixaOvos?.destroy();
        this.caixaOvos = null;
        break;
      case 'mexer':
        this.sessao.mistura = 1;
        this.guiaMexer.setVisible(false);
        this.colherMexer.setVisible(false);
        this.barra.setVisible(false);
        break;
      case 'untar':
        this.manteiga?.destroy();
        this.manteiga = null;
        this.barra.setVisible(false);
        break;
      case 'despejar_massa':
        this.barra.setVisible(false);
        break;
      case 'bater':
        this.batedor?.destroy();
        this.batedor = null;
        this.barra.setVisible(false);
        this.falar('bater.ok');
        break;
      case 'peneirar':
        this.peneira?.destroy();
        this.peneira = null;
        this.montePeneira = null;
        this.barra.setVisible(false);
        this.falar('peneirar.ok');
        break;
      case 'ralar':
        this.ralador?.destroy();
        this.ralador = null;
        this.pedaco?.destroy();
        this.pedaco = null;
        this.barra.setVisible(false);
        this.falar('ralar.ok');
        break;
      default:
        break;
    }
  }

  protected override aoErro(erro: TipoErro): void {
    if (erro === 'excesso') this.falar('excesso', 'surpreso');
    if (erro === 'casca') this.falar('casca', 'surpreso');
  }

  protected override aoMudarEstado(anterior: EstadoReceita, atual: EstadoReceita): void {
    if (atual.sub === 'correcao' && anterior.sub !== 'correcao') {
      this.colher.setPosition(DESCANSO_COLHER.x, DESCANSO_COLHER.y).setVisible(true).setAlpha(0);
      this.pratinho.setVisible(true);
      this.tweens.add({ targets: [this.colher, this.pratinho], alpha: 1, duration: 300 });
    }
    if (anterior.sub === 'correcao' && atual.sub !== 'correcao') {
      this.tweens.add({
        targets: [this.colher, this.pratinho],
        alpha: 0,
        duration: 300,
        onComplete: () => {
          this.colher.setVisible(false);
          this.pratinho.setVisible(false);
        },
      });
    }
  }

  /** Troca de estação (cosmético): a tigela vai para o lado e a forma aparece no centro. */
  private irParaEstacao(estacao: Estacao): void {
    if (this.estacao === estacao) return;
    this.estacao = estacao;
    if (estacao === 'forma') {
      this.tweens.add({ targets: this.tigela, x: TIGELA_LATERAL.x, y: TIGELA_LATERAL.y, scale: TIGELA_LATERAL.escala, duration: 500, ease: 'Sine.InOut' });
      this.tweens.add({
        targets: this.sombraTigela,
        x: TIGELA_LATERAL.x,
        y: TIGELA_LATERAL.y + TIGELA.profundidade * TIGELA_LATERAL.escala + 6,
        displayWidth: 220 * TIGELA_LATERAL.escala,
        displayHeight: 34 * TIGELA_LATERAL.escala,
        duration: 500,
      });
      if (!this.forma) {
        sombra(this, FORMA.cx, FORMA.cy + FORMA.ry + 20, FORMA.rx * 2.2, 2);
        this.forma = new PanView(this, FORMA.cx, FORMA.cy, 1, corHex(this.sessao.receita.corMassa));
        this.forma.setAlpha(0);
        this.tweens.add({ targets: this.forma.objetos, alpha: 1, duration: 500 });
      }
      for (const r of this.recipientes) if (r.estado !== 'usado') r.aposentar();
    } else {
      this.tweens.add({ targets: this.tigela, x: TIGELA.cx, y: TIGELA.bordaY, scale: 1, duration: 500, ease: 'Sine.InOut' });
      this.forma?.setVisible(false);
    }
  }

  private criarOvos(n: number): void {
    this.caixaOvos?.destroy();
    const g = this.add.graphics().setDepth(30);
    const largura = n * CAIXA_OVOS.espaco + 20;
    g.fillStyle(0xc9a66b, 1);
    g.fillRoundedRect(CAIXA_OVOS.x - largura / 2, CAIXA_OVOS.y - 4, largura, 50, 10);
    g.lineStyle(3, 0x8a6a3a, 1);
    g.strokeRoundedRect(CAIXA_OVOS.x - largura / 2, CAIXA_OVOS.y - 4, largura, 50, 10);
    this.caixaOvos = assarGraphics(this, g, `caixa-ovos:${n}`, { x: CAIXA_OVOS.x - largura / 2 - 4, y: CAIXA_OVOS.y - 8, largura: largura + 8, altura: 58 });
    this.ovos = Array.from({ length: n }, (_, i) => new EggView(this, { x: CAIXA_OVOS.x + (i - (n - 1) / 2) * CAIXA_OVOS.espaco, y: CAIXA_OVOS.y - 6 }));
  }

  // ================================================================ input

  protected aoTocar(a: AmostraPonteiro): void {
    if (this.arrasto) return;
    const etapa = this.runner.etapa;
    const ctrl = this.runner.controlador;

    if (this.runner.estado.sub === 'correcao' && this.colher.contem(a)) {
      this.arrasto = { tipo: 'colher' };
      this.runner.inicioDoGesto();
      return;
    }

    if (etapa?.tipo === 'quebrar_ovo' && ctrl instanceof EggStep) {
      if (this.ovoNaBorda?.contem(a)) {
        this.arrasto = { tipo: 'tocar_ovo' };
        this.runner.inicioDoGesto();
        this.tocarOvo(ctrl, a.t);
        return;
      }
      const ovo = this.ovos.find((o) => o.visible && o !== this.ovoNaBorda && o.contem(a));
      if (ovo && ctrl.estadoOvo === 'na_caixa' && !this.ovoNaBorda) {
        this.som('pop');
        this.arrasto = { tipo: 'ovo', ovo };
        this.runner.inicioDoGesto();
        return;
      }
    }

    const r = this.estacao === 'tigela' ? this.recipientes.find((rc) => rc.contem(a)) : undefined;
    if (r) {
      const daEtapa = etapa?.tipo === 'despejar' && etapa.item === r.item;
      r.pegar();
      this.som('pop');
      this.arrasto = { tipo: 'recipiente', r, daEtapa };
      if (daEtapa) this.runner.inicioDoGesto();
      return;
    }

    if (etapa?.tipo === 'mexer' && this.tigela.dentroAreaMexer(a.x, a.y)) {
      this.arrasto = { tipo: 'mexer' };
      this.runner.inicioDoGesto();
      this.guiaMexer.setVisible(false);
      this.alimentarMexer(a);
      return;
    }

    if (etapa?.tipo === 'untar' && this.forma?.contem(a)) {
      this.arrasto = { tipo: 'untar' };
      this.runner.inicioDoGesto();
      this.pintarManteiga(a);
      return;
    }

    if (etapa?.tipo === 'bater' && (this.tigela.dentroAreaMexer(a.x, a.y) || this.batedor?.contem(a))) {
      this.arrasto = { tipo: 'bater' };
      this.runner.inicioDoGesto();
      this.alimentarBater(a);
      return;
    }

    if (etapa?.tipo === 'peneirar' && this.peneira?.contem(a)) {
      this.tweens.killTweensOf(this.peneira);
      this.arrasto = { tipo: 'peneira' };
      this.som('pop');
      this.runner.inicioDoGesto();
      return;
    }

    if (etapa?.tipo === 'ralar' && this.pedaco && distancia(a, this.pedaco) < 80) {
      this.tweens.killTweensOf(this.pedaco);
      this.arrasto = { tipo: 'pedaco' };
      this.som('pop');
      this.runner.inicioDoGesto();
      return;
    }

    if (etapa?.tipo === 'despejar_massa' && this.tigela.contemPonto(a.x, a.y)) {
      this.tweens.killTweensOf(this.tigela);
      this.arrasto = { tipo: 'tigela', offset: { x: this.tigela.x - a.x, y: this.tigela.y - a.y } };
      this.tigela.setDepth(40);
      this.runner.inicioDoGesto();
    }
  }

  protected aoMover(a: AmostraPonteiro): void {
    const arr = this.arrasto;
    if (arr?.tipo === 'mexer') this.alimentarMexer(a);
    if (arr?.tipo === 'untar') this.pintarManteiga(a);
    if (arr?.tipo === 'bater') this.alimentarBater(a);
    if (arr?.tipo === 'peneira') this.alimentarPeneira(a);
    if (arr?.tipo === 'pedaco') this.alimentarRalar(a);
  }

  /** O aro da peneira segue o dedo; sacudir sobre a tigela deixa cair o ingrediente. */
  private alimentarPeneira(a: AmostraPonteiro): void {
    const ctrl = this.runner.controlador;
    const p = this.peneira;
    if (!(ctrl instanceof SiftStep) || !p) return;
    const sobre = SOBRE_TIGELA.contains(p.x, p.y);
    const q = ctrl.amostra(a.x, a.t, sobre);
    if (q <= 0) return;
    this.sessao.tigela.adicionar(ctrl.item, q);
    const cor = this.cores[ctrl.item] ?? 0xffffff;
    const ySup = this.tigela.ySuperficie(this.sessao.tigela.total);
    for (const dx of [-40, 0, 40]) this.emitirParticulas({ x: p.x + dx, y: p.y + 14 }, q / 3, cor, 'po', ySup);
    this.desenharMontePeneira(1 - ctrl.progresso);
    this.som('colher');
    this.runner.notificarProgresso();
  }

  /** Passadas verticais do pedaço na face do ralador: cada uma rala uma porção. */
  private alimentarRalar(a: AmostraPonteiro): void {
    const ctrl = this.runner.controlador;
    const pd = this.pedaco;
    if (!(ctrl instanceof GrateStep) || !pd) return;
    // o pedaço acompanha o dedo direto (sem atraso): o ralador precisa sentir o vai e vem
    pd.setPosition(a.x, a.y);
    const noRalador = FACE_RALADOR.contains(a.x, a.y);
    const q = ctrl.amostra(a.x, a.y, a.t, noRalador);
    if (noRalador) this.somContinuo('pincel', 0.6);
    if (q <= 0) return;
    this.sessao.tigela.adicionar(ctrl.item, q);
    const cor = this.cores[ctrl.item] ?? 0xffffff;
    this.emitirParticulas({ x: RALADOR.x, y: RALADOR.y + 90 }, q, cor, 'po', this.tigela.ySuperficie(this.sessao.tigela.total));
    pd.setScale(0.4 + 0.6 * ctrl.pedaco);
    this.som('colher');
    this.runner.notificarProgresso();
  }

  protected aoSoltar(): void {
    const arr = this.arrasto;
    this.arrasto = null;
    if (!arr) return;
    const ctrl = this.runner.controlador;

    switch (arr.tipo) {
      case 'recipiente': {
        const soltouNaTigela = ZONA_DESPEJO.contains(arr.r.x, arr.r.y);
        this.inclinacao.parar();
        this.travaX = null;
        this.bico = null;
        arr.r.voltarParaMesa();
        if (arr.daEtapa) this.runner.fimDoGesto();
        else if (soltouNaTigela) this.rejeitar(arr.r.item);
        break;
      }
      case 'ovo': {
        const d = this.tigela.distanciaBorda(arr.ovo.x, arr.ovo.y);
        const naBorda = d >= 0.65 && d <= 1.4 && arr.ovo.y <= TIGELA.bordaY + 30;
        if (naBorda && ctrl instanceof EggStep && ctrl.apoiarNaBorda()) {
          this.ovoNaBorda = arr.ovo;
          this.som('tum');
          this.falar('ovo.na_borda');
        } else {
          arr.ovo.voltar();
        }
        this.runner.fimDoGesto();
        break;
      }
      case 'bater':
        this.batedor?.voltar();
        this.runner.fimDoGesto();
        break;
      case 'peneira':
        this.peneira?.voltar();
        this.runner.fimDoGesto();
        break;
      case 'pedaco':
        if (this.pedaco) this.tweens.add({ targets: this.pedaco, x: DESCANSO_PEDACO.x, y: DESCANSO_PEDACO.y, duration: 300, ease: 'Back.Out' });
        this.runner.fimDoGesto();
        break;
      case 'tocar_ovo':
      case 'colher':
      case 'mexer':
      case 'untar':
        if (arr.tipo === 'colher') this.colher.voltar();
        if (arr.tipo === 'mexer') {
          this.tweens.add({ targets: this.colherMexer, x: this.colherMexer.descanso.x, y: this.colherMexer.descanso.y, duration: 250 });
          if (this.runner.etapa?.tipo === 'mexer' && this.runner.estado.sub === 'em_gesto') this.guiaMexer.setVisible(true);
        }
        if (arr.tipo === 'untar' && this.manteiga) this.manteiga.voltar();
        this.runner.fimDoGesto();
        break;
      case 'tigela':
        this.inclinacao.parar();
        this.travaX = null;
        this.bico = null;
        this.tweens.add({
          targets: this.tigela,
          x: TIGELA_LATERAL.x,
          y: TIGELA_LATERAL.y,
          angle: 0,
          duration: 400,
          ease: 'Back.Out',
          onComplete: () => this.tigela.setDepth(10),
        });
        this.runner.fimDoGesto();
        break;
    }
  }

  private tocarOvo(ctrl: EggStep, t: number): void {
    const ovo = this.ovoNaBorda;
    if (!ovo) return;
    const r = ctrl.toque(t);
    if (r === 'trincou') {
      ovo.desenhar('trincado');
      this.som('trinca');
      this.tweens.add({ targets: ovo, angle: { from: -12, to: 12 }, duration: 70, yoyo: true, repeat: 1, onComplete: () => ovo.setAngle(0) });
    } else if (r === 'abriu') {
      this.sessao.tigela.adicionar(ITEM_OVO, CONFIG_OVO.volumePorOvo);
      this.som('abre');
      ovo.abrir(this.cores[ITEM_OVO] ?? 0xf5c542, this.tigela.ySuperficie(this.sessao.tigela.total));
      this.ovoNaBorda = null;
      this.runner.notificarProgresso();
      if (ctrl.caiuCasca) this.runner.reportarErro('casca');
      else if (!ctrl.terminouOvos) this.falar('ovo.outro');
    }
  }

  private alimentarMexer(a: AmostraPonteiro): void {
    const ctrl = this.runner.controlador;
    if (!(ctrl instanceof StirStep)) return;
    const n = this.tigela.normalizarMexer(a.x, a.y);
    const r = ctrl.amostra(n.x, n.y, a.t);
    if (r.motivo === 'aceita') this.somContinuo('mexer', Math.min(1, ctrl.acumulador.velocidadeAngular / 8));
    if (r.ganho > 0) {
      this.runner.notificarProgresso();
      // "clique" de massa a cada 1/8 de volta contada (feedback sonoro do progresso)
      const oitavo = Math.floor(ctrl.voltas * 8);
      if (oitavo > this.oitavoMexer) {
        this.oitavoMexer = oitavo;
        if (oitavo % 8 === 0) this.som('ding');
      }
    }
  }

  private alimentarBater(a: AmostraPonteiro): void {
    const ctrl = this.runner.controlador;
    if (!(ctrl instanceof BeatStep)) return;
    const dentro = this.tigela.dentroAreaMexer(a.x, a.y);
    if (dentro) this.somContinuo('mexer', 0.8);
    if (ctrl.amostra(a.x, a.y, a.t, dentro) > 0) {
      this.runner.notificarProgresso();
      if (ctrl.batidas % 2 === 0) this.som('colher');
      // a tigela sacode a cada batida (cosmético, só acontece com input)
      this.tigela.angle = ctrl.batidas % 2 ? 2 : -2;
    }
  }

  private pintarManteiga(a: AmostraPonteiro): void {
    const ctrl = this.runner.controlador;
    if (!(ctrl instanceof CoverageStep) || !this.forma) return;
    const seg = ctrl.pintar(a.x, a.y);
    if (!seg) return;
    this.forma.pintarManteiga(seg.x0, seg.y0, seg.x1, seg.y1, ctrl.raioPincel);
    this.somContinuo('pincel', Math.min(1, Math.hypot(seg.x1 - seg.x0, seg.y1 - seg.y0) / 20));
    this.sessao.forma.untada = ctrl.cobertura;
    this.runner.notificarProgresso();
  }

  private rejeitar(item: string): void {
    const etapa = this.runner.etapa;
    const esperado = etapa?.tipo === 'despejar' ? etapa.item : null;
    this.sessao.bus.emit('feedback:rejeicao', { item, esperado });
    const nome = esperado ? INGREDIENTES[esperado]?.nome : null;
    this.falar(nome ? `rejeicao.${esperado}` : 'rejeicao.generica', 'neutro');
    this.cartao.destacar(this.runner.estado.indice);
    this.recipientes.find((r) => r.item === esperado)?.balancar();
  }

  // ================================================================ loop

  protected atualizar(dt: number): void {
    const arr = this.arrasto;
    if (arr?.tipo === 'recipiente') this.atualizarRecipiente(arr.r, arr.daEtapa, dt);
    if (arr?.tipo === 'colher') this.atualizarColher(dt);
    if (arr?.tipo === 'mexer') {
      this.colherMexer.seguir({ x: this.dedo.x, y: this.dedo.y + 10 }, dt);
      // a tigela balança junto com a colher (cosmético, acompanha o dedo)
      const ctrlM = this.runner.controlador;
      if (ctrlM instanceof StirStep) this.tigela.angle = Math.sin(ctrlM.acumulador.anguloAtual) * 2.5;
    } else if (this.estacao === 'tigela' && this.tigela.angle !== 0 && arr?.tipo !== 'tigela') {
      this.tigela.angle = amortecer(this.tigela.angle, 0, 10, dt / 1000);
    }
    if (arr?.tipo === 'ovo') arr.ovo.seguir(this.dedo, dt);
    if (arr?.tipo === 'untar') this.manteiga?.seguir({ x: this.dedo.x, y: this.dedo.y + 10 }, dt);
    if (arr?.tipo === 'tigela') this.atualizarTigela(arr.offset, dt);
    if (arr?.tipo === 'bater') this.batedor?.seguir(this.dedo, dt);
    if (arr?.tipo === 'peneira') this.peneira?.seguir(this.dedo, dt);

    const ctrl = this.runner.controlador;
    let redemoinho = 0;
    if (ctrl instanceof StirStep) {
      this.sessao.mistura = ctrl.progresso;
      redemoinho = ctrl.acumulador.anguloAtual;
      this.barra.definir(ctrl.progresso, ctrl.progressoPendente);
    } else if (ctrl instanceof BeatStep) {
      this.sessao.espuma = Math.max(this.sessao.espuma, ctrl.progresso);
      this.barra.definir(ctrl.progresso, 0);
    } else if (ctrl instanceof CoverageStep || ctrl instanceof PourOutStep || ctrl instanceof SiftStep || ctrl instanceof GrateStep) {
      this.barra.definir(ctrl.progresso, 0);
    }
    const cascas = ctrl instanceof EggStep ? ctrl.cascasNaTigela : 0;
    this.tigela.desenhar(this.sessao.tigela, this.cores, this.sessao.mistura, redemoinho, cascas, this.sessao.espuma);
    this.forma?.desenhar(this.sessao.forma);
  }

  /** Arrasto + trava na zona + inclinação: compartilhado por recipiente e tigela. */
  private atualizarTrava(obj: { x: number; y: number }, alvo: Ponto, zona: Phaser.Geom.Rectangle, dt: number, seguir: (p: Ponto, travaX: number | null) => void): void {
    if (this.travaX === null) {
      seguir(alvo, null);
      if (zona.contains(obj.x, obj.y)) {
        this.travaX = obj.x;
        this.inclinacao.iniciar(this.dedo.x);
      }
    } else {
      seguir({ x: this.travaX, y: clamp(alvo.y, zona.top, zona.bottom) }, this.travaX);
      this.inclinacao.atualizar(this.dedo.x);
      const saiu =
        this.inclinacao.recuo(this.dedo.x) > CONFIG_DESPEJAR.recuoParaSairPx ||
        alvo.y < zona.top - 60 ||
        alvo.y > zona.bottom + 60;
      if (saiu) {
        this.travaX = null;
        this.inclinacao.parar();
      }
    }
    void dt;
  }

  private atualizarRecipiente(r: PourContainer, daEtapa: boolean, dt: number): void {
    if (daEtapa) this.atualizarTrava(r, this.dedo, ZONA_DESPEJO, dt, (p, tx) => r.seguir(p, dt, tx));
    else r.seguir(this.dedo, dt);
    r.angle = amortecer(r.angle, this.inclinacao.anguloGraus, 25, dt / 1000);

    const ctrl = this.runner.controlador;
    if (!daEtapa || !(ctrl instanceof PourStep)) return;
    this.bico = posicaoBico(r.x, r.y, r.largura, r.altura, r.angle);
    this.bicoSobre = bicoSobreBoca(this.bico, this.tigela.boca);
    const q = ctrl.tick({ segurando: true, anguloGraus: r.angle, bicoSobreAlvo: this.bicoSobre }, dt);
    if (q > 0) {
      this.sessao.tigela.adicionar(ctrl.params.item, q);
      const ySup = this.tigela.ySuperficie(this.sessao.tigela.total);
      this.emitirParticulas(this.bico, q, r.corConteudo, ctrl.params.material, ySup);
      this.somContinuo(ctrl.params.material, ctrl.vazaoAtual / VAZAO[ctrl.params.material].vazaoMax);
      if (ctrl.params.material === 'po' && !Qualidade.leve && Math.random() < 0.3) this.poeira.emitParticleAt(this.bico.x + (Math.random() - 0.5) * 30, ySup, 1);
      this.runner.notificarProgresso();
    }
    if (ctrl.emExcesso) this.runner.reportarErro('excesso');
    r.atualizarMedidor(ctrl);
  }

  private atualizarTigela(offset: Ponto, dt: number): void {
    const t = this.tigela;
    const alvo = { x: this.dedo.x + offset.x, y: this.dedo.y + offset.y };
    const seguir = (p: Ponto, travaX: number | null) => {
      t.x = travaX ?? amortecer(t.x, p.x, 18, dt / 1000);
      t.y = amortecer(t.y, p.y, 18, dt / 1000);
    };
    this.atualizarTrava(t, alvo, ZONA_FORMA, dt, seguir);
    t.angle = amortecer(t.angle, this.inclinacao.anguloGraus, 25, dt / 1000);

    const ctrl = this.runner.controlador;
    if (!(ctrl instanceof PourOutStep)) return;
    this.bico = t.bicoMundo();
    this.bicoSobre = bicoSobreBoca(this.bico, BOCA_FORMA);
    const q = ctrl.tick({ segurando: true, anguloGraus: t.angle, bicoSobreAlvo: this.bicoSobre }, dt);
    if (q > 0) {
      this.sessao.tigela.removerProporcional(q);
      this.sessao.forma.massa += q;
      this.emitirParticulas(this.bico, q, corHex(this.sessao.receita.corMassa), 'massa', FORMA.cy);
      this.somContinuo('massa', ctrl.vazaoAtual / VAZAO.massa.vazaoMax);
      this.runner.notificarProgresso();
    }
  }

  private atualizarColher(dt: number): void {
    this.colher.seguir(this.dedo, dt);
    const ctrl = this.runner.controlador;
    const naTigela = this.tigela.dentroDaBoca(this.colher.x, this.colher.y);

    if (!this.colher.carregada && naTigela) {
      if (ctrl instanceof PourStep && ctrl.emExcesso) {
        const removido = ctrl.retirarColherada();
        if (removido > 0) {
          this.sessao.tigela.remover(ctrl.params.item, removido);
          this.colher.carregar(this.cores[ctrl.params.item] ?? 0xffffff);
          this.som('colher');
          this.recipienteDaEtapa()?.atualizarMedidor(ctrl);
          this.runner.notificarProgresso();
          if (!ctrl.emExcesso) this.falar('excesso.ok');
        }
      } else if (ctrl instanceof EggStep && ctrl.retirarCasca()) {
        this.colher.carregar(0xfffaf0);
        this.som('colher');
        this.runner.notificarProgresso();
        if (ctrl.cascasNaTigela === 0) this.falar('casca.ok');
      }
    }
    if (this.colher.carregada && distancia(this.colher, PRATINHO_DESCARTE) < PRATINHO_DESCARTE.raio) {
      this.colher.descarregar();
      this.som('tum');
      this.montesDescartados++;
      this.desenharMontes(ctrl instanceof EggStep ? 0xfffaf0 : undefined);
    }
  }

  private emitirParticulas(bico: Ponto, q: number, cor: number, material: Material, ySuperficie: number): void {
    this.particulasPendentes += q * PARTICULAS_POR_XICARA * Qualidade.particulas;
    const n = Math.floor(this.particulasPendentes);
    if (n <= 0) return;
    this.particulasPendentes -= n;
    const v0 = VAZAO[material].velocidadeParticula;
    const queda = Math.max(10, ySuperficie - bico.y);
    const t = (-v0 + Math.sqrt(v0 * v0 + 2 * 900 * queda)) / 900;
    this.particulas.particleTint = cor;
    this.particulas.setParticleLifespan(t * 1000);
    this.particulas.setParticleSpeed(0, v0);
    this.particulas.setParticleScale(material === 'massa' ? 1.8 : 1);
    this.particulas.emitParticleAt(bico.x, bico.y, n);
  }

  // ================================================================ visual

  private recipienteDaEtapa(): PourContainer | undefined {
    const etapa = this.runner.etapa;
    return etapa?.tipo === 'despejar' ? this.recipientes.find((r) => r.item === etapa.item) : undefined;
  }

  private criarPratinho(): Phaser.GameObjects.Container {
    const c = this.add.container(PRATINHO_DESCARTE.x, PRATINHO_DESCARTE.y).setDepth(15).setVisible(false);
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(0, 0, PRATINHO_DESCARTE.raio * 2, PRATINHO_DESCARTE.raio * 0.9);
    g.lineStyle(4, CORES.vidroBorda, 1);
    g.strokeEllipse(0, 0, PRATINHO_DESCARTE.raio * 2, PRATINHO_DESCARTE.raio * 0.9);
    c.add([g, this.add.graphics().setName('montes')]);
    assarGraphics(this, g, 'pratinho', { x: -PRATINHO_DESCARTE.raio - 4, y: -PRATINHO_DESCARTE.raio * 0.45 - 4, largura: PRATINHO_DESCARTE.raio * 2 + 8, altura: PRATINHO_DESCARTE.raio * 0.9 + 8 });
    return c;
  }

  private desenharMontes(corForcada?: number): void {
    const m = this.pratinho.getByName('montes') as Phaser.GameObjects.Graphics;
    const etapa = this.runner.etapa;
    const cor = corForcada ?? (etapa?.tipo === 'despejar' ? (this.cores[etapa.item] ?? 0xffffff) : 0xffffff);
    m.fillStyle(cor, 1);
    m.lineStyle(1, 0x6b5a4e, 0.6);
    const i = this.montesDescartados - 1;
    m.fillEllipse(-20 + (i % 3) * 20, -4 - Math.floor(i / 3) * 6, 26, 14);
    m.strokeEllipse(-20 + (i % 3) * 20, -4 - Math.floor(i / 3) * 6, 26, 14);
  }

  private desenharGuiaMexer(g: Phaser.GameObjects.Graphics): void {
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

  // ================================================================ dicas

  protected dicaAtual(): DicaEtapa | null {
    const etapa = this.runner.etapa;
    const ctrl = this.runner.controlador;
    const ficha = this.runner.estado.indice;
    if (!etapa) return null;
    const colher = (fala: string): DicaEtapa => ({
      ficha,
      destaques: [{ x: this.colher.x, y: this.colher.y }],
      demo: { tipo: 'arrastar', de: { x: this.colher.x, y: this.colher.y }, para: { x: TIGELA.cx, y: TIGELA.bordaY } },
      fala,
    });
    if (this.runner.estado.sub === 'correcao') return colher(this.runner.estado.erro === 'casca' ? 'casca' : 'excesso.dica');

    switch (etapa.tipo) {
      case 'despejar': {
        const r = this.recipienteDaEtapa();
        if (!r) return null;
        return {
          ficha,
          destaques: [r.descanso],
          demo: {
            tipo: 'arrastar',
            de: r.descanso,
            para: { x: ZONA_DESPEJO.centerX - 40, y: ZONA_DESPEJO.centerY },
            depois: 'inclinar',
            fantasma: (g) => {
              g.fillStyle(r.cor, 1);
              g.fillRoundedRect(-r.largura / 2, -r.altura / 2, r.largura, r.altura, 12);
            },
          },
          fala: 'despejar.dica',
        };
      }
      case 'quebrar_ovo': {
        if (this.ovoNaBorda) return { ficha, destaques: [this.ovoNaBorda], demo: { tipo: 'tocar', ponto: this.ovoNaBorda, vezes: 2 }, fala: 'ovo.dica' };
        const ovo = this.ovos.find((o) => o.visible);
        if (!ovo) return null;
        return {
          ficha,
          destaques: [ovo.descanso],
          demo: {
            tipo: 'arrastar',
            de: ovo.descanso,
            para: { x: TIGELA.cx + TIGELA.raio * 0.92, y: TIGELA.bordaY - 10 },
            fantasma: (g) => {
              g.fillStyle(0xfff8e7, 1);
              g.fillEllipse(0, 0, 52, 66);
            },
          },
          fala: 'ovo.dica',
        };
      }
      case 'mexer':
        return {
          ficha,
          destaques: [{ x: AREA_MEXER.cx, y: AREA_MEXER.cy }],
          demo: { tipo: 'circular', centro: { x: AREA_MEXER.cx, y: AREA_MEXER.cy }, rx: AREA_MEXER.rx * 0.6, ry: AREA_MEXER.ry * 0.6 },
          fala: 'mexer.dica',
        };
      case 'untar':
        return { ficha, destaques: [{ x: FORMA.cx, y: FORMA.cy }], demo: { tipo: 'esfregar', centro: { x: FORMA.cx, y: FORMA.cy }, largura: 260, altura: 150 }, fala: 'untar.dica' };
      case 'despejar_massa':
        if (!(ctrl instanceof PourOutStep)) return null;
        return {
          ficha,
          destaques: [{ x: TIGELA_LATERAL.x, y: TIGELA_LATERAL.y + 40 }],
          demo: {
            tipo: 'arrastar',
            de: { x: TIGELA_LATERAL.x, y: TIGELA_LATERAL.y + 30 },
            para: { x: ZONA_FORMA.centerX - 40, y: ZONA_FORMA.centerY + 30 },
            depois: 'inclinar',
            fantasma: (g) => {
              g.fillStyle(0xcfe8f7, 1);
              g.fillEllipse(0, 0, 216, 86);
              g.fillStyle(corHex(this.sessao.receita.corMassa), 1);
              g.fillEllipse(0, 6, 170, 56);
            },
          },
          fala: 'massa.dica',
        };
      case 'bater':
        return {
          ficha,
          destaques: [{ x: TIGELA.cx, y: TIGELA.bordaY + 30 }],
          demo: { tipo: 'sacudir', ponto: { x: TIGELA.cx - 40, y: TIGELA.bordaY + 30 } },
          fala: 'bater.dica',
        };
      case 'peneirar': {
        const sobre = { x: TIGELA.cx - 40, y: TIGELA.bordaY - 140 };
        return this.peneira && !SOBRE_TIGELA.contains(this.peneira.x, this.peneira.y)
          ? {
              ficha,
              destaques: [DESCANSO_PENEIRA],
              demo: {
                tipo: 'arrastar',
                de: DESCANSO_PENEIRA,
                para: sobre,
                fantasma: (g) => {
                  g.lineStyle(6, 0x8a96a3, 1);
                  g.strokeEllipse(0, 0, 150, 56);
                },
              },
              fala: 'peneirar.dica',
            }
          : { ficha, destaques: [sobre], demo: { tipo: 'sacudir', ponto: sobre }, fala: 'peneirar.dica' };
      }
      case 'ralar': {
        const x = RALADOR.x, y0 = FACE_RALADOR.top + 30, y1 = FACE_RALADOR.bottom - 30;
        return {
          ficha,
          destaques: [DESCANSO_PEDACO, RALADOR],
          demo: { tipo: 'caminho', pontos: [DESCANSO_PEDACO, { x, y: y0 }, { x, y: y1 }, { x, y: y0 }, { x, y: y1 }, { x, y: y0 }] },
          fala: 'ralar.dica',
        };
      }
      default:
        return null;
    }
  }

  // ================================================================ debug

  protected infoDebug(g: Phaser.GameObjects.Graphics): string[] {
    const ctrl = this.runner.controlador;
    const linhas = [`Estação ${this.estacao}  tigela ${this.sessao.tigela.total.toFixed(2)} xíc  mistura ${(this.sessao.mistura * 100).toFixed(0)}%`];
    const segurando = this.arrasto?.tipo === 'recipiente' ? this.arrasto.daEtapa : this.arrasto?.tipo === 'tigela';

    if (this.estacao === 'tigela') {
      g.lineStyle(2, 0xff00ff, 1);
      g.strokeRectShape(ZONA_DESPEJO);
      const b = this.tigela.boca;
      g.lineStyle(2, 0x00ffff, 1);
      g.strokeRect(b.cx - b.meiaLargura, b.bordaY - b.alturaMax, b.meiaLargura * 2, b.alturaMax);
    } else {
      g.lineStyle(2, 0xff00ff, 1);
      g.strokeRectShape(ZONA_FORMA);
      g.lineStyle(2, 0x00ffff, 1);
      g.strokeRect(BOCA_FORMA.cx - BOCA_FORMA.meiaLargura, BOCA_FORMA.bordaY - BOCA_FORMA.alturaMax, BOCA_FORMA.meiaLargura * 2, BOCA_FORMA.alturaMax);
    }
    if (this.bico && segurando) {
      g.fillStyle(this.bicoSobre ? 0x00ff00 : 0xff0000, 1);
      g.fillCircle(this.bico.x, this.bico.y, 7);
    }
    if (this.pratinho.visible) {
      g.lineStyle(2, 0xffff00, 1);
      g.strokeCircle(PRATINHO_DESCARTE.x, PRATINHO_DESCARTE.y, PRATINHO_DESCARTE.raio);
    }

    if (ctrl instanceof PourStep) {
      const r = this.recipienteDaEtapa();
      linhas.push(
        `Despejar ${ctrl.params.item} (${ctrl.params.material})`,
        `  ângulo ${(r?.angle ?? 0).toFixed(0)}°  vazão ${(segurando ? ctrl.vazaoAtual : 0).toFixed(3)} xíc/s  bico sobre: ${segurando && this.bicoSobre ? 'SIM' : 'não'}`,
        `  despejado ${ctrl.despejado.toFixed(3)}  faixa [${ctrl.limiteInferior.toFixed(2)}, ${ctrl.limiteSuperior.toFixed(2)}]  restante ${ctrl.disponivel.toFixed(2)}`,
        `  travado ${this.travaX !== null}  meta ${ctrl.metaAtingida() ? 'OK' : '—'}  excesso ${ctrl.emExcesso}`,
      );
    }
    if (ctrl instanceof EggStep) {
      linhas.push(`Ovos ${ctrl.ovosAbertos}/${ctrl.quantidade}  estado ${ctrl.estadoOvo}  cascas ${ctrl.cascasNaTigela}  modo casca ${ctrl.comCasca}`);
      g.lineStyle(2, 0xffaa00, 1);
      g.strokeEllipse(TIGELA.cx, TIGELA.bordaY, TIGELA.raio * 2 * 0.65, TIGELA.raio * TIGELA.achatamento * 2 * 0.65);
      g.strokeEllipse(TIGELA.cx, TIGELA.bordaY, TIGELA.raio * 2 * 1.4, TIGELA.raio * TIGELA.achatamento * 2 * 1.4);
    }
    if (ctrl instanceof StirStep) {
      const acc = ctrl.acumulador;
      linhas.push(
        `Mexer: voltas ${ctrl.voltas.toFixed(2)} / ${ctrl.voltasMeta}   pendente ${(acc.pendenteRad / Math.PI).toFixed(2)}π`,
        `  ω ${acc.velocidadeAngular.toFixed(2)} rad/s  sentido ${acc.sentidoAtual}  amostra: ${acc.motivo}`,
        `  massa estágio ${BowlView.estagio(this.sessao.mistura) + 1}/4`,
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
    if (ctrl instanceof CoverageStep) {
      linhas.push(`Untar: cobertura ${(ctrl.cobertura * 100).toFixed(1)}% / meta ${(ctrl.meta * 100).toFixed(0)}%`);
      desenharGrade(g, ctrl);
    }
    if (ctrl instanceof SiftStep) {
      linhas.push(`Peneirar ${ctrl.item}: ${ctrl.sacudidas}/${ctrl.meta} sacudidas  na peneira ${ctrl.restante.toFixed(2)} xíc  sobre a tigela: ${this.peneira && SOBRE_TIGELA.contains(this.peneira.x, this.peneira.y) ? 'SIM' : 'não'}`);
      g.lineStyle(2, 0xff00ff, 1);
      g.strokeRectShape(SOBRE_TIGELA);
    }
    if (ctrl instanceof GrateStep) {
      linhas.push(`Ralar ${ctrl.item}: ${ctrl.raladas}/${ctrl.meta} passadas  pedaço ${(ctrl.pedaco * 100).toFixed(0)}%`);
      g.lineStyle(2, 0xff00ff, 1);
      g.strokeRectShape(FACE_RALADOR);
    }
    if (ctrl instanceof BeatStep) {
      linhas.push(`Bater: ${ctrl.batidas}/${ctrl.meta} batidas  espuma ${(this.sessao.espuma * 100).toFixed(0)}%`);
    }
    if (ctrl instanceof PourOutStep) {
      linhas.push(
        `Despejar massa: restante ${(ctrl.fracaoRestante * 100).toFixed(1)}% (meta < ${(ctrl.restanteMax * 100).toFixed(0)}%)`,
        `  ângulo ${this.tigela.angle.toFixed(0)}°  vazão ${(segurando ? ctrl.vazaoAtual : 0).toFixed(3)} xíc/s  bico sobre: ${segurando && this.bicoSobre ? 'SIM' : 'não'}  forma ${this.sessao.forma.massa.toFixed(2)} xíc`,
      );
    }
    return linhas;
  }
}

/** Desenha a grade de cobertura (verde = pintada, vermelho = falta) no modo debug. */
export function desenharGrade(g: Phaser.GameObjects.Graphics, ctrl: CoverageStep): void {
  const grade = ctrl.superficie;
  if (!grade) return;
  for (let l = 0; l < grade.linhas; l++) {
    for (let c = 0; c < grade.colunas; c++) {
      if (!grade.ehValida(c, l)) continue;
      const { x, y } = grade.centro(c, l);
      g.fillStyle(grade.estaPintada(c, l) ? 0x00ff00 : 0xff0000, 0.5);
      g.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
  }
}
