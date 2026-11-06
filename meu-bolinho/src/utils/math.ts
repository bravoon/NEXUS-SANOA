/** Utilitários matemáticos puros (sem Phaser), usados pelo núcleo testável. */

export const TAU = Math.PI * 2;

export interface Ponto {
  x: number;
  y: number;
}

/** Normaliza um ângulo para o intervalo [-π, π). */
export function normalizarAngulo(a: number): number {
  let r = (a + Math.PI) % TAU;
  if (r < 0) r += TAU;
  return r - Math.PI;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Interpolação exponencial independente de frame rate.
 * `lambda` maior = segue mais rápido. Usada no "atraso físico" do arrastar.
 */
export function amortecer(atual: number, alvo: number, lambda: number, dtSeg: number): number {
  return lerp(atual, alvo, 1 - Math.exp(-lambda * dtSeg));
}

export function distancia(a: Ponto, b: Ponto): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Interpolação suave de Hermite entre `borda0` e `borda1`. */
export function smoothstep(borda0: number, borda1: number, x: number): number {
  const t = clamp((x - borda0) / (borda1 - borda0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Rotaciona um ponto local (em torno da origem) por `anguloRad` no sentido horário da tela (y para baixo). */
export function rotacionar(p: Ponto, anguloRad: number): Ponto {
  const c = Math.cos(anguloRad);
  const s = Math.sin(anguloRad);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

export const grausParaRad = (g: number): number => (g * Math.PI) / 180;
