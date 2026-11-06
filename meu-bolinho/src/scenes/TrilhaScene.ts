/**
 * Trilha de fases: um caminho com as receitas em ordem (data/trilha.json). A criança avança de
 * receita em receita: terminar uma (qualquer modo, qualquer estrela) libera a próxima.
 * Cada fase mostra as estrelas já ganhas e um selo "NOVO" com a mecânica que estreia nela.
 * Fases trancadas mostram um cadeado (a área dos pais pode liberar todas).
 */
import Phaser from 'phaser';
import { TEXTURAS } from '../art/ArteProcedural';
import { ALTURA, CORES, LARGURA } from '../config/layout';
import { carregarReceita, RECEITAS } from '../data/registry';
import { MUNDOS, ordemDaTrilhaJson } from '../data/trilhaDados';
import { AudioSystem } from '../systems/audio/AudioSystem';
import { carregarEstrelas, dividirEmMundos, montarTrilha, mundoAtual, placar, type FaseTrilha, type Mecanica } from '../systems/progresso/Trilha';
import { Sessao } from '../systems/recipe/Sessao';
import type { Dificuldade, Produto } from '../systems/recipe/recipeTypes';
import { carregarPreferencias } from '../systems/save/Preferencias';
import { armazenamentoJogador, nomeExibido, perfilAtual } from '../systems/save/Perfis';
import { armazenamentoLocal } from '../systems/save/Preferencias';
import { desenharAvatar } from '../utils/avatar';
import { assarGraphics, imagemVetorial } from '../utils/CacheGrafico';
import { corHex, escurecer } from '../utils/desenho';
import { aoSoltarNoObjeto, botaoGrande } from './ui';

const FONTE = 'Arial Rounded MT Bold, Arial, sans-serif';
const RAIO = 54;

/** Posições das fases: caminho em "S" (4 por linha), cabe em 1280×720 sem rolar. */
function posicoes(n: number): { x: number; y: number }[] {
  const colunas = 4;
  const linhas = Math.ceil(n / colunas);
  const y0 = 230, dy = linhas > 1 ? Math.min(250, 380 / (linhas - 1)) : 0;
  return Array.from({ length: n }, (_, i) => {
    const lin = Math.floor(i / colunas);
    let col = i % colunas;
    if (lin % 2 === 1) col = colunas - 1 - col; // vai e volta
    return { x: 235 + col * 270, y: y0 + lin * dy };
  });
}

/** Miniatura do que se faz na fase (com a cor da receita). */
function desenharProdutoMini(g: Phaser.GameObjects.Graphics, produto: Produto, cor: number): void {
  const lado = escurecer(cor, 0.2);
  switch (produto) {
    case 'bolo':
      g.fillStyle(lado, 1);
      g.fillRect(-26, -4, 52, 20);
      g.fillEllipse(0, 16, 52, 16);
      g.fillStyle(cor, 1);
      g.fillEllipse(0, -4, 52, 16);
      g.fillStyle(0xd7263d, 1);
      g.fillCircle(0, -14, 7);
      break;
    case 'torta':
      g.fillStyle(0xd9a05b, 1);
      g.fillEllipse(0, 8, 64, 26);
      for (let i = 0; i < 14; i++) g.fillCircle(Math.cos((i / 14) * Math.PI * 2) * 30, 4 + Math.sin((i / 14) * Math.PI * 2) * 11, 5);
      g.fillStyle(cor, 1);
      g.fillEllipse(0, 4, 50, 18);
      g.fillStyle(0xd7263d, 1);
      g.fillCircle(-8, 2, 5);
      g.fillCircle(8, 5, 5);
      break;
    case 'biscoito':
      for (const [dx, dy] of [[-16, -8], [16, -6], [0, 12]] as const) {
        g.fillStyle(lado, 1);
        g.fillEllipse(dx, dy + 3, 30, 14);
        g.fillStyle(cor, 1);
        g.fillEllipse(dx, dy, 30, 14);
      }
      break;
    case 'brownie':
      g.fillStyle(lado, 1);
      g.fillRect(-26, 2, 52, 14);
      g.fillStyle(cor, 1);
      g.fillRoundedRect(-26, -14, 52, 18, 4);
      g.lineStyle(2, escurecer(cor, 0.45), 1);
      g.lineBetween(0, -14, 0, 16);
      break;
    case 'cupcake':
      g.fillStyle(0xf4a6c0, 1);
      g.fillPoints([{ x: -18, y: 0 }, { x: 18, y: 0 }, { x: 12, y: 22 }, { x: -12, y: 22 }], true);
      g.fillStyle(cor, 1);
      g.fillCircle(-8, -6, 12);
      g.fillCircle(8, -6, 12);
      g.fillCircle(0, -16, 12);
      g.fillStyle(0xd7263d, 1);
      g.fillCircle(0, -28, 5);
      break;
  }
}

