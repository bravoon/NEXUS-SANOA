/**
 * Cobertura por grade de amostragem (pura). Em vez de ler pixels, a superfície é dividida em
 * colunas × linhas células; uma pincelada marca as células cujo centro está a ≤ raio do
 * SEGMENTO entre duas amostras (assim pinceladas rápidas não deixam buracos).
 * Só contam células "válidas" (centro dentro da máscara da superfície, ex.: elipse da forma).
 */
export interface Retangulo {
  x: number;
  y: number;
  largura: number;
  altura: number;
}

export type Mascara = (x: number, y: number) => boolean;

/** Máscara elíptica inscrita no retângulo. */
export function mascaraElipse(r: Retangulo): Mascara {
  const cx = r.x + r.largura / 2;
  const cy = r.y + r.altura / 2;
  const rx = r.largura / 2;
  const ry = r.altura / 2;
  return (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
}

/** Distância² de p ao segmento ab. */
function dist2Segmento(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax, vy = by - ay;
  const l2 = vx * vx + vy * vy;
  let t = l2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - (ax + t * vx), dy = py - (ay + t * vy);
  return dx * dx + dy * dy;
}

export class CoverageGrid {
  private readonly pintada: Uint8Array;
  private readonly valida: Uint8Array;
  private readonly totalValidas: number;
  private pintadas = 0;
  readonly larguraCelula: number;
  readonly alturaCelula: number;

  constructor(
    readonly area: Retangulo,
    readonly colunas: number,
    readonly linhas: number,
    mascara: Mascara = () => true,
  ) {
    if (!(colunas > 0 && linhas > 0)) throw new Error('grade inválida');
    this.larguraCelula = area.largura / colunas;
    this.alturaCelula = area.altura / linhas;
    this.pintada = new Uint8Array(colunas * linhas);
    this.valida = new Uint8Array(colunas * linhas);
    let n = 0;
    for (let l = 0; l < linhas; l++) {
      for (let c = 0; c < colunas; c++) {
        const { x, y } = this.centro(c, l);
        if (mascara(x, y)) {
          this.valida[l * colunas + c] = 1;
          n++;
        }
      }
    }
    this.totalValidas = n;
  }

  centro(c: number, l: number): { x: number; y: number } {
    return {
      x: this.area.x + (c + 0.5) * this.larguraCelula,
      y: this.area.y + (l + 0.5) * this.alturaCelula,
    };
  }

  /** Pinta o segmento (x0,y0)→(x1,y1) com o raio dado. Retorna quantas células novas foram cobertas. */
  pintarSegmento(x0: number, y0: number, x1: number, y1: number, raio: number): number {
    const r2 = raio * raio;
    const minC = Math.max(0, Math.floor((Math.min(x0, x1) - raio - this.area.x) / this.larguraCelula));
    const maxC = Math.min(this.colunas - 1, Math.floor((Math.max(x0, x1) + raio - this.area.x) / this.larguraCelula));
    const minL = Math.max(0, Math.floor((Math.min(y0, y1) - raio - this.area.y) / this.alturaCelula));
    const maxL = Math.min(this.linhas - 1, Math.floor((Math.max(y0, y1) + raio - this.area.y) / this.alturaCelula));
    let novas = 0;
    for (let l = minL; l <= maxL; l++) {
      for (let c = minC; c <= maxC; c++) {
        const i = l * this.colunas + c;
        if (!this.valida[i] || this.pintada[i]) continue;
        const { x, y } = this.centro(c, l);
        if (dist2Segmento(x, y, x0, y0, x1, y1) <= r2) {
          this.pintada[i] = 1;
          novas++;
        }
      }
    }
    this.pintadas += novas;
    return novas;
  }

  pintarPonto(x: number, y: number, raio: number): number {
    return this.pintarSegmento(x, y, x, y, raio);
  }

  /** Fração coberta (0..1) das células válidas. */
  get razao(): number {
    return this.totalValidas === 0 ? 0 : this.pintadas / this.totalValidas;
  }

  get celulasValidas(): number {
    return this.totalValidas;
  }

  estaPintada(c: number, l: number): boolean {
    return this.pintada[l * this.colunas + c] === 1;
  }

  ehValida(c: number, l: number): boolean {
    return this.valida[l * this.colunas + c] === 1;
  }
}
