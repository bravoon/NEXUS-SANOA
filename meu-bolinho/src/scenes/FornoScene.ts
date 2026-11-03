/**
 * Forno: colocar a forma → fechar a porta → girar o timer (1 volta) → bolo cresce atrás do
 * vidro (única fase por tempo, aprovada na especificação) → apito → abrir a porta → luva →
 * retirar a forma até a bancada. Depois, desenformar: prato sobre a forma + swipe para baixo.
 *
 * Sem luva a forma não pode ser pega (OvenStep.pegarForma → 'quente' → ERRO 'quente').
 */
import Phaser from 'phaser';
import { BANCADA_FORNO, CORES, FORNO, LUVA, MESA_Y, PRATO_DESENFORMAR, ALTURA, LARGURA } from '../config/layout';
import { Ferramenta } from '../entities/Ferramentas';
import { OvenView } from '../entities/Oven';
import { PanView } from '../entities/Pan';
import type { AmostraPonteiro } from '../systems/gesture/GestureSystem';
import type { TipoErro } from '../systems/recipe/recipeFsm';
import type { EtapaResolvida } from '../systems/recipe/recipeTypes';
import { OvenStep, type FaseForno } from '../systems/steps/OvenStep';
import { UnmoldStep } from '../systems/steps/UnmoldStep';
import { corHex } from '../utils/desenho';
import { amortecer, distancia } from '../utils/math';
import { CenaEtapas } from './CenaEtapas';

type Arrasto =
  | { tipo: 'forma' }
  | { tipo: 'toque' }
  | { tipo: 'botao' }
  | { tipo: 'luva' }
  | { tipo: 'prato' }
  | { tipo: 'virar' };

/** Onde a forma fica para desenformar (bancada, à frente do forno). */
const DESENFORMAR = { x: 1000, y: 560, escala: 0.75 } as const;

export class FornoScene extends CenaEtapas {
  private forno!: OvenView;
  private forma!: PanView;
  private luva!: Ferramenta;
  private prato!: Ferramenta;
  private boloNoPrato: Phaser.GameObjects.Graphics | null = null;
  private trim: Phaser.GameObjects.Text | null = null;
  private arrasto: Arrasto | null = null;
  private faseAnterior: FaseForno | null = null;

  constructor() {
    super('Forno');
  }

  override init(dados: Parameters<CenaEtapas['init']>[0]): void {
    super.init(dados);
    this.arrasto = null;
    this.faseAnterior = null;
    this.boloNoPrato = null;
    this.trim = null;
  }

  protected criarCenario(): void {
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(0xfde2c4, 1);
    g.fillRect(0, 0, LARGURA, MESA_Y);
    g.fillStyle(0xffffff, 0.3);
    for (let x = 0; x < LARGURA; x += 60) g.fillRect(x, 0, 30, MESA_Y);
    g.fillStyle(CORES.mesa, 1);
    g.fillRect(0, MESA_Y, LARGURA, ALTURA - MESA_Y);
    g.fillStyle(CORES.mesaBorda, 1);
    g.fillRect(0, MESA_Y, LARGURA, 10);
    // gancho da luva
    g.fillStyle(0x8a6440, 1);
    g.fillRect(LUVA.x - 40, LUVA.y - 60, 80, 10);

    this.forno = new OvenView(this);
    this.forma = new PanView(this, BANCADA_FORNO.formaX, BANCADA_FORNO.formaY, BANCADA_FORNO.escala, corHex(this.sessao.receita.corMassa), 12);
    this.luva = new Ferramenta(this, 'luva', { x: LUVA.x, y: LUVA.y });
    this.prato = new Ferramenta(this, 'prato', { x: PRATO_DESENFORMAR.x, y: PRATO_DESENFORMAR.y }).setVisible(false);
  }

  protected prepararEtapa(_indice: number, etapa: EtapaResolvida): void {
    if (etapa.tipo === 'forno') {
      this.falar('Coloque a forma dentro do forno!');
    } else if (etapa.tipo === 'desenformar') {
      this.forno.desenharPorta(true, false, 0);
      this.luva.setVisible(false);
      this.tweens.add({
        targets: this.forma,
        x: DESENFORMAR.x,
        y: DESENFORMAR.y,
        escala: DESENFORMAR.escala,
        duration: 400,
        onUpdate: () => this.forma.posicionar(this.forma.x, this.forma.y, this.forma.escala),
      });
      this.prato.setVisible(true).setAlpha(0);
      this.tweens.add({ targets: this.prato, alpha: 1, duration: 300 });
      this.falar('Coloque o prato em cima da forma.');
    }
  }