/** Mecânicas que ganham selo "NOVO" e aviso no popup. */
const NOMES_MECANICA: Partial<Record<Mecanica, string>> = {
  bater: 'bater claras em neve',
  rechear: 'rechear o bolo em camadas',
  glace: 'escrever com glacê',
  peneirar: 'peneirar a farinha',
  ralar: 'ralar com o ralador',
  polvilhar: 'polvilhar por cima do bolo',
  abrir_massa: 'abrir a massa com o rolo',
  cortar: 'cortar biscoitos com o cortador',
  fatiar: 'cortar em fatias com a faca',
};

/** Ícone da mecânica nova (selo "NOVO"). */
function iconeMecanica(g: Phaser.GameObjects.Graphics, m: Mecanica, x: number, y: number): void {
  g.lineStyle(3, 0x3b2a20, 1);
  switch (m) {
    case 'bater':
      g.lineStyle(3, 0x8a96a3, 1);
      g.strokeEllipse(x, y - 4, 16, 24);
      g.strokeEllipse(x, y - 4, 6, 24);
      g.fillStyle(0x8a6440, 1);
      g.fillRect(x - 3, y + 8, 6, 10);
      break;
    case 'rechear':
      g.fillStyle(0xd9a05b, 1);
      g.fillRect(x - 13, y + 2, 26, 8);
      g.fillRect(x - 13, y - 12, 26, 8);
      g.fillStyle(0xd7263d, 1);
      g.fillRect(x - 13, y - 4, 26, 6);
      break;
    case 'peneirar':
      g.fillStyle(0xdfe7ee, 1);
      g.fillEllipse(x, y + 2, 30, 12);
      g.strokeEllipse(x, y + 2, 30, 12);
      g.fillStyle(0xefe3c8, 1);
      for (const [dx, dy] of [[-6, 10], [0, 14], [6, 10]] as const) g.fillCircle(x + dx, y + dy, 2);
      break;
    case 'ralar':
      g.fillStyle(0xc5ccd3, 1);
      g.fillRoundedRect(x - 9, y - 14, 18, 28, 3);
      g.fillStyle(0x6b7680, 1);
      for (let l = -10; l <= 8; l += 6) g.fillRect(x - 4, y + l, 8, 2);
      break;
    case 'polvilhar':
      g.fillStyle(0xffffff, 1);
      g.fillRoundedRect(x - 8, y - 16, 16, 20, 4);
      g.strokeRoundedRect(x - 8, y - 16, 16, 20, 4);
      g.fillStyle(0x6b3e26, 1);
      for (const [dx, dy] of [[-6, 10], [0, 14], [6, 9]] as const) g.fillCircle(x + dx, y + dy, 2);
      break;
    case 'abrir_massa':
      g.fillStyle(0xd9a05b, 1);
      g.fillRoundedRect(x - 14, y - 6, 28, 12, 6);
      g.fillStyle(0x8a6440, 1);
      g.fillRect(x - 20, y - 3, 6, 6);
      g.fillRect(x + 14, y - 3, 6, 6);
      break;
    case 'cortar':
      g.lineStyle(4, 0x8a96a3, 1);
      g.strokeCircle(x, y, 10);
      break;
    case 'fatiar':
      g.fillStyle(0xd7dde2, 1);
      g.fillTriangle(x - 12, y + 10, x + 2, y - 14, x + 10, y - 12);
      g.fillStyle(0x8a6440, 1);
      g.fillRect(x + 2, y - 20, 8, 8);
      break;
    case 'glace':
      g.fillStyle(0xffffff, 1);
      g.fillTriangle(x - 10, y - 14, x + 10, y - 14, x, y + 12);
      g.strokeTriangle(x - 10, y - 14, x + 10, y - 14, x, y + 12);
      break;
    default:
      g.fillStyle(CORES.destaque, 1);
      g.fillCircle(x, y, 9);
  }
}

