/** Botões grandes reutilizáveis (alvo ≥ 64 px, rótulo com ícone). */
import Phaser from 'phaser';
import { CORES } from '../config/layout';
import { escurecer } from '../utils/desenho';

export function botaoGrande(
  cena: Phaser.Scene,
  x: number,
  y: number,
  rotulo: string,
  cor: number,
  aoTocar: () => void,
  largura = 300,
  altura = 88,
): Phaser.GameObjects.Container {
  const c = cena.add.container(x, y).setDepth(100);
  const g = cena.add.graphics();
  g.fillStyle(cor, 1);
  g.fillRoundedRect(-largura / 2, -altura / 2, largura, altura, altura / 2);
  g.lineStyle(5, escurecer(cor, 0.4), 1);
  g.strokeRoundedRect(-largura / 2, -altura / 2, largura, altura, altura / 2);
  const t = cena.add
    .text(0, 0, rotulo, { fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif', fontSize: '36px', color: '#ffffff', fontStyle: 'bold', stroke: escurecerCss(cor), strokeThickness: 4 })
    .setOrigin(0.5);
  c.add([g, t]);
  c.setSize(largura, altura).setInteractive({ useHandCursor: true });
  c.on('pointerdown', () => c.setScale(0.95));
  c.on('pointerout', () => c.setScale(1));
  c.on('pointerup', () => {
    c.setScale(1);
    aoTocar();
  });
  return c;
}

function escurecerCss(cor: number): string {
  return `#${escurecer(cor, 0.5).toString(16).padStart(6, '0')}`;
}

export const ESTILO_TITULO: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
  fontSize: '72px',
  color: '#3b2a20',
  fontStyle: 'bold',
};

export const COR_TEXTO = CORES.texto;
