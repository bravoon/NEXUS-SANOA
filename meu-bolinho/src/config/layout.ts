/** Layout lógico (1280×720). O Scale Manager (FIT) adapta à tela real. */

export const LARGURA = 1280;
export const ALTURA = 720;

/** Tamanho mínimo de alvo de toque (px lógicos). */
export const ALVO_TOQUE_MIN = 64;

export const TIGELA = {
  cx: 760,
  bordaY: 430,
  raio: 180,
  /** Achatamento da elipse da borda (perspectiva). */
  achatamento: 0.4,
  profundidade: 200,
  /** Capacidade em "xícaras" que enche a tigela até 85% da profundidade. */
  capacidade: 4,
} as const;

/** Área de gesto do mexer: elipse um pouco maior que a boca, tolerante a dedos infantis. */
export const AREA_MEXER = {
  cx: TIGELA.cx,
  cy: TIGELA.bordaY + 20,
  rx: TIGELA.raio,
  ry: TIGELA.raio * 0.65,
} as const;

export const MESA_Y = 600;
export const POSICOES_RECIPIENTES = [100, 225, 350, 475] as const;
export const RECIPIENTE = { largura: 84, altura: 104, y: 540 } as const;

export const PRATINHO_DESCARTE = { x: 1060, y: 610, raio: 60 } as const;
export const DESCANSO_COLHER = { x: 1060, y: 470 } as const;

export const MASCOTE = { x: 1180, y: 120 } as const;
export const BARRA_MEXER = { x: 580, y: 180, largura: 360, altura: 36 } as const;

/** Paleta inspirada em Okabe-Ito (segura para daltonismo) + tons de cozinha. */
export const CORES = {
  fundo: 0xfff4e6,
  parede: 0xfde2c4,
  mesa: 0xc98b55,
  mesaBorda: 0x9c6438,
  vidro: 0xcfe8f7,
  vidroBorda: 0x5a8db0,
  texto: 0x3b2a20,
  sucesso: 0x009e73,
  alerta: 0xd55e00,
  destaque: 0xf0e442,
  barraFundo: 0xe9d8c4,
  pendente: 0x9ad6c0,
} as const;