export interface DadosTrilha {
  /** Mundo a mostrar (0 = primeiro). Sem isso: o mundo onde a criança está. */
  mundo?: number;
}

export class TrilhaScene extends Phaser.Scene {
  private popup: Phaser.GameObjects.Container | null = null;
  private mundoPedido: number | null = null;
  /** Mundo mostrado agora (lido pelos testes). */
  mundo = 0;

  constructor() {
    super('Trilha');
  }

  init(dados: DadosTrilha): void {
    this.mundoPedido = typeof dados?.mundo === 'number' ? dados.mundo : null;
  }

  create(): void {
    this.popup = null;
    this.add.image(0, 0, TEXTURAS.fundoMenu).setOrigin(0);
    const audio = AudioSystem.get();
    const arm = armazenamentoJogador();
    const todas = montarTrilha(ordemDaTrilhaJson(), RECEITAS, carregarEstrelas(arm), carregarPreferencias(arm).liberarFases);
    const mundos = dividirEmMundos(todas, MUNDOS);
    const im = Phaser.Math.Clamp(this.mundoPedido ?? mundoAtual(mundos), 0, mundos.length - 1);
    this.mundo = im;
    const mundo = mundos[im]!;
    const fases = mundo.fases;
    const pos = posicoes(fases.length);

    this.add.text(LARGURA / 2, 40, `Mundo ${mundo.numero}: ${mundo.nome}`, { fontFamily: FONTE, fontSize: '40px', color: '#3b2a20', fontStyle: 'bold', stroke: '#ffffff', strokeThickness: 8 }).setOrigin(0.5);
    // bolinhas dos mundos
    mundos.forEach((m, i) => this.add.circle(LARGURA / 2 + (i - (mundos.length - 1) / 2) * 26, 82, 8, i === im ? CORES.sucesso : m.aberto ? 0xffffff : 0xb0a49a).setStrokeStyle(2, 0x8a7f76));
    const { estrelas, maximo } = placar(todas);
    const p = this.add.container(LARGURA - 130, 48);
    p.add(this.add.image(-50, 0, 'estrela').setScale(1.8).setTint(CORES.destaque));
    p.add(this.add.text(-28, 0, `${estrelas}/${maximo}`, { fontFamily: FONTE, fontSize: '32px', color: '#3b2a20', fontStyle: 'bold' }).setOrigin(0, 0.5));
    botaoGrande(this, 80, 48, '⌂', 0x0072b2, () => this.scene.start('Menu'), 110, 80);
    this.criarJogador();
    // setas entre mundos (o próximo só abre quando a primeira fase dele for liberada)
    if (im > 0) botaoGrande(this, 50, ALTURA / 2 + 40, '◀', 0xcc79a7, () => this.scene.restart({ mundo: im - 1 }), 80, 110).setName('mundo:anterior');
    const prox = mundos[im + 1];
    if (prox) {
      const b = botaoGrande(this, LARGURA - 50, ALTURA / 2 + 40, prox.aberto ? '▶' : '🔒', prox.aberto ? 0xcc79a7 : 0xb0a49a, () => {
        if (prox.aberto) this.scene.restart({ mundo: im + 1 });
        else {
          audio?.efeito('boing');
          audio?.falar('trilha.mundo_trancado');
        }
      }, 80, 110);
      b.setName('mundo:proximo');
    }

    // estrada (estática: assada numa textura)
    const estrada = this.add.graphics();
    estrada.lineStyle(34, 0xffffff, 0.85);
    estrada.strokePoints(pos, false);
    estrada.lineStyle(6, 0xe6c9a8, 1);
    for (let i = 1; i < pos.length; i++) {
      const a = pos[i - 1]!, b = pos[i]!;
      const n = Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / 34);
      for (let k = 1; k < n; k += 2) estrada.lineBetween(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n, a.x + ((b.x - a.x) * (k + 1)) / n, a.y + ((b.y - a.y) * (k + 1)) / n);
    }
    assarGraphics(this, estrada, `trilha:estrada:${fases.length}:${im}`, { x: 0, y: 0, largura: LARGURA, altura: ALTURA });

