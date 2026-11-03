/**
 * Cozinha: estação da tigela (despejar, quebrar ovo, mexer) e estação da forma
 * (untar, despejar a massa).
 *
 * A cena NUNCA altera progresso por conta própria: toda quantidade sai de tick() com o dedo
 * segurando, toda volta de amostra(), toda área untada de pintar(), todo ovo de toque().
 * Tweens aqui são só cosméticos (voltar à mesa, trocar de estação, cascas se abrindo).
 */
import Phaser from 'phaser';
import { CONFIG_DESPEJAR, CONFIG_OVO, VAZAO, type Material } from '../config/gameplay';
import {
  ALTURA,
  AREA_MEXER,
  BARRA_MEXER,
  CAIXA_OVOS,
  CORES,
  DESCANSO_COLHER,
  FORMA,
  LARGURA,
  MESA_Y,
  POSICOES_RECIPIENTES,
  PRATINHO_DESCARTE,
  RECIPIENTE,
  TIGELA,
  TIGELA_LATERAL,
} from '../config/layout';
import { INGREDIENTES } from '../data/registry';
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
import { PourStep } from '../systems/steps/PourStep';
import { RAIO_NORMALIZADO, StirStep } from '../systems/steps/StirStep';
import { corHex } from '../utils/desenho';
import { amortecer, clamp, distancia, type Ponto } from '../utils/math';
import { CenaEtapas } from './CenaEtapas';

type Arrasto =
  | { tipo: 'recipiente'; r: PourContainer; daEtapa: boolean }
  | { tipo: 'colher' }
  | { tipo: 'mexer' }
  | { tipo: 'ovo'; ovo: EggView }
  | { tipo: 'tocar_ovo' }
  | { tipo: 'untar' }
  | { tipo: 'tigela'; offset: Ponto };

type Estacao = 'tigela' | 'forma';

/** Zona acima da tigela onde o recipiente da etapa trava e passa a inclinar (ver §12 da arquitetura). */
const ZONA_DESPEJO = new Phaser.Geom.Rectangle(TIGELA.cx - TIGELA.raio * 0.85, TIGELA.bordaY - 330, TIGELA.raio * 0.85 + 60, 290);
/** Zona (centro da borda da tigela reduzida) onde ela trava acima da forma. */
const ZONA_FORMA = new Phaser.Geom.Rectangle(FORMA.cx - 130, FORMA.cy - 330, 160, 220);
const BOCA_FORMA: BocaAlvo = { cx: FORMA.cx, bordaY: FORMA.cy, meiaLargura: FORMA.rxInterno * 0.85, alturaMax: 420 };
const PARTICULAS_POR_XICARA = 160;