  protected override aoErro(erro: TipoErro): void {
    if (erro !== 'quente') return;
    this.falar('Cuidado, está quente! Use a luva.', 'surpreso');
    for (const o of this.forma.objetos) this.tweens.add({ targets: o, x: { from: o.x - 5, to: o.x + 5 }, duration: 50, yoyo: true, repeat: 3, onComplete: () => o.setX(this.forma.x) });
    this.tweens.add({ targets: this.luva, scale: 1.25, duration: 200, yoyo: true, repeat: 2 });
  }

  // ================================================================ input

  protected aoTocar(a: AmostraPonteiro): void {
    if (this.arrasto) return;
    const ctrl = this.runner.controlador;
    if (ctrl instanceof OvenStep) this.tocarForno(ctrl, a);
    else if (ctrl instanceof UnmoldStep) this.tocarDesenformar(ctrl, a);
  }

  private tocarForno(ctrl: OvenStep, a: AmostraPonteiro): void {
    const f = ctrl.fase;
    const podeLuva = (f === 'apitou' || f === 'retirar') && !ctrl.comLuva;
    if (podeLuva && this.luva.contem(a)) {
      this.arrasto = { tipo: 'luva' };
      this.runner.inicioDoGesto();
      return;
    }
    if (f === 'colocar' && this.forma.contem(a)) {
      this.arrasto = { tipo: 'forma' };
      this.runner.inicioDoGesto();
      return;
    }
    if ((f === 'fechar' || f === 'apitou') && this.forno.pontoNaPorta(a)) {
      this.arrasto = { tipo: 'toque' };
      this.runner.inicioDoGesto();
      const r = ctrl.tocarPorta();
      if (r === 'fechou') this.falar('Agora gire o botão uma volta inteira!');
      if (r === 'abriu') this.falar(ctrl.comLuva ? 'Pegue a forma e leve até a bancada.' : 'Use a luva para pegar a forma!');
      return;
    }
    if (f === 'timer' && this.forno.pontoNoBotao(a)) {
      this.arrasto = { tipo: 'botao' };
      this.runner.inicioDoGesto();
      this.girar(ctrl, a);
      return;
    }
    if ((f === 'retirar' || f === 'apitou') && this.forma.contem(a)) {
      const r = ctrl.pegarForma();
      this.runner.inicioDoGesto();
      if (r === 'ok') {
        this.arrasto = { tipo: 'forma' };
        this.forma.objetos.forEach((o) => o.setDepth(o.depth + 30));
      } else {
        this.arrasto = { tipo: 'toque' };
        if (r === 'quente') this.runner.reportarErro('quente');
        if (r === 'fechado') this.falar('Primeiro abra a porta!');
      }
    }
  }

  private tocarDesenformar(ctrl: UnmoldStep, a: AmostraPonteiro): void {
    if (!ctrl.pratoColocado && this.prato.contem(a)) {
      this.arrasto = { tipo: 'prato' };
      this.runner.inicioDoGesto();
      return;
    }
    if (ctrl.pratoColocado && (this.forma.contem(a) || this.prato.contem(a)) && ctrl.iniciarSwipe(a.x, a.y, a.t)) {
      this.arrasto = { tipo: 'virar' };
      this.runner.inicioDoGesto();
    }
  }

  protected aoMover(a: AmostraPonteiro): void {
    const ctrl = this.runner.controlador;
    if (this.arrasto?.tipo === 'botao' && ctrl instanceof OvenStep) this.girar(ctrl, a);
    if (this.arrasto?.tipo === 'virar' && ctrl instanceof UnmoldStep) this.desenharVirada(ctrl.moverSwipe(a.x, a.y, a.t));
  }

