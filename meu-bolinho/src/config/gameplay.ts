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
  massa: { vazaoMax: 0.3, anguloMin: 25, anguloMax: 90, expoente: 1.8, velocidadeParticula: 20 },
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

/** Quebrar ovo. */
export const CONFIG_OVO = {
  /** Toques mais próximos que isto (ms) são ignorados. */
  cooldownMs: 300,
  /** Probabilidade de cair casca por ovo (só quando a dificuldade tem cascaDeOvo). */
  chanceCasca: 0.5,
  /** Quantidade (xícaras) que cada ovo acrescenta à tigela. */
  volumePorOvo: 0.25,
} as const;

/** Cobertura (untar, cobrir o bolo). */
export const CONFIG_COBERTURA = {
  /** Grade de amostragem (colunas × linhas). */
  colunas: 32,
  linhas: 32,
  /** Raio do pincel (px lógicos). */
  raioPincelUntar: 26,
  raioPincelCobertura: 30,
} as const;

/** Despejar a massa na forma. */
export const CONFIG_DESPEJAR_MASSA = {
  /** A tigela precisa ficar abaixo desta fração do conteúdo inicial. */
  restanteMax: 0.05,
} as const;

/** Forno. */
export const CONFIG_FORNO = {
  tempoMinSeg: 15,
  tempoMaxSeg: 25,
  tempoPadraoSeg: 20,
  /** Fração de 1 volta do botão do timer necessária para ligar. */
  voltaTimer: 0.98,
} as const;

/** Swipe de desenformar. */
export const CONFIG_SWIPE = {
  distanciaMinPx: 150,
  /** Velocidade média mínima (px/ms) do trecho para baixo. */
  velocidadeMin: 0.6,
  /** Desvio horizontal máximo em fração do deslocamento vertical. */
  desvioMax: 0.6,
} as const;

/** Sacudir (granulado). */
export const CONFIG_SACUDIR = {
  janelaMs: 600,
  /** |vx| mínimo (px/ms) para contar uma inversão. */
  velocidadeMin: 0.8,
  inversoesPorPorcao: 3,
} as const;

/** Decoração. */
export const CONFIG_DECORACAO = {
  maxItens: 120,
  granulosPorPorcao: 10,
} as const;

/** Bater claras (batedor em vai e vem). */
export const CONFIG_BATER = {
  /** Um movimento (de uma ponta à outra) precisa ter pelo menos isto (px). */
  amplitudeMin: 40,
  /** Velocidade média mínima do movimento (px/ms): devagar demais não "bate". */
  velocidadeMin: 0.35,
  /** Duas batidas não contam em menos de (ms): evita contar 2× um traço na diagonal. */
  intervaloMinMs: 110,
} as const;

/** Rechear: tolerância (px) para assentar a camada de cima sobre a de baixo. */
export const CONFIG_RECHEAR = {
  toleranciaCamadaPx: 36,
} as const;

/** Escrever com glacê: espaçamento (px) dos pontos de controle do desenho. */
/** Peneira: sacudir de lado a lado com a peneira sobre a tigela. */
export const CONFIG_PENEIRAR = {
  janelaMs: 700,
  velocidadeMin: 0.45,
  /** Inversões de sentido para uma "sacudida" (uma porção cai). */
  inversoesPorPorcao: 2,
} as const;

/** Ralador: vai e vem VERTICAL do pedaço sobre a face do ralador. */
export const CONFIG_RALAR = {
  amplitudeMin: 30,
  velocidadeMin: 0.25,
  intervaloMinMs: 120,
} as const;

/** Rolo de massa: passadas amplas (qualquer direção) em cima da massa. */
export const CONFIG_ROLO = {
  amplitudeMin: 60,
  velocidadeMin: 0.25,
  intervaloMinMs: 150,
} as const;

/** Polvilhador: cada sacudida sobre o bolo carimba um círculo de polvilho. */
export const CONFIG_POLVILHAR = {
  janelaMs: 700,
  velocidadeMin: 0.45,
  inversoesPorPorcao: 2,
  /** Raio do círculo polvilhado por sacudida (px). */
  raioPx: 46,
  /** O polvilho cai um pouco abaixo do polvilhador (px). */
  quedaPx: 70,
} as const;

export const CONFIG_GLACE = {
  espacamentoPx: 10,
  raioTracoPx: 7,
} as const;
