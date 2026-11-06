/**
 * Física de despejar (pura).
 *
 * vazão(θ) = 0                                  se θ < anguloMin
 *          = vazaoMax · ((θ − min)/(max − min))^expoente   caso contrário
 *
 * Só sai conteúdo se o bico estiver sobre a boca do alvo e o recipiente não estiver vazio.
 */
import { VAZAO, type Material, type ParametrosVazao } from '../../config/gameplay';
import { clamp, grausParaRad, rotacionar, type Ponto } from '../../utils/math';

/** Vazão (xícaras/s) para um ângulo de inclinação em graus. */
export function vazaoPorAngulo(anguloGraus: number, p: ParametrosVazao): number {
  if (!Number.isFinite(anguloGraus) || anguloGraus < p.anguloMin) return 0;
  const t = clamp((anguloGraus - p.anguloMin) / (p.anguloMax - p.anguloMin), 0, 1);
  return p.vazaoMax * Math.pow(t, p.expoente);
}

export function vazaoDoMaterial(anguloGraus: number, material: Material): number {
  return vazaoPorAngulo(anguloGraus, VAZAO[material]);
}

/**
 * Posição do bico (canto superior direito) de um recipiente retangular centrado em
 * (cx, cy) e inclinado `anguloGraus` no sentido horário.
 */
export function posicaoBico(cx: number, cy: number, largura: number, altura: number, anguloGraus: number): Ponto {
  const local = rotacionar({ x: largura / 2, y: -altura / 2 }, grausParaRad(anguloGraus));
  return { x: cx + local.x, y: cy + local.y };
}

/** Boca de um recipiente-alvo (tigela, forma): faixa horizontal acima da borda. */
export interface BocaAlvo {
  cx: number;
  bordaY: number;
  /** Meia-largura útil da boca (px). */
  meiaLargura: number;
  /** Altura máxima acima da borda em que o bico ainda "mira" na boca (px). */
  alturaMax: number;
}

/** O conteúdo que sai do bico cai dentro do alvo? */
export function bicoSobreBoca(bico: Ponto, boca: BocaAlvo): boolean {
  return (
    Math.abs(bico.x - boca.cx) <= boca.meiaLargura &&
    bico.y <= boca.bordaY &&
    bico.y >= boca.bordaY - boca.alturaMax
  );
}

export interface EntradaDespejo {
  /** O dedo está segurando o recipiente agora. */
  segurando: boolean;
  anguloGraus: number;
  bicoSobreAlvo: boolean;
}

/**
 * Quantidade que sai neste intervalo. É ZERO se o dedo não estiver segurando:
 * não existe vazão "residual" — soltou, parou.
 */
export function quantidadeDespejada(
  entrada: EntradaDespejo,
  material: Material,
  disponivel: number,
  dtMs: number,
): number {
  if (!entrada.segurando || !entrada.bicoSobreAlvo || disponivel <= 0 || !(dtMs > 0)) return 0;
  const q = vazaoDoMaterial(entrada.anguloGraus, material) * (dtMs / 1000);
  return Math.min(q, disponivel);
}
