/** Helpers de desenho com Graphics (arte provisória do Milestone 1: só formas geométricas). */
import type Phaser from 'phaser';
import type { IngredienteDef } from '../systems/recipe/recipeTypes';

export function corHex(s: string): number {
  return Number.parseInt(s.replace('#', ''), 16);
}

/** Mistura duas cores RGB (t=0 → a, t=1 → b). */
export function misturarCor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

export const clarear = (c: number, t: number): number => misturarCor(c, 0xffffff, t);
export const escurecer = (c: number, t: number): number => misturarCor(c, 0x000000, t);

/**
 * Símbolo do ingrediente. Cada ingrediente tem forma E cor distintas:
 * a criança (e quem é daltônico) identifica pela forma, sem depender de leitura nem de cor.
 */
export function desenharSimbolo(
  g: Phaser.GameObjects.Graphics,
  simbolo: IngredienteDef['simbolo'],
  x: number,
  y: number,
  tam: number,
  cor: number,
): void {
  const h = tam / 2;
  g.fillStyle(cor, 1);
  g.lineStyle(3, escurecer(cor, 0.45), 1);
  switch (simbolo) {
    case 'quadrado':
      g.fillRect(x - h, y - h, tam, tam);
      g.strokeRect(x - h, y - h, tam, tam);
      break;
    case 'triangulo':
      g.fillTriangle(x, y - h, x + h, y + h, x - h, y + h);
      g.strokeTriangle(x, y - h, x + h, y + h, x - h, y + h);
      break;
    case 'gota': {
      g.fillCircle(x, y + h * 0.25, h * 0.75);
      g.fillTriangle(x, y - h, x + h * 0.65, y, x - h * 0.65, y);
      g.strokeCircle(x, y + h * 0.25, h * 0.75);
      break;
    }
    case 'estrela': {
      const pts: Phaser.Types.Math.Vector2Like[] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? h : h * 0.45;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
      }
      g.fillPoints(pts, true);
      g.strokePoints(pts, true);
      break;
    }
    case 'circulo':
      g.fillCircle(x, y, h);
      g.strokeCircle(x, y, h);
      break;
    case 'losango': {
      const pts = [
        { x, y: y - h },
        { x: x + h * 0.75, y },
        { x, y: y + h },
        { x: x - h * 0.75, y },
      ];
      g.fillPoints(pts, true);
      g.strokePoints(pts, true);
      break;
    }
    default: {
      // Exaustividade: um símbolo novo em IngredienteDef sem desenho aqui é erro de compilação.
      const nunca: never = simbolo;
      throw new Error(`símbolo sem desenho: ${String(nunca)}`);
    }
  }
}

/** Seta circular (ícone de "mexer"). */
export function desenharSetaCircular(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  raio: number,
  cor: number,
  espessura = 6,
): void {
  g.lineStyle(espessura, cor, 1);
  g.beginPath();
  g.arc(x, y, raio, -Math.PI * 0.1, Math.PI * 1.55, false);
  g.strokePath();
  const a = Math.PI * 1.55;
  const px = x + Math.cos(a) * raio;
  const py = y + Math.sin(a) * raio;
  const t = espessura * 1.6;
  g.fillStyle(cor, 1);
  g.fillTriangle(px - t, py - t * 0.2, px + t, py - t * 0.2, px + t * 0.2, py + t * 1.4);
}
