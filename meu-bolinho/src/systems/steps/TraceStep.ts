/**
 * Escrever com glacê: seguir um desenho pontilhado com o saco de confeitar. Puro.
 * O desenho vira pontos de controle a cada `espacamento` px; um ponto conta quando o
 * SEGMENTO entre duas amostras do dedo passa a até `tolerancia` px dele. Rabiscar fora do
 * desenho não conta; sem amostra, nada muda.
 *
 * REGRA: este arquivo não usa tweens nem timers (verificado por teste).
 */
import { CONFIG_GLACE } from '../../config/gameplay';
import type { DesenhoGlace } from '../recipe/recipeTypes';
import type { Ponto } from '../../utils/math';

/** Pontos (fechados ou não) de um desenho, em torno de (cx, cy) dentro de uma elipse rx × ry. */
export function gerarDesenho(desenho: DesenhoGlace, cx: number, cy: number, rx: number, ry: number): Ponto[] {
  const pts: Ponto[] = [];
  switch (desenho) {
    case 'circulo':
      for (let i = 0; i <= 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        pts.push({ x: cx + Math.cos(a) * rx * 0.55, y: cy + Math.sin(a) * ry * 0.55 });
      }
      break;
    case 'coracao':
      for (let i = 0; i <= 80; i++) {
        const t = (i / 80) * Math.PI * 2;
        const x = 16 * Math.sin(t) ** 3;
        const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        pts.push({ x: cx + (x / 17) * rx * 0.55, y: cy + (y / 17) * ry * 0.62 + ry * 0.05 });
      }
      break;
    case 'estrela':
      for (let i = 0; i <= 10; i++) {
        const r = i % 2 === 0 ? 0.62 : 0.27;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push({ x: cx + Math.cos(a) * rx * r, y: cy + Math.sin(a) * ry * r });
      }
      break;
    case 'onda':
      for (let i = 0; i <= 60; i++) {
        const k = i / 60;
        pts.push({ x: cx + (k - 0.5) * rx * 1.3, y: cy + Math.sin(k * Math.PI * 4) * ry * 0.28 });
      }
      break;
  }
  return pts;
}

/** Reamostra uma polilinha em pontos a cada `passo` px. */
export function reamostrar(pts: readonly Ponto[], passo: number): Ponto[] {
  const out: Ponto[] = [];
  if (pts.length === 0) return out;
  out.push({ ...pts[0]! });
  let resto = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    let d = passo - resto;
    while (d <= seg) {
      const k = d / seg;
      out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
      d += passo;
    }
    resto = seg - (d - passo);
  }
  return out;
}

function dist2Seg(p: Ponto, a: Ponto, b: Ponto): number {
  const vx = b.x - a.x, vy = b.y - a.y;
  const l2 = vx * vx + vy * vy;
  let t = l2 > 0 ? ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = p.x - (a.x + t * vx), dy = p.y - (a.y + t * vy);
  return dx * dx + dy * dy;
}

export class TraceStep {
  readonly pontos: readonly Ponto[];
  private readonly visitado: boolean[];
  private n = 0;
  private anterior: Ponto | null = null;

  constructor(
    caminho: readonly Ponto[],
    readonly tolerancia: number,
    readonly meta: number,
    espacamento: number = CONFIG_GLACE.espacamentoPx,
  ) {
    if (caminho.length < 2) throw new Error('desenho vazio');
    if (!(meta > 0 && meta <= 1)) throw new Error('meta deve estar em (0, 1]');
    this.pontos = reamostrar(caminho, espacamento);
    this.visitado = this.pontos.map(() => false);
  }

  /** Amostra do dedo. Retorna o segmento traçado (para desenhar o glacê). */
  tracar(x: number, y: number): { x0: number; y0: number; x1: number; y1: number } {
    const a = this.anterior ?? { x, y };
    const b = { x, y };
    this.anterior = b;
    const t2 = this.tolerancia * this.tolerancia;
    this.pontos.forEach((p, i) => {
      if (!this.visitado[i] && dist2Seg(p, a, b) <= t2) {
        this.visitado[i] = true;
        this.n++;
      }
    });
    return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
  }

  fimDoGesto(): void {
    this.anterior = null;
  }

  ehVisitado(i: number): boolean {
    return this.visitado[i] === true;
  }

  get fracao(): number {
    return this.n / this.pontos.length;
  }

  get progresso(): number {
    return Math.min(1, this.fracao / this.meta);
  }

  metaAtingida(): boolean {
    return this.fracao >= this.meta - 1e-9;
  }
}
