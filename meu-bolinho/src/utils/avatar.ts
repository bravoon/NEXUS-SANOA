/** Avatares dos perfis: rostinhos de bicho desenhados com formas (sem imagem, sem texto). */
import type Phaser from 'phaser';
import type { Avatar } from '../systems/save/Perfis';
import { escurecer } from './desenho';

/** Cor de fundo de cada avatar (forma E cor distintas, como nos ingredientes). */
export const COR_AVATAR: Record<Avatar, number> = {
  coelho: 0xf8bbd0,
  gato: 0xffd28a,
  urso: 0xc8a27a,
  panda: 0xd8e6ee,
  raposa: 0xffb27a,
  sapo: 0xb7e4a0,
  pinguim: 0xa8d4f0,
  leao: 0xf6d36b,
};

/** Desenha o avatar centrado em (x, y) com raio `r` (o rosto ocupa o círculo). */
export function desenharAvatar(g: Phaser.GameObjects.Graphics, a: Avatar, x: number, y: number, r: number): void {
  const fundo = COR_AVATAR[a];
  g.fillStyle(fundo, 1);
  g.fillCircle(x, y, r);
  g.lineStyle(Math.max(3, r * 0.06), escurecer(fundo, 0.35), 1);
  g.strokeCircle(x, y, r);
  const k = r / 70; // desenhado para r = 70
  const P = (dx: number, dy: number) => ({ x: x + dx * k, y: y + dy * k });
  const circ = (dx: number, dy: number, rr: number, cor: number) => {
    g.fillStyle(cor, 1);
    g.fillCircle(x + dx * k, y + dy * k, rr * k);
  };
  const elip = (dx: number, dy: number, w: number, h: number, cor: number) => {
    g.fillStyle(cor, 1);
    g.fillEllipse(x + dx * k, y + dy * k, w * k, h * k);
  };
  const tri = (a1: [number, number], a2: [number, number], a3: [number, number], cor: number) => {
    g.fillStyle(cor, 1);
    const p1 = P(...a1), p2 = P(...a2), p3 = P(...a3);
    g.fillTriangle(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
  };
  let pele = 0xffffff;
  switch (a) {
    case 'coelho':
      pele = 0xfdf6f0;
      elip(-20, -48, 22, 60, pele);
      elip(20, -48, 22, 60, pele);
      elip(-20, -46, 10, 42, 0xf4a6c0);
      elip(20, -46, 10, 42, 0xf4a6c0);
      circ(0, 10, 40, pele);
      break;
    case 'gato':
      pele = 0xf2a65a;
      tri([-40, -10], [-30, -52], [-8, -30], pele);
      tri([40, -10], [30, -52], [8, -30], pele);
      circ(0, 8, 42, pele);
      g.lineStyle(2 * k, 0x6b3e26, 1);
      for (const s of [-1, 1]) {
        g.lineBetween(x + s * 14 * k, y + 22 * k, x + s * 40 * k, y + 16 * k);
        g.lineBetween(x + s * 14 * k, y + 26 * k, x + s * 40 * k, y + 28 * k);
      }
      break;
    case 'urso':
      pele = 0x9c6b43;
      circ(-32, -30, 16, pele);
      circ(32, -30, 16, pele);
      circ(-32, -30, 8, 0xd9b08c);
      circ(32, -30, 8, 0xd9b08c);
      circ(0, 6, 42, pele);
      elip(0, 22, 38, 26, 0xd9b08c);
      break;
    case 'panda':
      pele = 0xffffff;
      circ(-32, -30, 15, 0x2f2a28);
      circ(32, -30, 15, 0x2f2a28);
      circ(0, 6, 42, pele);
      elip(-16, 0, 20, 26, 0x2f2a28);
      elip(16, 0, 20, 26, 0x2f2a28);
      break;
    case 'raposa':
      pele = 0xe8742c;
      tri([-42, -6], [-34, -54], [-6, -28], pele);
      tri([42, -6], [34, -54], [6, -28], pele);
      circ(0, 6, 40, pele);
      tri([-40, 10], [40, 10], [0, 46], 0xfff4ea);
      break;
    case 'sapo':
      pele = 0x5cb85c;
      circ(-22, -28, 17, pele);
      circ(22, -28, 17, pele);
      elip(0, 12, 92, 66, pele);
      circ(-22, -28, 11, 0xffffff);
      circ(22, -28, 11, 0xffffff);
      break;
    case 'pinguim':
      pele = 0x2f3b4a;
      circ(0, 6, 44, pele);
      elip(0, 16, 62, 60, 0xffffff);
      break;
    case 'leao':
      pele = 0xf2c14e;
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2;
        circ(Math.cos(ang) * 40, 6 + Math.sin(ang) * 40, 15, 0xc8742a);
      }
      circ(0, 6, 38, pele);
      break;
  }
  // olhos e boca (comuns), com variações
  const olhoY = a === 'sapo' ? -28 : a === 'panda' ? 0 : -2;
  const olhoX = a === 'sapo' ? 22 : 15;
  circ(-olhoX, olhoY, 6, a === 'panda' ? 0xffffff : 0x2f2a28);
  circ(olhoX, olhoY, 6, a === 'panda' ? 0xffffff : 0x2f2a28);
  if (a === 'panda') {
    circ(-olhoX, olhoY, 3.5, 0x2f2a28);
    circ(olhoX, olhoY, 3.5, 0x2f2a28);
  }
  circ(-olhoX + 2, olhoY - 2, 2, 0xffffff);
  circ(olhoX + 2, olhoY - 2, 2, 0xffffff);
  if (a === 'pinguim') tri([-9, 12], [9, 12], [0, 24], 0xf5a623);
  else if (a !== 'sapo') elip(0, 14, a === 'urso' ? 14 : 10, a === 'urso' ? 10 : 7, a === 'coelho' || a === 'gato' ? 0xf4769a : 0x2f2a28);
  g.lineStyle(3 * k, 0x2f2a28, 1);
  g.beginPath();
  g.arc(x, y + (a === 'sapo' ? 14 : 22) * k, (a === 'sapo' ? 20 : 9) * k, 0.15 * Math.PI, 0.85 * Math.PI, false);
  g.strokePath();
  // bochechas
  circ(-26, 20, 6, 0xff9fb5);
  circ(26, 20, 6, 0xff9fb5);
}