export class CozinhaScene extends CenaEtapas {
  private tigela!: BowlView;
  private recipientes: PourContainer[] = [];
  private colher!: Spoon;
  private colherMexer!: Spoon;
  private pratinho!: Phaser.GameObjects.Container;
  private barra!: ProgressBar;
  private guiaMexer!: Phaser.GameObjects.Graphics;
  private particulas!: Phaser.GameObjects.Particles.ParticleEmitter;
  private caixaOvos: Phaser.GameObjects.Graphics | null = null;
  private ovos: EggView[] = [];
  private ovoNaBorda: EggView | null = null;
  private forma: PanView | null = null;
  private manteiga: Ferramenta | null = null;

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
    this.caixaOvos = null;
    this.arrasto = null;
    this.travaX = null;
    this.estacao = 'tigela';
    this.montesDescartados = 0;
    for (const [id, def] of Object.entries(INGREDIENTES)) this.cores[id] = corHex(def.corConteudo);
  }

  // ================================================================ cenário

  protected criarCenario(): void {
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(CORES.parede, 1);
    g.fillRect(0, 0, LARGURA, MESA_Y);
    g.fillStyle(0xffffff, 0.35);
    for (let x = 0; x < LARGURA; x += 80) for (let y = 0; y < MESA_Y; y += 80) if (((x + y) / 80) % 2 === 0) g.fillRect(x, y, 80, 80);
    g.fillStyle(CORES.mesa, 1);
    g.fillRect(0, MESA_Y, LARGURA, ALTURA - MESA_Y);
    g.fillStyle(CORES.mesaBorda, 1);
    g.fillRect(0, MESA_Y, LARGURA, 10);

    const receita = this.sessao.receita;
    this.tigela = new BowlView(this, corHex(receita.corMassa));
    receita.recipientes.forEach((item, i) => {
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
        this.falar(`Agora: ${def?.nome ?? etapa.item}! Leve até a tigela e incline.`);
        const r = this.recipienteDaEtapa();
        if (r && ctrl instanceof PourStep) r.atualizarMedidor(ctrl);
        r?.balancar();
        break;
      }
      case 'quebrar_ovo':
        this.irParaEstacao('tigela');
        this.criarOvos(etapa.quantidade);
        this.falar('Leve o ovo até a beirada da tigela e dê dois toquinhos nele!');
        break;
      case 'mexer':
        this.irParaEstacao('tigela');
        this.falar('Hora de mexer! Gire o dedo dentro da tigela.');
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
        this.falar('Passe manteiga na forma toda, com o dedo!');
        break;
      }
      case 'despejar_massa':
        this.irParaEstacao('forma');
        this.barra.setVisible(true);
        this.falar('Leve a tigela até a forma e incline. Despeje tudo!');
        this.tweens.add({ targets: this.tigela, angle: { from: -6, to: 6 }, duration: 120, yoyo: true, repeat: 2, onComplete: () => this.tigela.setAngle(0) });
        break;
      default:
        break;
    }
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
      default:
        break;
    }
  }

  protected override aoErro(erro: TipoErro): void {
    if (erro === 'excesso') this.falar('Opa, colocou demais! Tire um pouco com a colher.', 'surpreso');
    if (erro === 'casca') this.falar('Caiu casquinha! Pegue com a colher.', 'surpreso');
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
      if (!this.forma) {
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
    this.caixaOvos = g;
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
        this.arrasto = { tipo: 'ovo', ovo };
        this.runner.inicioDoGesto();
        return;
      }
    }

    const r = this.estacao === 'tigela' ? this.recipientes.find((rc) => rc.contem(a)) : undefined;
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
      return;
    }

    if (etapa?.tipo === 'untar' && this.forma?.contem(a)) {
      this.arrasto = { tipo: 'untar' };
      this.runner.inicioDoGesto();
      this.pintarManteiga(a);
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
          this.falar('Agora dê dois toquinhos no ovo!');
        } else {
          arr.ovo.voltar();
        }
        this.runner.fimDoGesto();
        break;
      }
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
      this.tweens.add({ targets: ovo, angle: { from: -12, to: 12 }, duration: 70, yoyo: true, repeat: 1, onComplete: () => ovo.setAngle(0) });
    } else if (r === 'abriu') {
      this.sessao.tigela.adicionar(ITEM_OVO, CONFIG_OVO.volumePorOvo);
      ovo.abrir(this.cores[ITEM_OVO] ?? 0xf5c542, this.tigela.ySuperficie(this.sessao.tigela.total));
      this.ovoNaBorda = null;
      this.runner.notificarProgresso();
      if (ctrl.caiuCasca) this.runner.reportarErro('casca');
      else if (!ctrl.terminouOvos) this.falar('Isso! Agora o outro ovo.');
    }
  }

  private alimentarMexer(a: AmostraPonteiro): void {
    const ctrl = this.runner.controlador;
    if (!(ctrl instanceof StirStep)) return;
    const n = this.tigela.normalizarMexer(a.x, a.y);
    if (ctrl.amostra(n.x, n.y, a.t).ganho > 0) this.runner.notificarProgresso();
  }

  private pintarManteiga(a: AmostraPonteiro): void {
    const ctrl = this.runner.controlador;
    if (!(ctrl instanceof CoverageStep) || !this.forma) return;
    const seg = ctrl.pintar(a.x, a.y);
    if (!seg) return;
    this.forma.pintarManteiga(seg.x0, seg.y0, seg.x1, seg.y1, ctrl.raioPincel);
    this.sessao.forma.untada = ctrl.cobertura;
    this.runner.notificarProgresso();
  }

  private rejeitar(item: string): void {
    const etapa = this.runner.etapa;
    const esperado = etapa?.tipo === 'despejar' ? etapa.item : null;
    this.sessao.bus.emit('feedback:rejeicao', { item, esperado });
    const nome = esperado ? INGREDIENTES[esperado]?.nome : null;
    this.falar(nome ? `Ainda não! Agora é a vez do ${nome}.` : 'Esse agora não!', 'neutro');
    this.cartao.destacar(this.runner.estado.indice);
    this.recipientes.find((r) => r.item === esperado)?.balancar();
  }

  // ================================================================ loop

  protected atualizar(dt: number): void {
    const arr = this.arrasto;
    if (arr?.tipo === 'recipiente') this.atualizarRecipiente(arr.r, arr.daEtapa, dt);
    if (arr?.tipo === 'colher') this.atualizarColher(dt);
    if (arr?.tipo === 'mexer') this.colherMexer.seguir({ x: this.dedo.x, y: this.dedo.y + 10 }, dt);
    if (arr?.tipo === 'ovo') arr.ovo.seguir(this.dedo, dt);
    if (arr?.tipo === 'untar') this.manteiga?.seguir({ x: this.dedo.x, y: this.dedo.y + 10 }, dt);
    if (arr?.tipo === 'tigela') this.atualizarTigela(arr.offset, dt);

    const ctrl = this.runner.controlador;
    let redemoinho = 0;
    if (ctrl instanceof StirStep) {
      this.sessao.mistura = ctrl.progresso;
      redemoinho = ctrl.acumulador.anguloAtual;
      this.barra.definir(ctrl.progresso, ctrl.progressoPendente);
    } else if (ctrl instanceof CoverageStep || ctrl instanceof PourOutStep) {
      this.barra.definir(ctrl.progresso, 0);
    }
    const cascas = ctrl instanceof EggStep ? ctrl.cascasNaTigela : 0;
    this.tigela.desenhar(this.sessao.tigela, this.cores, this.sessao.mistura, redemoinho, cascas);
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
      this.emitirParticulas(this.bico, q, r.corConteudo, ctrl.params.material, this.tigela.ySuperficie(this.sessao.tigela.total));
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
          this.recipienteDaEtapa()?.atualizarMedidor(ctrl);
          this.runner.notificarProgresso();
          if (!ctrl.emExcesso) this.falar('Isso! Agora está certinho. Pode soltar a colher.');
        }
      } else if (ctrl instanceof EggStep && ctrl.retirarCasca()) {
        this.colher.carregar(0xfffaf0);
        this.runner.notificarProgresso();
        if (ctrl.cascasNaTigela === 0) this.falar('Sem casquinha! Pode soltar a colher.');
      }
    }
    if (this.colher.carregada && distancia(this.colher, PRATINHO_DESCARTE) < PRATINHO_DESCARTE.raio) {
      this.colher.descarregar();
      this.montesDescartados++;
      this.desenharMontes(ctrl instanceof EggStep ? 0xfffaf0 : undefined);
    }
  }

  private emitirParticulas(bico: Ponto, q: number, cor: number, material: Material, ySuperficie: number): void {
    this.particulasPendentes += q * PARTICULAS_POR_XICARA;
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
