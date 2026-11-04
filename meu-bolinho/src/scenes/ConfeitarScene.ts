/**
 * Confeitar:
 * - [rechear] espalhar o recheio na camada de baixo e assentar a camada de cima com o dedo;
 * - [decorar] cobertura com o dedo → [glacê: seguir o desenho pontilhado] → enfeites
 *   arrastados um a um (presos ao topo do bolo, em camadas) e granulado sacudindo o pote.
 * "Desfazer" remove a última ação. "Pronto!" aparece só depois das partes obrigatórias e
 * apenas encerra a parte criativa (não executa nada no bolo).
 */
import Phaser from 'phaser';
import { assarGraphics } from '../utils/CacheGrafico';
import { CONFIG_DECORACAO } from '../config/gameplay';
import { BANDEJA_Y, BARRA_MEXER, BOLO, CORES } from '../config/layout';
import { CakeView, DESCANSO_CAMADA } from '../entities/Cake';
import { sombra, TEXTURAS } from '../art/ArteProcedural';
import type { DicaEtapa } from '../entities/HintPresenter';
import { CORES_CONFEITO, desenharEnfeite, desenharIconeEnfeite } from '../entities/Enfeites';
import { Ferramenta } from '../entities/Ferramentas';
import { ProgressBar } from '../entities/ProgressBar';
import { mascaraElipse } from '../systems/coverage/CoverageGrid';
import type { Enfeite, TipoEnfeite } from '../systems/decoration/Decoracao';
import type { AmostraPonteiro } from '../systems/gesture/GestureSystem';
import { ShakeRecognizer } from '../systems/gesture/recognizers/ShakeRecognizer';
import type { EtapaResolvida } from '../systems/recipe/recipeTypes';
import { DecorStep } from '../systems/steps/DecorStep';
import { FillLayerStep } from '../systems/steps/FillLayerStep';
import { gerarDesenho } from '../systems/steps/TraceStep';
import { CONFIG_GLACE, CONFIG_POLVILHAR } from '../config/gameplay';
import { corHex } from '../utils/desenho';
import { type Ponto } from '../utils/math';
import { CenaEtapas } from './CenaEtapas';
import { Qualidade } from '../utils/Qualidade';
import { desenharGrade } from './CozinhaScene';

type Arrasto =
  | { tipo: 'cobrir' }
  | { tipo: 'recheio' }
  | { tipo: 'camada'; offset: Ponto }
  | { tipo: 'glace' }
  | { tipo: 'polvilho' }
  | { tipo: 'enfeite'; enfeite: TipoEnfeite; g: Phaser.GameObjects.Graphics; cor: number }
  | { tipo: 'granulado' }
  | { tipo: 'pronto' };

const BANDEJA: { tipo: TipoEnfeite; x: number }[] = [
  { tipo: 'confeito', x: 470 },
  { tipo: 'morango', x: 580 },
  { tipo: 'vela', x: 690 },
  { tipo: 'granulado', x: 810 },
];
const DESFAZER = { x: 330, y: BANDEJA_Y, raio: 40 } as const;
const PRONTO = { x: 1060, y: BANDEJA_Y, largura: 220, altura: 84 } as const;

export class ConfeitarScene extends CenaEtapas {
  private bolo!: CakeView;
  private espatula!: Ferramenta;
  private barra!: ProgressBar;
  private bandeja!: Phaser.GameObjects.Container;
  private botaoDesfazer!: Phaser.GameObjects.Container;
  private botaoPronto!: Phaser.GameObjects.Container;
  private pote!: Phaser.GameObjects.Image;
  private readonly sacudir = new ShakeRecognizer();
  private arrasto: Arrasto | null = null;
  private liberado = false;
  private saco: Ferramenta | null = null;
  private polvilhador: Ferramenta | null = null;
  private avisouCamada = false;
  private contadorCor = 0;

  constructor() {
    super('Confeitar');
  }