  protected aoSoltar(a: AmostraPonteiro): void {
    const arr = this.arrasto;
    this.arrasto = null;
    if (!arr) return;
    const ctrl = this.runner.controlador;

    if (ctrl instanceof OvenStep) {
      if (arr.tipo === 'forma') this.soltarForma(ctrl);
      if (arr.tipo === 'botao') ctrl.soltarTimer();
      if (arr.tipo === 'luva') {
        const perto = distancia(this.luva, this.forma) < 170 || this.forno.pontoNaCavidade(this.luva);
        if (perto && ctrl.equiparLuva()) this.falar(ctrl.fase === 'apitou' ? 'Luva no lugar! Agora abra a porta.' : 'Luva no lugar! Pegue a forma.');
        else this.luva.voltar();
      }
    }
    if (ctrl instanceof UnmoldStep) {
      if (arr.tipo === 'prato') {
        if (distancia(this.prato, this.forma) < 140) {
          ctrl.colocarPrato();
          this.prato.setPosition(this.forma.x, this.forma.y - 10).setDepth(40);
          this.prato.descanso = { x: this.prato.x, y: this.prato.y };
          this.falar('Agora puxe para baixo, rapidinho!');
        } else {
          this.prato.voltar();
        }
      }
      if (arr.tipo === 'virar') {
        const r = ctrl.terminarSwipe(a.x, a.y, a.t);
        if (r === 'ok') this.mostrarBoloNoPrato();
        else {
          this.desenharVirada(0);
          this.falar(r === 'lento' ? 'Mais rápido! Puxe para baixo.' : 'Puxe bem para baixo!', 'neutro');
        }
      }
    }
    this.runner.fimDoGesto();
  }

  private girar(ctrl: OvenStep, a: AmostraPonteiro): void {
    const n = this.forno.normalizarBotao(a);
    const antes = ctrl.fase;
    ctrl.girarTimer(n.x, n.y, a.t);
    this.runner.notificarProgresso();
    if (antes === 'timer' && ctrl.fase === 'assando') this.falar('Forno ligado! Veja o bolo crescer.');
  }

  private soltarForma(ctrl: OvenStep): void {
    const f = this.forma;
    if (ctrl.fase === 'colocar') {
      if (this.forno.pontoNaCavidade(f) && ctrl.colocarForma()) {
        this.moverForma(FORNO.formaDentro.x, FORNO.formaDentro.y, FORNO.formaDentro.escala);
        this.falar('Agora feche a porta do forno.');
      } else {
        this.moverForma(BANCADA_FORNO.formaX, BANCADA_FORNO.formaY, BANCADA_FORNO.escala);
      }
      return;
    }
    // retirando (com luva)
    f.objetos.forEach((o) => o.setDepth(o.depth - 30));
    const naBancada = f.y > MESA_Y - 70 && !this.forno.pontoNaCavidade(f);
    ctrl.soltarForma(naBancada);
    if (!naBancada) this.moverForma(FORNO.formaDentro.x, FORNO.formaDentro.y, FORNO.formaDentro.escala);
  }

  /** Movimento cosmético da forma (voltar para o lugar). */
  private moverForma(x: number, y: number, escala: number): void {
    this.tweens.add({
      targets: this.forma,
      x,
      y,
      escala,
      duration: 300,
      ease: 'Sine.Out',
      onUpdate: () => this.forma.posicionar(this.forma.x, this.forma.y, this.forma.escala),
    });
  }

  private desenharVirada(p: number): void {
    // fator de escala vertical: 1 (normal) → -1 (virada), passando por 0 no meio
    const fator = 1 - 2 * p;
    this.forma.virar(fator);
    this.prato.setScale(1, Math.max(0.15, Math.abs(fator)));
    this.prato.y = this.forma.y - 10 + p * 30;
  }

  private mostrarBoloNoPrato(): void {
    this.desenharVirada(1);
    this.prato.setScale(1).setPosition(this.forma.x, this.forma.y + 20);
    const g = this.add.graphics().setDepth(45);
    const cor = 0xd9a05b;
    g.fillStyle(0xb57f43, 1);
    g.fillEllipse(this.forma.x, this.forma.y + 10, 220, 70);
    g.fillRect(this.forma.x - 110, this.forma.y - 30, 220, 40);
    g.fillStyle(cor, 1);
    g.fillEllipse(this.forma.x, this.forma.y - 30, 220, 70);
    this.boloNoPrato = g;
    // a forma vazia é levantada (consequência visual do swipe já concluído)
    this.tweens.add({ targets: this.forma.objetos, y: '-=160', alpha: 0, duration: 500 });
    this.falar('Uau, saiu inteirinho!');
  }

  // ================================================================ loop

