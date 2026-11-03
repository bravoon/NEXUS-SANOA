/**
 * Arte gerada por código no Boot e salva como texturas (desenhada uma vez, reaproveitada
 * em todo frame — mais leve que redesenhar Graphics). Substituível por um atlas ilustrado:
 * basta carregar texturas com as mesmas chaves (TEXTURAS) na Preload.
 */
import Phaser from 'phaser';
import { ALTURA, LARGURA, MESA_Y } from '../config/layout';
import { clarear, escurecer, misturarCor } from '../utils/desenho';

export const TEXTURAS = {
  fundoCozinha: 'fundo:cozinha',
  fundoForno: 'fundo:forno',
  fundoConfeitar: 'fundo:confeitar',
  fundoMenu: 'fundo:menu',
  sombra: 'sombra',
  mao: 'mao',
  brilho: 'brilho',
  vapor: 'vapor',
  po: 'po',
} as const;

/** Degradê vertical em faixas (Graphics.generateTexture usa o renderizador canvas, sem gradiente nativo). */
function degrade(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, de: number, para: number, faixas = 24): void {
  for (let i = 0; i < faixas; i++) {
    g.fillStyle(misturarCor(de, para, i / (faixas - 1)), 1);
    g.fillRect(x, y + (h * i) / faixas, w, Math.ceil(h / faixas) + 1);
  }
}

function mesaDeMadeira(g: Phaser.GameObjects.Graphics): void {
  const h = ALTURA - MESA_Y;
  degrade(g, 0, MESA_Y, LARGURA, h, 0xd49a63, 0xa86d3b, 12);
  g.fillStyle(0x8a5530, 1);
  g.fillRect(0, MESA_Y, LARGURA, 12);
  g.fillStyle(0xe8b27a, 1);
  g.fillRect(0, MESA_Y + 12, LARGURA, 3);
  // tábuas e veios
  g.lineStyle(2, 0x9a6234, 0.5);
  for (let x = 160; x < LARGURA; x += 260) g.lineBetween(x, MESA_Y + 15, x - 30, ALTURA);
  g.lineStyle(1.5, 0xb97a45, 0.6);
  for (let i = 0; i < 18; i++) {
    const y = MESA_Y + 30 + (i % 6) * 16;
    const x0 = (i * 211) % LARGURA;
    g.beginPath();
    g.arc(x0, y + 60, 60, Math.PI * 1.2, Math.PI * 1.8, false);
    g.strokePath();
  }
}

function fundoCozinha(cena: Phaser.Scene): void {
  const g = cena.make.graphics({}, false);
  degrade(g, 0, 0, LARGURA, MESA_Y, 0xfff1dc, 0xfcdcb6);
  // azulejos atrás da bancada
  const yAz = 360;
  for (let y = yAz; y < MESA_Y; y += 40) {
    for (let x = ((y - yAz) / 40) % 2 ? -20 : 0; x < LARGURA; x += 40) {
      g.fillStyle((x / 40 + y / 40) % 2 ? 0xfdf7ee : 0xf3e4cf, 1);
      g.fillRect(x + 1, y + 1, 38, 38);
    }
  }
  g.fillStyle(0xe7c9a3, 1);
  g.fillRect(0, yAz - 8, LARGURA, 8);
  // janela com cortinas
  const jx = 70, jy = 140, jw = 240, jh = 190;
  g.fillStyle(0x8a5530, 1);
  g.fillRoundedRect(jx - 12, jy - 12, jw + 24, jh + 24, 16);
  degrade(g, jx, jy, jw, jh, 0x9ad0f5, 0xd9f0ff, 10);
  g.fillStyle(0xffffff, 0.9);
  g.fillCircle(jx + 60, jy + 60, 18);
  g.fillCircle(jx + 82, jy + 52, 22);
  g.fillCircle(jx + 104, jy + 62, 16);
  g.fillStyle(0x7fc97f, 1);
  g.fillEllipse(jx + 70, jy + jh, 220, 70);
  g.fillEllipse(jx + 200, jy + jh, 180, 50);
  g.fillStyle(0x8a5530, 1);
  g.fillRect(jx + jw / 2 - 4, jy, 8, jh);
  g.fillRect(jx, jy + jh / 2 - 4, jw, 8);
  g.fillStyle(0xe76f8a, 1);
  g.fillTriangle(jx - 20, jy - 16, jx + 70, jy - 16, jx - 20, jy + jh + 10);
  g.fillTriangle(jx + jw + 20, jy - 16, jx + jw - 70, jy - 16, jx + jw + 20, jy + jh + 10);
  // prateleira com potes (baixo contraste: não compete com os objetos do jogo)
  g.fillStyle(0xc98b55, 1);
  g.fillRect(960, 300, 300, 14);
  const potes = [0xf3c98b, 0xb8d8e8, 0xf2b5c4, 0xcfe3b4];
  potes.forEach((c, i) => {
    const x = 985 + i * 68;
    g.fillStyle(clarear(c, 0.2), 1);
    g.fillRoundedRect(x, 236, 46, 64, 10);
    g.fillStyle(escurecer(c, 0.15), 1);
    g.fillRect(x - 3, 230, 52, 12);
  });
  mesaDeMadeira(g);
  g.generateTexture(TEXTURAS.fundoCozinha, LARGURA, ALTURA);
  g.destroy();
}

