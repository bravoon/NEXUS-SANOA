/**
 * Geometria do que está no prato (pura): o topo de cada produto é uma união de "peças"
 * (elipses ou retângulos). A cobertura, o glacê, o polvilho e os enfeites só valem dentro das
 * peças; cada peça tem uma lateral de altura própria (o desenho fica com a cena).
 *
 * Biscoitos: as peças ficam ONDE a criança cortou (centros normalizados no disco da forma).
 */
import type { Retangulo } from '../coverage/CoverageGrid';
import type { Produto } from '../recipe/recipeTypes';
import type { Ponto } from '../../utils/math';

export interface Peca {
  tipo: 'elipse' | 'retangulo';
  cx: number;
  cy: number;
  /** Meia largura / meia altura do topo. */
  rx: number;
  ry: number;
}

export interface GeometriaProduto {
  produto: Produto;
  pecas: Peca[];
  /** Altura da lateral (px). */
  lateral: number;
  /** Centro de referência (enfeites relativos, desenho de glacê). */
  centro: Ponto;
  /** Raios da elipse que envolve o conjunto (glacê, fatias). */
  rx: number;
  ry: number;
}

/** Raio de um biscoito no disco normalizado da massa (cortador). */
export const RAIO_BISCOITO = 0.2;

/** Onde fica cada produto no prato (cena Confeitar). `centro` = centro do topo do bolo. */
export function geometriaDoProduto(produto: Produto, centro: Ponto, bolo: { rx: number; ry: number; alturaLateral: number }, biscoitos: readonly Ponto[] = []): GeometriaProduto {
  const { x, y } = centro;
  switch (produto) {
    case 'bolo':
      return { produto, centro, rx: bolo.rx, ry: bolo.ry, lateral: bolo.alturaLateral, pecas: [{ tipo: 'elipse', cx: x, cy: y, rx: bolo.rx, ry: bolo.ry }] };
    case 'torta': {
      const c = { x, y: y + 50 };
      return { produto, centro: c, rx: bolo.rx + 10, ry: bolo.ry + 4, lateral: 44, pecas: [{ tipo: 'elipse', cx: c.x, cy: c.y, rx: bolo.rx + 10, ry: bolo.ry + 4 }] };
    }
    case 'brownie': {
      const c = { x, y: y + 36 };
      return { produto, centro: c, rx: 215, ry: 84, lateral: 56, pecas: [{ tipo: 'retangulo', cx: c.x, cy: c.y, rx: 205, ry: 80 }] };
    }
    case 'cupcake': {
      const c = { x, y: y + 40 };
      const pecas: Peca[] = [];
      for (const [dx, dy] of [[-150, -55], [0, -55], [150, -55], [-150, 60], [0, 60], [150, 60]] as const)
        pecas.push({ tipo: 'elipse', cx: c.x + dx, cy: c.y + dy, rx: 62, ry: 28 });
      return { produto, centro: c, rx: 220, ry: 95, lateral: 60, pecas };
    }
    case 'biscoito': {
      const c = { x, y: y + 60 };
      const ex = 250, ey = 105;
      const pecas: Peca[] = biscoitos.map((b) => ({ tipo: 'elipse', cx: c.x + b.x * ex, cy: c.y + b.y * ey, rx: RAIO_BISCOITO * ex, ry: RAIO_BISCOITO * ey }));
      return { produto, centro: c, rx: ex, ry: ey, lateral: 12, pecas };
    }
  }
}

export function dentroDaPeca(p: Peca, x: number, y: number, margem = 1): boolean {
  const nx = (x - p.cx) / (p.rx * margem), ny = (y - p.cy) / (p.ry * margem);
  return p.tipo === 'elipse' ? nx * nx + ny * ny <= 1 : Math.abs(nx) <= 1 && Math.abs(ny) <= 1;
}

export function dentroDoProduto(g: GeometriaProduto, x: number, y: number, margem = 1): boolean {
  return g.pecas.some((p) => dentroDaPeca(p, x, y, margem));
}

/** Retângulo que contém todas as peças (superfície da grade de cobertura). */
export function caixaDoProduto(g: GeometriaProduto): Retangulo {
  if (g.pecas.length === 0) return { x: g.centro.x - g.rx, y: g.centro.y - g.ry, largura: g.rx * 2, altura: g.ry * 2 };
  const x0 = Math.min(...g.pecas.map((p) => p.cx - p.rx)), x1 = Math.max(...g.pecas.map((p) => p.cx + p.rx));
  const y0 = Math.min(...g.pecas.map((p) => p.cy - p.ry)), y1 = Math.max(...g.pecas.map((p) => p.cy + p.ry));
  return { x: x0, y: y0, largura: x1 - x0, altura: y1 - y0 };
}