  protected atualizar(dt: number): void {
    const ctrl = this.runner.controlador;
    if (ctrl instanceof OvenStep) {
      ctrl.assar(dt); // única fase por tempo (aprovada): só tem efeito em "assando"
      this.sessao.forma.assado = ctrl.progressoAssar;
      if (this.faseAnterior !== ctrl.fase) this.aoMudarFase(ctrl.fase);
      this.faseAnterior = ctrl.fase;

      if (this.arrasto?.tipo === 'forma') {
        const k = 1 - Math.exp(-18 * (dt / 1000));
        this.forma.posicionar(this.forma.x + (this.dedo.x - this.forma.x) * k, this.forma.y + (this.dedo.y - this.forma.y) * k);
      }
      if (this.arrasto?.tipo === 'luva') this.luva.seguir(this.dedo, dt);
      else if (ctrl.comLuva) {
        // luva "veste" a forma
        this.luva.x = amortecer(this.luva.x, this.forma.x + 70 * this.forma.escala * 2, 20, dt / 1000);
        this.luva.y = amortecer(this.luva.y, this.forma.y - 10, 20, dt / 1000);
      }
      const fechado = !(ctrl.fase === 'colocar' || ctrl.fase === 'fechar' || ctrl.fase === 'retirar' || ctrl.fase === 'concluido');
      const ligado = ctrl.fase === 'assando';
      this.forno.desenharPorta(!fechado, ligado, Math.sin(this.time.now / 300) * 0.5 + 0.5);
      this.forno.desenharPainel(ctrl.voltasTimer, ligado, ctrl.fase === 'apitou', ligado ? 1 - ctrl.progressoAssar : 0);
    }
    if (ctrl instanceof UnmoldStep && this.arrasto?.tipo === 'prato') this.prato.seguir(this.dedo, dt);
    if (!this.boloNoPrato) this.forma.desenhar(this.sessao.forma);
  }

  private aoMudarFase(fase: FaseForno): void {
    if (fase === 'apitou') {
      this.trim?.destroy();
      this.trim = this.add
        .text(FORNO.luz.x, FORNO.luz.y - 50, 'TRIIIM!', { fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif', fontSize: '34px', color: '#d55e00', fontStyle: 'bold', stroke: '#ffffff', strokeThickness: 6 })
        .setOrigin(0.5)
        .setDepth(70);
      this.tweens.add({ targets: this.trim, angle: { from: -8, to: 8 }, duration: 90, yoyo: true, repeat: 7, onComplete: () => this.trim?.setAngle(0) });
      this.forno.sacudir();
      this.falar('O bolo ficou pronto! Abra a porta e use a luva.');
    }
    if (fase === 'retirar' || fase === 'concluido') this.trim?.setVisible(false);
  }

  // ================================================================ debug

  protected infoDebug(g: Phaser.GameObjects.Graphics): string[] {
    const ctrl = this.runner.controlador;
    const p = FORNO.porta;
    g.lineStyle(2, 0xff00ff, 1);
    g.strokeRect(p.x, p.y, p.largura, p.altura);
    g.lineStyle(2, 0x00ffff, 1);
    g.strokeCircle(FORNO.botao.x, FORNO.botao.y, FORNO.botao.raioGesto);
    g.lineStyle(2, 0xff0000, 1);
    g.strokeCircle(FORNO.botao.x, FORNO.botao.y, FORNO.botao.raioGesto * 0.3);
    g.lineStyle(2, 0xffff00, 1);
    g.lineBetween(0, MESA_Y - 70, LARGURA, MESA_Y - 70);
    if (ctrl instanceof OvenStep) {
      return [
        `Forno: fase ${ctrl.fase}  luva ${ctrl.comLuva ? 'SIM' : 'não'}  segurando ${ctrl.segurando}`,
        `  timer ${(ctrl.voltasTimer * 100).toFixed(0)}% de 1 volta  assado ${(ctrl.progressoAssar * 100).toFixed(0)}% de ${ctrl.duracaoMs / 1000}s`,
      ];
    }
    if (ctrl instanceof UnmoldStep) {
      return [
        `Desenformar: prato ${ctrl.pratoColocado ? 'SIM' : 'não'}  virada ${(ctrl.progressoVirada * 100).toFixed(0)}%`,
        `  vel ${ctrl.swipe.velocidade.toFixed(2)} px/ms (mín 0,6)  último ${ctrl.ultimoResultado ?? '-'}`,
      ];
    }
    return [];
  }
}