    const atual = fases.find((f) => f.liberada && !f.concluida) ?? null;
    fases.forEach((f, i) => this.criarFase(f, pos[i]!, f === atual));
    // mascote parado na fase da vez
    if (atual) {
      const pa = pos[fases.indexOf(atual)]!;
      const m = this.add.image(pa.x - 78, pa.y - 66, this.textures.exists('menu:bolinho') ? 'menu:bolinho' : 'estrela').setScale(0.32);
      this.tweens.add({ targets: m, y: m.y - 10, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }
    audio?.falar(this.mundoPedido === null && im > 0 && fases[0] === atual ? (im === 2 ? 'trilha.mundo3' : 'trilha.mundo_novo') : 'trilha.escolher');
  }

  /** Avatar e nome de quem está jogando; tocar troca de jogador. */
  private criarJogador(): void {
    const perfil = perfilAtual(armazenamentoLocal());
    if (!perfil) return;
    const c = this.add.container(190, 48).setName('jogador');
    c.add(imagemVetorial(this, `avatar:${perfil.avatar}:30`, { x: -34, y: -34, largura: 68, altura: 68 }, (g) => desenharAvatar(g, perfil.avatar, 0, 0, 30)));
    c.add(this.add.text(40, 0, nomeExibido(perfil), { fontFamily: FONTE, fontSize: '24px', color: '#3b2a20', fontStyle: 'bold', stroke: '#ffffff', strokeThickness: 5 }).setOrigin(0, 0.5));
    c.setSize(200, 72).setInteractive({ useHandCursor: true });
    aoSoltarNoObjeto(c, () => {
      AudioSystem.get()?.efeito('pop');
      this.scene.start('Perfis');
    });
  }

  private criarFase(f: FaseTrilha, p: { x: number; y: number }, atual: boolean): void {
    const c = this.add.container(p.x, p.y).setName(f.id);
    const cor = corHex(f.corMassa);
    const fundo = imagemVetorial(this, `fase:${f.liberada ? 'aberta' : 'trancada'}:${f.id}`, { x: -RAIO - 6, y: -RAIO - 6, largura: RAIO * 2 + 12, altura: RAIO * 2 + 12 }, (g) => {
      g.fillStyle(f.liberada ? 0xffffff : 0xd8cfc6, 1);
      g.fillCircle(0, 0, RAIO);
      g.lineStyle(6, f.liberada ? escurecer(cor, 0.35) : 0xa89c92, 1);
      g.strokeCircle(0, 0, RAIO);
      if (f.liberada) {
        desenharProdutoMini(g, f.produto, cor);
      } else {
        // cadeado
        g.fillStyle(0x8a7f76, 1);
        g.fillRoundedRect(-18, -6, 36, 28, 6);
        g.lineStyle(7, 0x8a7f76, 1);
        g.beginPath();
        g.arc(0, -6, 12, Math.PI, 0, false);
        g.strokePath();
      }
    });
    c.add(fundo);
    // número da fase
    c.add(this.add.circle(-RAIO + 8, -RAIO + 8, 18, f.liberada ? CORES.sucesso : 0xa89c92));
    c.add(this.add.text(-RAIO + 8, -RAIO + 8, String(f.numero), { fontFamily: FONTE, fontSize: '22px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5));
    // estrelas ganhas
    for (let k = 0; k < 3; k++) c.add(this.add.image((k - 1) * 30, RAIO + 22, 'estrela').setScale(1.15).setTint(k < f.estrelas ? CORES.destaque : 0xd8cfc6));
    c.add(this.add.text(0, RAIO + 46, f.nome, { fontFamily: FONTE, fontSize: '19px', color: f.liberada ? '#3b2a20' : '#9c8a7e', align: 'center', wordWrap: { width: 200 } }).setOrigin(0.5, 0));
    // selo "NOVO" com a mecânica que estreia aqui
    if (f.novidades.length > 0 && !f.concluida) {
      const selo = this.add.container(RAIO - 4, -RAIO + 6);
      const gs = this.add.graphics();
      gs.fillStyle(0xd55e00, 1);
      gs.fillRoundedRect(-34, -16, 68, 32, 14);
      selo.add(gs);
      selo.add(this.add.text(-6, 0, 'NOVO', { fontFamily: FONTE, fontSize: '15px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5));
      const gi = this.add.graphics();
      iconeMecanica(gi, f.novidades.find((m) => m in NOMES_MECANICA) ?? f.novidades[0]!, 46, 0);
      selo.add(gi);
      c.add(selo);
      if (f.liberada) this.tweens.add({ targets: selo, angle: { from: -6, to: 6 }, duration: 700, yoyo: true, repeat: -1 });
    }
    if (atual) this.tweens.add({ targets: fundo, scale: 1.08, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    c.setSize(RAIO * 2 + 20, RAIO * 2 + 20).setInteractive({ useHandCursor: f.liberada });
    aoSoltarNoObjeto(c, () => {
      const audio = AudioSystem.get();
      if (!f.liberada) {
        audio?.efeito('boing');
        audio?.falar('trilha.trancada');
        this.tweens.add({ targets: c, angle: { from: -8, to: 8 }, duration: 70, yoyo: true, repeat: 3, onComplete: () => c.setAngle(0) });
        return;
      }
      audio?.efeito('pop');
      this.abrirFase(f);
    });
  }

  /** Escolha do modo da fase (Fácil ⭐ / Confeiteiro ⭐⭐). */
  private abrirFase(f: FaseTrilha): void {
    if (this.popup) return;
    const c = this.add.container(0, 0).setDepth(100);
    const fundo = this.add.rectangle(0, 0, LARGURA, ALTURA, 0x3b2a20, 0.55).setOrigin(0).setInteractive();
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(LARGURA / 2 - 360, 150, 720, 420, 30);
    c.add([fundo, g]);
    c.add(this.add.text(LARGURA / 2, 210, `Fase ${f.numero}: ${f.nome}`, { fontFamily: FONTE, fontSize: '38px', color: '#3b2a20', fontStyle: 'bold' }).setOrigin(0.5));
    for (let k = 0; k < 3; k++) c.add(this.add.image(LARGURA / 2 + (k - 1) * 50, 270, 'estrela').setScale(2).setTint(k < f.estrelas ? CORES.destaque : 0xd8cfc6));
    const NOMES: Partial<Record<Mecanica, string>> = NOMES_MECANICA;
    const novidade = f.novidades.map((m) => NOMES[m]).find(Boolean);
    if (novidade) {
      const gi = this.add.graphics();
      iconeMecanica(gi, f.novidades.find((m) => NOMES[m])!, LARGURA / 2 - 250, 510);
      c.add(gi);
      c.add(this.add.text(LARGURA / 2 - 225, 510, `Novidade nesta fase: ${novidade}!`, { fontFamily: FONTE, fontSize: '26px', color: '#d55e00', fontStyle: 'bold' }).setOrigin(0, 0.5));
    }
    const jogar = (d: Dificuldade) => {
      const sessao = new Sessao(carregarReceita(f.id, d));
      sessao.runner.iniciar();
      this.scene.start(sessao.cenaAtual ?? 'Menu', { sessao });
    };
    c.add(botaoGrande(this, LARGURA / 2 - 170, 400, '★ Fácil', 0x56b4e9, () => jogar('facil'), 300, 110));
    c.add(botaoGrande(this, LARGURA / 2 + 170, 400, '★★ Confeiteiro', 0xe69f00, () => jogar('confeiteiro'), 320, 110));
    c.add(botaoGrande(this, LARGURA / 2 + 320, 175, '✕', 0xd55e00, () => {
      c.destroy(true);
      this.popup = null;
    }, 80, 76));
    this.popup = c;
  }
}