function fundoForno(cena: Phaser.Scene): void {
  const g = cena.make.graphics({}, false);
  degrade(g, 0, 0, LARGURA, MESA_Y, 0xfde8d0, 0xf8d2ae);
  // azulejo metrô
  for (let y = 0; y < MESA_Y; y += 34) {
    for (let x = (y / 34) % 2 ? -36 : 0; x < LARGURA; x += 72) {
      g.fillStyle(0xffffff, 0.35);
      g.fillRoundedRect(x + 2, y + 2, 68, 30, 6);
    }
  }
  // coifa
  g.fillStyle(0xb9c3cc, 1);
  g.fillTriangle(380, 90, 900, 90, 640, 30);
  g.fillRect(560, 0, 160, 32);
  g.fillStyle(0x9aa4ad, 1);
  g.fillRect(360, 86, 560, 14);
  mesaDeMadeira(g);
  g.generateTexture(TEXTURAS.fundoForno, LARGURA, ALTURA);
  g.destroy();
}

function fundoConfeitar(cena: Phaser.Scene): void {
  const g = cena.make.graphics({}, false);
  degrade(g, 0, 0, LARGURA, MESA_Y, 0xffeef4, 0xfbd3e0);
  g.fillStyle(0xffffff, 0.45);
  for (let y = 20; y < MESA_Y; y += 50) for (let x = (y / 50) % 2 ? 50 : 25; x < LARGURA; x += 50) g.fillCircle(x, y, 5);
  // varal de bandeirinhas
  const cores = [0xe69f00, 0x56b4e9, 0x009e73, 0xf0e442, 0x0072b2, 0xd55e00, 0xcc79a7];
  g.lineStyle(3, 0x8a5530, 1);
  const pontos: { x: number; y: number }[] = [];
  for (let x = 0; x <= LARGURA; x += 20) pontos.push({ x, y: 150 + Math.sin((x / LARGURA) * Math.PI) * 40 });
  g.strokePoints(pontos, false);
  for (let i = 0, x = 30; x < LARGURA; x += 60, i++) {
    const y = 150 + Math.sin((x / LARGURA) * Math.PI) * 40;
    g.fillStyle(cores[i % cores.length]!, 1);
    g.fillTriangle(x - 20, y, x + 20, y, x, y + 40);
  }
  // toalha xadrez
  const h = ALTURA - MESA_Y;
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, MESA_Y, LARGURA, h);
  g.fillStyle(0xe76f8a, 0.45);
  for (let x = 0; x < LARGURA; x += 40) g.fillRect(x, MESA_Y, 20, h);
  for (let y = MESA_Y; y < ALTURA; y += 40) g.fillRect(0, y, LARGURA, 20);
  g.fillStyle(0xc2185b, 0.35);
  g.fillRect(0, MESA_Y, LARGURA, 8);
  g.generateTexture(TEXTURAS.fundoConfeitar, LARGURA, ALTURA);
  g.destroy();
}