  override init(dados: Parameters<CenaEtapas['init']>[0]): void {
    super.init(dados);
    this.arrasto = null;
    this.liberado = false;
    this.avisouCamada = false;
    this.saco = null;
    this.polvilhador = null;
    this.contadorCor = 0;
    this.sacudir.parar();
  }

  private get decor(): DecorStep | null {
    const c = this.runner.controlador;
    return c instanceof DecorStep ? c : null;
  }

  protected criarCenario(): void {
    this.add.image(0, 0, TEXTURAS.fundoConfeitar).setOrigin(0).setDepth(0);
    sombra(this, BOLO.cx, BOLO.topoY + BOLO.alturaLateral + 40, BOLO.pratoRx * 2.2, 1);

    const etapas = this.sessao.receita.etapas;
    const decorar = etapas.find((e) => e.tipo === 'decorar');
    const rechear = etapas.find((e) => e.tipo === 'rechear');
    const cor = decorar?.tipo === 'decorar' ? corHex(decorar.corCobertura) : 0x5a3220;
    this.bolo = new CakeView(this, cor, corHex(this.sessao.receita.corMassa), {
      camadas: rechear !== undefined,
      corRecheio: rechear?.tipo === 'rechear' ? corHex(rechear.corRecheio) : undefined,
    });
    this.espatula = new Ferramenta(this, 'espatula', { x: BOLO.cx + BOLO.rx + 110, y: BOLO.topoY + 40 });
    this.barra = new ProgressBar(this, BARRA_MEXER.x - 120, 130, BARRA_MEXER.largura, BARRA_MEXER.altura, 'nenhum');

    this.bandeja = this.add.container(0, 0).setDepth(55).setAlpha(0.3);
    const fundo = this.add.graphics();
    fundo.fillStyle(0xffffff, 0.85);
    fundo.fillRoundedRect(BANDEJA[0]!.x - 60, BANDEJA_Y - 52, BANDEJA[BANDEJA.length - 1]!.x - BANDEJA[0]!.x + 120, 104, 24);
    this.bandeja.add(fundo);
    assarGraphics(this, fundo, 'bandeja:fundo', { x: BANDEJA[0]!.x - 64, y: BANDEJA_Y - 56, largura: BANDEJA[BANDEJA.length - 1]!.x - BANDEJA[0]!.x + 128, altura: 112 });
    for (const b of BANDEJA) {
      const ic = this.add.graphics();
      desenharIconeEnfeite(ic, b.tipo, b.x, BANDEJA_Y);
      this.bandeja.add(ic);
      assarGraphics(this, ic, `bandeja:${b.tipo}`, { x: b.x - 48, y: BANDEJA_Y - 90, largura: 96, altura: 140 });
    }
    const pote = this.add.graphics().setDepth(70).setVisible(false);
    desenharIconeEnfeite(pote, 'granulado', 0, 0);
    this.pote = assarGraphics(this, pote, 'pote:granulado', { x: -30, y: -38, largura: 60, altura: 70 });

    this.botaoDesfazer = this.add.container(DESFAZER.x, DESFAZER.y).setDepth(55).setAlpha(0.3);
    const gd = this.add.graphics();
    gd.fillStyle(0xffffff, 1);
    gd.fillCircle(0, 0, DESFAZER.raio);
    gd.lineStyle(4, CORES.texto, 1);
    gd.strokeCircle(0, 0, DESFAZER.raio);
    gd.lineStyle(6, CORES.texto, 1);
    gd.beginPath();
    gd.arc(0, 4, 18, Math.PI * 1.1, Math.PI * 2.1, false);
    gd.strokePath();
    gd.fillStyle(CORES.texto, 1);
    gd.fillTriangle(-26, -2, -10, -2, -18, 12);
    this.botaoDesfazer.add(gd);
    assarGraphics(this, gd, 'botao:desfazer', { x: -DESFAZER.raio - 4, y: -DESFAZER.raio - 4, largura: DESFAZER.raio * 2 + 8, altura: DESFAZER.raio * 2 + 8 });

    this.botaoPronto = this.add.container(PRONTO.x, PRONTO.y).setDepth(55).setVisible(false);
    const gp = this.add.graphics();
    gp.fillStyle(CORES.sucesso, 1);
    gp.fillRoundedRect(-PRONTO.largura / 2, -PRONTO.altura / 2, PRONTO.largura, PRONTO.altura, PRONTO.altura / 2);
    gp.lineStyle(4, 0x006b4f, 1);
    gp.strokeRoundedRect(-PRONTO.largura / 2, -PRONTO.altura / 2, PRONTO.largura, PRONTO.altura, PRONTO.altura / 2);
    const tp = this.add.text(0, 0, '✓ Pronto!', { fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif', fontSize: '34px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    this.botaoPronto.add([gp, tp]);
    assarGraphics(this, gp, 'botao:pronto', { x: -PRONTO.largura / 2 - 4, y: -PRONTO.altura / 2 - 4, largura: PRONTO.largura + 8, altura: PRONTO.altura + 8 });
  }

  private get rechear(): FillLayerStep | null {
    const c = this.runner.controlador;
    return c instanceof FillLayerStep ? c : null;
  }

  protected prepararEtapa(_indice: number, etapa: EtapaResolvida): void {
    if (etapa.tipo === 'rechear') {
      this.rechear?.recheio.definirSuperficie(this.bolo.areaRecheio, mascaraElipse(this.bolo.areaRecheio));
      this.espatula.setPosition(BOLO.cx + BOLO.rx + 110, BOLO.topoY + 80);
      this.falar('rechear.inicio');
      return;
    }
    if (etapa.tipo !== 'decorar') return;
    this.barra.setVisible(true);
    this.bolo.prepararCobertura();
    this.decor?.cobertura.definirSuperficie(this.bolo.areaTopo, mascaraElipse(this.bolo.areaTopo));
    this.falar('decorar.cobertura');
  }

  // ================================================================ input

  protected aoTocar(a: AmostraPonteiro): void {
    if (this.arrasto) return;
    const rec = this.rechear;
    if (rec) {
      const camada = this.bolo.camadaSuperior;
      if (!rec.recheioOk && this.bolo.noRecheio(a, 1.15)) {
        this.arrasto = { tipo: 'recheio' };
        this.runner.inicioDoGesto();
        this.espalharRecheio(a);
      } else if (rec.recheioOk && camada && Math.abs(a.x - camada.x) <= BOLO.rx * camada.scaleX + 20 && Math.abs(a.y - camada.y - 20) <= BOLO.ry * camada.scaleY + 50) {
        this.arrasto = { tipo: 'camada', offset: { x: camada.x - a.x, y: camada.y - a.y } };
        this.tweens.add({ targets: camada, scale: 1, duration: 200 }); // cresce ao pegar (cosmético)
        this.som('pop');
        this.runner.inicioDoGesto();
      }
      return;
    }
    const d = this.decor;
    if (!d) return;
    if (d.fase === 'polvilhar' && this.polvilhador && (this.polvilhador.contem(a) || this.bolo.noTopo({ x: a.x, y: a.y + CONFIG_POLVILHAR.quedaPx }, 1.3))) {
      this.tweens.killTweensOf(this.polvilhador);
      this.arrasto = { tipo: 'polvilho' };
      this.som('pop');
      this.runner.inicioDoGesto();
      this.polvilhar(a);
      return;
    }
    if (d.fase === 'glace' && this.bolo.noTopo(a, 1.2)) {
      this.arrasto = { tipo: 'glace' };
      this.runner.inicioDoGesto();
      this.tracarGlace(a);
      return;
    }

    if (this.botaoPronto.visible && Math.abs(a.x - PRONTO.x) <= PRONTO.largura / 2 && Math.abs(a.y - PRONTO.y) <= PRONTO.altura / 2) {
      this.arrasto = { tipo: 'pronto' };
      this.botaoPronto.setScale(0.94);
      this.runner.inicioDoGesto();
      return;
    }
    if (this.liberado) {
      if (Math.hypot(a.x - DESFAZER.x, a.y - DESFAZER.y) <= DESFAZER.raio + 8) {
        if (d.decoracao.desfazer()) this.bolo.desenharEnfeites(d.decoracao);
        this.som('clique');
        this.tweens.add({ targets: this.botaoDesfazer, angle: { from: 0, to: -30 }, duration: 120, yoyo: true });
        return;
      }
      const item = BANDEJA.find((b) => Math.abs(a.x - b.x) <= 48 && Math.abs(a.y - BANDEJA_Y) <= 52);
      if (item) {
        this.runner.inicioDoGesto();
        this.som('pop');
        if (item.tipo === 'granulado') {
          this.arrasto = { tipo: 'granulado' };
          this.sacudir.parar();
          this.pote.setPosition(a.x, a.y).setVisible(true);
        } else {
          const cor = item.tipo === 'vela' ? CORES_CONFEITO[this.contadorCor++ % CORES_CONFEITO.length]! : item.tipo === 'confeito' ? CORES_CONFEITO[this.contadorCor++ % CORES_CONFEITO.length]! : 0;
          const g = this.add.graphics().setDepth(70);
          desenharEnfeite(g, { tipo: item.tipo, x: 0, y: 0, rot: 0, cor });
          g.setPosition(a.x, a.y);
          this.arrasto = { tipo: 'enfeite', enfeite: item.tipo, g, cor };
        }
        return;
      }
    }
    if ((d.fase === 'cobrir' || d.fase === 'enfeitar') && this.bolo.noTopo(a, 1.15)) {
      this.arrasto = { tipo: 'cobrir' };
      this.runner.inicioDoGesto();
      this.cobrir(a);
    }
  }

  protected aoMover(a: AmostraPonteiro): void {
    const arr = this.arrasto;
    if (arr?.tipo === 'cobrir') this.cobrir(a);
    if (arr?.tipo === 'granulado') this.sacudirPote(a);
    if (arr?.tipo === 'recheio') this.espalharRecheio(a);
    if (arr?.tipo === 'glace') this.tracarGlace(a);
    if (arr?.tipo === 'polvilho') this.polvilhar(a);
  }

  protected aoSoltar(a: AmostraPonteiro): void {
    const arr = this.arrasto;
    this.arrasto = null;
    if (!arr) return;
    const rec = this.rechear;
    if (rec && (arr.tipo === 'recheio' || arr.tipo === 'camada')) {
      if (arr.tipo === 'recheio') this.espatula.voltar();
      else this.soltarCamada(rec);
      this.runner.fimDoGesto();
      return;
    }
    const d = this.decor;
    if (!d) return;
    switch (arr.tipo) {
      case 'cobrir':
        this.espatula.voltar();
        break;
      case 'glace':
        this.saco?.voltar();
        break;
      case 'polvilho':
        this.polvilhador?.voltar();
        break;
      case 'recheio':
      case 'camada':
        break;
      case 'granulado':
        this.pote.setVisible(false);
        this.sacudir.parar();
        break;
      case 'enfeite': {
        const p = { x: arr.g.x, y: arr.g.y };
        if (this.bolo.noTopo(p, 0.95)) {
          const rel = this.bolo.paraRelativo(p);
          if (d.decoracao.adicionar([{ tipo: arr.enfeite, x: rel.x, y: rel.y, rot: 0, cor: arr.cor }])) {
            this.bolo.desenharEnfeites(d.decoracao);
            this.som('pop');
            this.brilhinho(p);
          }
          else this.falar('decorar.cheio', 'neutro');
          arr.g.destroy();
        } else {
          this.tweens.add({ targets: arr.g, alpha: 0, scale: 0.4, duration: 250, onComplete: () => arr.g.destroy() });
        }
        break;
      }
      case 'pronto':
        this.botaoPronto.setScale(1);
        if (Math.abs(a.x - PRONTO.x) <= PRONTO.largura / 2 + 20 && Math.abs(a.y - PRONTO.y) <= PRONTO.altura / 2 + 20 && d.finalizar()) {
          this.sessao.coberturaFinal = d.cobertura.cobertura;
          this.tirarFoto(() => this.runner.fimDoGesto());
          return;
        }
        break;
    }
    this.runner.fimDoGesto();
  }

  private cobrir(a: Ponto): void {
    const d = this.decor;
    if (!d) return;
    const seg = d.cobertura.pintar(a.x, a.y);
    if (!seg) return;
    this.bolo.pintar(seg.x0, seg.y0, seg.x1, seg.y1, d.cobertura.raioPincel);
    this.somContinuo('pincel', Math.min(1, Math.hypot(seg.x1 - seg.x0, seg.y1 - seg.y0) / 20));
    this.runner.notificarProgresso();
  }

  private espalharRecheio(a: Ponto): void {
    const rec = this.rechear;
    if (!rec) return;
    const seg = rec.recheio.pintar(a.x, a.y);
    if (!seg) return;
    this.bolo.pintarRecheio(seg.x0, seg.y0, seg.x1, seg.y1, rec.recheio.raioPincel);
    this.somContinuo('pincel', Math.min(1, Math.hypot(seg.x1 - seg.x0, seg.y1 - seg.y0) / 20));
    this.runner.notificarProgresso();
  }

  /** A criança soltou a camada de cima: assenta onde caiu (se perto do bolo) ou volta. */
  private soltarCamada(rec: FillLayerStep): void {
    const c = this.bolo.camadaSuperior;
    if (!c) return;
    if (rec.soltarCamada(c.x - BOLO.cx, c.y - BOLO.topoY)) {
      this.bolo.assentarCamada(c.x, c.y);
      this.som('tum');
      this.estrelas(c.x, c.y - 30, 8);
      this.falar('rechear.ok');
    } else {
      this.tweens.add({ targets: c, x: DESCANSO_CAMADA.x, y: DESCANSO_CAMADA.y, scale: DESCANSO_CAMADA.escala, duration: 350, ease: 'Back.Out' });
      this.falar('rechear.longe', 'neutro');
    }
  }

  private tracarGlace(a: Ponto): void {
    const d = this.decor;
    const traco = d?.tracoGlace;
    if (!d || !d.glace || !traco) return;
    const antes = traco.fracao;
    const seg = traco.tracar(a.x, a.y);
    this.bolo.pintarGlace(corHex(d.glace.cor), seg.x0, seg.y0, seg.x1, seg.y1, CONFIG_GLACE.raioTracoPx);
    this.somContinuo('pincel', Math.min(1, Math.hypot(seg.x1 - seg.x0, seg.y1 - seg.y0) / 20));
    if (traco.fracao > antes) this.runner.notificarProgresso();
  }

  /** Cobertura pronta e a receita pede glacê: monta o desenho no topo do bolo. */
  private prepararGlace(d: DecorStep): void {
    if (!d.glace || d.tracoGlace) return;
    const t = this.bolo.topo;
    d.definirGlace(gerarDesenho(d.glace.desenho, t.x, t.y, BOLO.rx, BOLO.ry));
    this.saco = new Ferramenta(this, 'saco', { x: BOLO.cx + BOLO.rx + 110, y: BOLO.topoY + 60 });
    this.espatula.setVisible(false);
    this.falar('glace.inicio');
  }

  /** O polvilhador acompanha o dedo; cada sacudida sobre o bolo polvilha um círculo abaixo dele. */
  private polvilhar(a: AmostraPonteiro): void {
    const d = this.decor;
    const sp = d?.polvilhador;
    if (!d || !sp || !d.polvilho || !this.polvilhador) return;
    this.polvilhador.setPosition(a.x, a.y - 30);
    const alvo = sp.amostra(a.x, a.y, a.t);
    if (!alvo) return;
    const cor = corHex(d.polvilho.cor);
    const raio = CONFIG_POLVILHAR.raioPx;
    const pontos: Ponto[] = [];
    for (let i = 0; i < 26; i++) {
      const ang = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * raio;
      const p = { x: alvo.x + Math.cos(ang) * r, y: alvo.y + Math.sin(ang) * r * 0.6 };
      if (this.bolo.noTopo(p, 0.97)) pontos.push(p);
    }
    this.bolo.pintarPolvilho(cor, pontos, d.polvilho.tipo === 'granulado' ? 3.2 : 2.4);
    // grãozinhos caindo (cosmético; a porção já foi registrada pela sacudida)
    for (let i = 0; i < (Qualidade.leve ? 3 : 8); i++) {
      const g = this.add.circle(a.x + (Math.random() - 0.5) * 30, a.y, 3, cor).setDepth(69).setStrokeStyle(1, 0x9c8a7e, 0.6);
      this.tweens.add({ targets: g, x: alvo.x + (Math.random() - 0.5) * raio * 1.6, y: alvo.y + (Math.random() - 0.5) * raio * 0.8, duration: 240, ease: 'Quad.In', onComplete: () => g.destroy() });
    }
    this.som('chocalho');
    this.runner.notificarProgresso();
  }

  /** Glacê pronto (ou sem glacê) e a receita pede polvilho: superfície = topo do bolo. */
  private prepararPolvilho(d: DecorStep): void {
    const sp = d.polvilhador;
    if (!sp || sp.definido) return;
    const area = this.bolo.areaTopo;
    sp.definirSuperficie(area, mascaraElipse({ x: area.x + area.largura * 0.025, y: area.y + area.altura * 0.025, largura: area.largura * 0.95, altura: area.altura * 0.95 }));
    this.polvilhador = new Ferramenta(this, 'polvilhador', { x: BOLO.cx + BOLO.rx + 110, y: BOLO.topoY - 20 }, 120);
    this.polvilhador.setDepth(70);
    this.saco?.setVisible(false);
    this.espatula.setVisible(false);
    this.bolo.apagarGuia();
    this.falar('polvilhar.inicio');
  }

  private sacudirPote(a: AmostraPonteiro): void {
    const d = this.decor;
    if (!d) return;
    const porcoes = this.sacudir.amostra(a.x, a.t);
    if (porcoes > 0) this.som('chocalho');
    for (let p = 0; p < porcoes; p++) {
      const novos: Enfeite[] = [];
      for (let i = 0; i < CONFIG_DECORACAO.granulosPorPorcao; i++) {
        const destino = { x: a.x + (Math.random() - 0.5) * 120, y: a.y + 40 + Math.random() * 70 };
        const cor = CORES_CONFEITO[(i + this.contadorCor) % CORES_CONFEITO.length]!;
        const rot = Math.random() * Math.PI;
        if (!Qualidade.leve || i % 3 === 0) this.granuloCaindo(a, destino, cor, rot);
        if (this.bolo.noTopo(destino, 0.97)) {
          const rel = this.bolo.paraRelativo(destino);
          novos.push({ tipo: 'granulado', x: rel.x, y: rel.y, rot, cor });
        }
      }
      this.contadorCor++;
      if (novos.length > 0 && d.decoracao.adicionar(novos)) this.time.delayedCall(260, () => this.bolo.desenharEnfeites(d.decoracao));
    }
  }

  /** Granulo caindo do pote (cosmético; a porção já foi registrada pelo gesto de sacudir). */
  private granuloCaindo(de: Ponto, para: Ponto, cor: number, rot: number): void {
    const g = this.add.graphics().setDepth(69);
    desenharEnfeite(g, { tipo: 'granulado', x: 0, y: 0, rot, cor });
    g.setPosition(de.x, de.y + 30);
    this.tweens.add({ targets: g, x: para.x, y: para.y, duration: 250, ease: 'Quad.In', onComplete: () => g.destroy() });
  }

  private tirarFoto(depois: () => void): void {
    const r = this.bolo.enquadramento;
    this.mascote.silenciar();
    this.game.renderer.snapshotArea(Math.round(r.x), Math.round(r.y), Math.round(r.largura), Math.round(r.altura), (img) => {
      const chave = `bolo-${Date.now()}`;
      if (img instanceof HTMLImageElement) {
        const registrar = () => {
          if (!this.textures.exists(chave)) this.textures.addImage(chave, img);
          this.sessao.fotoBolo = chave;
          this.sessao.fotoUrl = fotoJpeg(img);
          this.sessao.enfeites = this.decor?.decoracao.total ?? 0;
          depois();
        };
        if (img.complete) registrar();
        else img.onload = registrar;
      } else depois();
    });
  }

  // ================================================================ loop

  protected atualizar(dt: number): void {
    const d = this.decor;
    const arr = this.arrasto;
    if (arr?.tipo === 'cobrir') this.espatula.seguir({ x: this.dedo.x + 10, y: this.dedo.y + 30 }, dt);
    if (arr?.tipo === 'enfeite') arr.g.setPosition(this.dedo.x, this.dedo.y - 10);
    if (arr?.tipo === 'granulado') this.pote.setPosition(this.dedo.x, this.dedo.y);
    if (arr?.tipo === 'recheio') this.espatula.seguir({ x: this.dedo.x + 10, y: this.dedo.y + 30 }, dt);
    if (arr?.tipo === 'glace') this.saco?.seguir(this.dedo, dt);
    if (arr?.tipo === 'camada' && this.bolo.camadaSuperior) {
      const c = this.bolo.camadaSuperior;
      const k = 1 - Math.exp(-18 * (dt / 1000));
      c.x += (this.dedo.x + arr.offset.x - c.x) * k;
      c.y += (this.dedo.y + arr.offset.y - c.y) * k;
    }

    const rec = this.rechear;
    if (rec) {
      this.barra.definir(rec.progresso, 0);
      if (rec.recheioOk && !this.avisouCamada) {
        this.avisouCamada = true;
        this.falar('rechear.camada');
        const c = this.bolo.camadaSuperior;
        if (c) this.tweens.add({ targets: c, angle: { from: -5, to: 5 }, duration: 120, yoyo: true, repeat: 2, onComplete: () => c.setAngle(0) });
      }
      return;
    }
    if (!d) return;
    this.barra.definir(d.progresso, 0);
    if (d.coberturaOk && d.glace && !d.tracoGlace) this.prepararGlace(d);
    const traco = d.tracoGlace;
    if (traco && d.fase === 'glace') this.bolo.desenharGuia(traco.pontos, (i) => traco.ehVisitado(i), traco.fracao.toFixed(3));
    if (d.fase === 'polvilhar') this.prepararPolvilho(d);
    if (d.fase === 'enfeitar' && !this.liberado) {
      this.liberado = true;
      this.barra.setVisible(false);
      this.bolo.apagarGuia();
      this.saco?.setVisible(false);
      this.polvilhador?.setVisible(false);
      this.espatula.setVisible(true);
      this.tweens.add({ targets: [this.bandeja, this.botaoDesfazer], alpha: 1, duration: 300 });
      this.botaoPronto.setVisible(true).setScale(0.3);
      this.tweens.add({ targets: this.botaoPronto, scale: 1, duration: 400, ease: 'Back.Out' });
      if (d.polvilho) {
        this.som('sucesso');
        this.falar('polvilhar.ok');
      } else if (d.glace) {
        this.som('sucesso');
        this.falar('glace.ok');
      } else this.falar('decorar.liberado');
    }
  }

  /** Brilho rápido onde um enfeite grudou (cosmético). */
  private brilhinho(p: Ponto): void {
    const b = this.add.image(p.x, p.y, TEXTURAS.brilho).setDepth(71).setScale(0.2).setTint(0xf0e442);
    this.tweens.add({ targets: b, scale: 1.2, alpha: 0, angle: 90, duration: 420, onComplete: () => b.destroy() });
  }

  // ================================================================ dicas

  protected dicaAtual(): DicaEtapa | null {
    const ficha = this.runner.estado.indice;
    const topo = this.bolo.topo;
    const rec = this.rechear;
    if (rec) {
      const baixo = { x: BOLO.cx, y: this.bolo.areaRecheio.y + BOLO.ry };
      if (!rec.recheioOk) return { ficha, destaques: [baixo], demo: { tipo: 'esfregar', centro: baixo, largura: BOLO.rx * 1.4, altura: BOLO.ry * 1.2 }, fala: 'rechear.dica_recheio' };
      const de = { x: DESCANSO_CAMADA.x, y: DESCANSO_CAMADA.y };
      return {
        ficha,
        destaques: [de],
        demo: { tipo: 'arrastar', de, para: { x: BOLO.cx, y: BOLO.topoY }, fantasma: (g) => { g.fillStyle(0xd9a05b, 1); g.fillEllipse(0, 0, BOLO.rx * 2, BOLO.ry * 2); } },
        fala: 'rechear.dica_camada',
      };
    }
    const d = this.decor;
    if (d?.fase === 'glace' && d.tracoGlace) {
      const pts = d.tracoGlace.pontos.filter((_, i) => i % 4 === 0);
      return { ficha, destaques: [topo], demo: { tipo: 'caminho', pontos: pts }, fala: 'glace.dica' };
    }
    if (d?.fase === 'polvilhar') {
      const acima = { x: topo.x - 40, y: topo.y - CONFIG_POLVILHAR.quedaPx };
      return { ficha, destaques: [this.polvilhador ?? acima], demo: { tipo: 'sacudir', ponto: acima }, fala: 'polvilhar.dica' };
    }
    if (!this.liberado) return { ficha, destaques: [topo], demo: { tipo: 'esfregar', centro: topo, largura: BOLO.rx * 1.4, altura: BOLO.ry * 1.2 }, fala: 'decorar.dica_cobertura' };
    const vela = BANDEJA.find((b) => b.tipo === 'vela')!;
    const pote = BANDEJA.find((b) => b.tipo === 'granulado')!;
    return {
      ficha,
      destaques: [{ x: vela.x, y: BANDEJA_Y }, { x: pote.x, y: BANDEJA_Y }],
      demo: {
        tipo: 'arrastar',
        de: { x: vela.x, y: BANDEJA_Y },
        para: topo,
        fantasma: (g) => desenharEnfeite(g, { tipo: 'vela', x: 0, y: 20, rot: 0, cor: 0x56b4e9 }),
      },
      fala: 'decorar.dica_enfeites',
    };
  }

  // ================================================================ debug

  protected infoDebug(g: Phaser.GameObjects.Graphics): string[] {
    const d = this.decor;
    if (!d) return [];
    desenharGrade(g, d.cobertura);
    g.lineStyle(2, 0x00ffff, 1);
    g.strokeEllipse(BOLO.cx, BOLO.topoY, BOLO.rx * 2 * 0.95, BOLO.ry * 2 * 0.95);
    return [
      `Decorar: cobertura ${(d.cobertura.cobertura * 100).toFixed(1)}% / meta ${(d.cobertura.meta * 100).toFixed(0)}%  liberado ${this.liberado}`,
      ...(d.polvilhador ? [`Polvilhar ${d.polvilho?.tipo}: ${(d.polvilhador.cobertura * 100).toFixed(1)}% / meta ${(d.polvilhador.meta * 100).toFixed(0)}%  sacudidas ${d.polvilhador.sacudidas}  fase ${d.fase}`] : []),
      `  enfeites ${d.decoracao.total}/${d.decoracao.maxItens}  sacudir vx ${this.sacudir.velocidadeX.toFixed(2)} inv ${this.sacudir.inversoesNaJanela}`,
    ];
  }
}

/** Reduz a foto para JPEG pequeno (~20–40 KB) — cabe dezenas na galeria do localStorage. */
function fotoJpeg(img: HTMLImageElement, largura = 360): string | null {
  try {
    const c = document.createElement('canvas');
    c.width = largura;
    c.height = Math.round((largura * img.height) / img.width);
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffeef4';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  } catch {
    return null;
  }
}
