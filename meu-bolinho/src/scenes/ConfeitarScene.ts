/**
 * Confeitar: cobertura com o dedo (CoverageStep dentro do DecorStep), depois enfeites
 * arrastados um a um (presos ao topo do bolo, em camadas) e granulado sacudindo o pote.
 * "Desfazer" remove a última ação. "Pronto!" aparece só após a cobertura mínima e apenas
 * encerra a parte criativa (não executa nada no bolo).
 */
import Phaser from 'phaser';
import { CONFIG_DECORACAO } from '../config/gameplay';
import { BANDEJA_Y, BARRA_MEXER, BOLO, CORES } from '../config/layout';
import { CakeView } from '../entities/Cake';
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
import { type Ponto } from '../utils/math';
import { CenaEtapas } from './CenaEtapas';
import { desenharGrade } from './CozinhaScene';

type Arrasto =
  | { tipo: 'cobrir' }
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
  private pote!: Phaser.GameObjects.Graphics;
  private readonly sacudir = new ShakeRecognizer();
  private arrasto: Arrasto | null = null;
  private liberado = false;
  private contadorCor = 0;

  constructor() {
    super('Confeitar');
  }

  override init(dados: Parameters<CenaEtapas['init']>[0]): void {
    super.init(dados);
    this.arrasto = null;
    this.liberado = false;
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

    const etapa = this.runner.etapa;
    const cor = etapa?.tipo === 'decorar' ? Number.parseInt(etapa.corCobertura.slice(1), 16) : 0x5a3220;
    this.bolo = new CakeView(this, cor, Number.parseInt(this.sessao.receita.corMassa.slice(1), 16));
    this.espatula = new Ferramenta(this, 'espatula', { x: BOLO.cx + BOLO.rx + 110, y: BOLO.topoY + 40 });
    this.barra = new ProgressBar(this, BARRA_MEXER.x - 120, 130, BARRA_MEXER.largura, BARRA_MEXER.altura, 'nenhum');

    this.bandeja = this.add.container(0, 0).setDepth(55).setAlpha(0.3);
    const fundo = this.add.graphics();
    fundo.fillStyle(0xffffff, 0.85);
    fundo.fillRoundedRect(BANDEJA[0]!.x - 60, BANDEJA_Y - 52, BANDEJA[BANDEJA.length - 1]!.x - BANDEJA[0]!.x + 120, 104, 24);
    this.bandeja.add(fundo);
    for (const b of BANDEJA) {
      const ic = this.add.graphics();
      desenharIconeEnfeite(ic, b.tipo, b.x, BANDEJA_Y);
      this.bandeja.add(ic);
    }
    this.pote = this.add.graphics().setDepth(70).setVisible(false);
    desenharIconeEnfeite(this.pote, 'granulado', 0, 0);

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

    this.botaoPronto = this.add.container(PRONTO.x, PRONTO.y).setDepth(55).setVisible(false);
    const gp = this.add.graphics();
    gp.fillStyle(CORES.sucesso, 1);
    gp.fillRoundedRect(-PRONTO.largura / 2, -PRONTO.altura / 2, PRONTO.largura, PRONTO.altura, PRONTO.altura / 2);
    gp.lineStyle(4, 0x006b4f, 1);
    gp.strokeRoundedRect(-PRONTO.largura / 2, -PRONTO.altura / 2, PRONTO.largura, PRONTO.altura, PRONTO.altura / 2);
    const tp = this.add.text(0, 0, '✓ Pronto!', { fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif', fontSize: '34px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    this.botaoPronto.add([gp, tp]);
  }

  protected prepararEtapa(_indice: number, etapa: EtapaResolvida): void {
    if (etapa.tipo !== 'decorar') return;
    const d = this.decor;
    d?.cobertura.definirSuperficie(this.bolo.areaTopo, mascaraElipse(this.bolo.areaTopo));
    this.falar('decorar.cobertura');
  }

  // ================================================================ input

  protected aoTocar(a: AmostraPonteiro): void {
    const d = this.decor;
    if (this.arrasto || !d) return;

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
    if (this.bolo.noTopo(a, 1.15)) {
      this.arrasto = { tipo: 'cobrir' };
      this.runner.inicioDoGesto();
      this.cobrir(a);
    }
  }

  protected aoMover(a: AmostraPonteiro): void {
    const arr = this.arrasto;
    if (arr?.tipo === 'cobrir') this.cobrir(a);
    if (arr?.tipo === 'granulado') this.sacudirPote(a);
  }

  protected aoSoltar(a: AmostraPonteiro): void {
    const arr = this.arrasto;
    this.arrasto = null;
    const d = this.decor;
    if (!arr || !d) return;
    switch (arr.tipo) {
      case 'cobrir':
        this.espatula.voltar();
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
        this.granuloCaindo(a, destino, cor, rot);
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
    if (!d) return;
    this.barra.definir(d.cobertura.progresso, 0);
    if (d.coberturaOk && !this.liberado) {
      this.liberado = true;
      this.barra.setVisible(false);
      this.tweens.add({ targets: [this.bandeja, this.botaoDesfazer], alpha: 1, duration: 300 });
      this.botaoPronto.setVisible(true).setScale(0.3);
      this.tweens.add({ targets: this.botaoPronto, scale: 1, duration: 400, ease: 'Back.Out' });
      this.falar('decorar.liberado');
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
    const topo = { x: BOLO.cx, y: BOLO.topoY };
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