function fundoMenu(cena: Phaser.Scene): void {
  const g = cena.make.graphics({}, false);
  degrade(g, 0, 0, LARGURA, ALTURA, 0xfff4e6, 0xffd9e4);
  // raios suaves
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const b = ((i + 0.5) / 18) * Math.PI * 2;
    g.fillStyle(0xffffff, 0.25);
    g.fillTriangle(LARGURA / 2, 330, LARGURA / 2 + Math.cos(a) * 1000, 330 + Math.sin(a) * 1000, LARGURA / 2 + Math.cos(b) * 1000, 330 + Math.sin(b) * 1000);
  }
  // granulado espalhado
  const cores = [0xe69f00, 0x56b4e9, 0x009e73, 0xf0e442, 0xcc79a7];
  for (let i = 0; i < 70; i++) {
    const x = (i * 197) % LARGURA, y = (i * 113) % ALTURA, r = i * 1.7;
    g.lineStyle(6, cores[i % cores.length]!, 0.55);
    g.lineBetween(x - Math.cos(r) * 8, y - Math.sin(r) * 8, x + Math.cos(r) * 8, y + Math.sin(r) * 8);
  }
  g.generateTexture(TEXTURAS.fundoMenu, LARGURA, ALTURA);
  g.destroy();
}

function pequenos(cena: Phaser.Scene): void {
  const g = cena.make.graphics({}, false);
  // sombra elíptica macia (128×40)
  for (let i = 10; i >= 1; i--) {
    g.fillStyle(0x3b2a20, 0.035 * (11 - i));
    g.fillEllipse(64, 20, 12.8 * i, 4 * i);
  }
  g.generateTexture(TEXTURAS.sombra, 128, 40);
  g.clear();

  // mão-fantasma (luva branca apontando), 80×100, ponta do dedo em (28, 6)
  g.fillStyle(0xffffff, 1);
  g.lineStyle(4, 0x6b5a4e, 1);
  g.fillRoundedRect(18, 4, 20, 56, 10);
  g.strokeRoundedRect(18, 4, 20, 56, 10);
  g.fillRoundedRect(14, 40, 56, 50, 18);
  g.strokeRoundedRect(14, 40, 56, 50, 18);
  g.fillRoundedRect(2, 52, 20, 30, 10);
  g.strokeRoundedRect(2, 52, 20, 30, 10);
  g.lineStyle(3, 0x6b5a4e, 0.6);
  g.lineBetween(40, 48, 40, 62);
  g.lineBetween(54, 48, 54, 62);
  g.generateTexture(TEXTURAS.mao, 80, 100);
  g.clear();

  // brilho (estrela de 4 pontas), 32×32
  g.fillStyle(0xffffff, 1);
  g.fillTriangle(16, 0, 20, 16, 12, 16);
  g.fillTriangle(16, 32, 20, 16, 12, 16);
  g.fillTriangle(0, 16, 16, 12, 16, 20);
  g.fillTriangle(32, 16, 16, 12, 16, 20);
  g.fillCircle(16, 16, 4);
  g.generateTexture(TEXTURAS.brilho, 32, 32);
  g.clear();

  // vapor (nuvenzinha), 48×40
  g.fillStyle(0xffffff, 0.9);
  g.fillCircle(16, 24, 12);
  g.fillCircle(30, 18, 14);
  g.fillCircle(36, 28, 10);
  g.generateTexture(TEXTURAS.vapor, 48, 40);
  g.clear();

  // pó (poeirinha de farinha), 24×24
  for (let r = 12; r > 0; r -= 2) {
    g.fillStyle(0xffffff, 0.12);
    g.fillCircle(12, 12, r);
  }
  g.generateTexture(TEXTURAS.po, 24, 24);
  g.destroy();
}

export function gerarArte(cena: Phaser.Scene): void {
  fundoCozinha(cena);
  fundoForno(cena);
  fundoConfeitar(cena);
  fundoMenu(cena);
  pequenos(cena);
}

/** Sombra macia sob um objeto (cosmético). */
export function sombra(cena: Phaser.Scene, x: number, y: number, largura: number, profundidade = 1): Phaser.GameObjects.Image {
  return cena.add.image(x, y, TEXTURAS.sombra).setDisplaySize(largura, largura * 0.3).setDepth(profundidade).setAlpha(0.9);
}
