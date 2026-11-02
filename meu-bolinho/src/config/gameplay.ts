/**
 * Parâmetros de jogabilidade que NÃO variam por dificuldade.
 * (Os que variam ficam em src/data/difficulty.json.)
 */

/** Reconhecedor de rotação circular (mexer e, no futuro, timer do forno). */
export const CONFIG_MEXER = {
  /** Raio mínimo do anel válido, em fração do raio da tigela. */
  anelInterno: 0.3,
  /** Raio máximo do anel válido, em fração do raio da tigela. */
  anelExterno: 0.95,
  /** Velocidade angular mínima (rad/s). Abaixo disso o dedo é considerado parado. */
  velocidadeAngularMin: 0.6,
  /** Deltas angulares maiores que isto entre duas amostras são saltos e são descartados. */
  saltoMax: Math.PI / 2,
  /** Movimento mínimo (px) entre amostras avaliadas. Filtra tremor de dedo parado. */
  movimentoMinPx: 3,
  /** Quanto (rad) é preciso voltar para considerar inversão de sentido. */
  histerese: 0.35,
  /**
   * Um trecho contínuo num mesmo sentido só começa a contar após varrer este ângulo.
   * Qualquer segmento de reta visto do centro varre < π, então linha reta nunca conta.
   */
  limiarTrecho: Math.PI,
} as const;

export type ConfigMexer = typeof CONFIG_MEXER;

export type Material = 'po' | 'liquido' | 'massa';

export interface ParametrosVazao {
  /** Vazão máxima (unidades de xícara por segundo) a 90°. */
  vazaoMax: number;
  /** Abaixo deste ângulo (graus) nada sai. */
  anguloMin: number;
  /** Ângulo de vazão máxima (graus). */
  anguloMax: number;
  /** Curvatura da curva de vazão (>1 = controle fino perto do limiar). */
  expoente: number;
  /** Velocidade inicial das partículas (px/s) — massa viscosa cai mais devagar. */
  velocidadeParticula: number;
}

export const VAZAO: Record<Material, ParametrosVazao> = {
  po: { vazaoMax: 0.45, anguloMin: 25, anguloMax: 90, expoente: 1.5, velocidadeParticula: 60 },
  liquido: { vazaoMax: 0.6, anguloMin: 25, anguloMax: 90, expoente: 1.5, velocidadeParticula: 90 },
  massa: { vazaoMax: 0.2, anguloMin: 25, anguloMax: 90, expoente: 1.8, velocidadeParticula: 20 },
};

export const CONFIG_DESPEJAR = {
  /** Deslocamento horizontal do dedo (px) que corresponde a 90° de inclinação. */
  pxPara90Graus: 160,
  /** Recipiente começa com quantidade × este fator (permite errar para mais). */
  fatorCapacidade: 1.5,
  /** Recuar o dedo esta distância (px) para trás do ponto de entrada solta o recipiente da zona. */
  recuoParaSairPx: 50,
} as const;

export const CONFIG_ARRASTAR = {
  /** Rigidez do "atraso físico" do item seguindo o dedo. */
  lambdaSeguir: 18,
} as const;

/** Maior dt considerado por frame (ms): evita saltos após troca de aba. */
export const DT_MAX_MS = 50;
