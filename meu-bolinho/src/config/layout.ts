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
export const RECIPIENTE = { largura: 84, altura: 104, y: 540 } as const;
/** Faixa da mesa (x) reservada aos recipientes, à esquerda da tigela. */
export const FAIXA_RECIPIENTES = { x0: 100, x1: 475 } as const;
/** Prateleira de trás usada quando a receita tem mais de 4 recipientes. */
export const PRATELEIRA = { y: 400, tabuaY: 452 } as const;
export const MAX_RECIPIENTES = 8;

/**
 * Posições dos recipientes na mesa para n ingredientes (receitas data-driven):
 * até 4 numa fileira; de 5 a 8, fileira da frente + prateleira de trás.
 * Espaçamento sempre ≥ largura + 24 px (alvos de toque não se sobrepõem).
 */
export function posicoesRecipientes(n: number): { x: number; y: number }[] {
  if (n < 0 || n > MAX_RECIPIENTES) throw new Error(`receita com ${n} recipientes (máx. ${MAX_RECIPIENTES})`);
  const fileira = (qtd: number, y: number) =>
    Array.from({ length: qtd }, (_, i) => ({
      x: qtd === 1 ? (FAIXA_RECIPIENTES.x0 + FAIXA_RECIPIENTES.x1) / 2 : FAIXA_RECIPIENTES.x0 + (i * (FAIXA_RECIPIENTES.x1 - FAIXA_RECIPIENTES.x0)) / Math.max(3, qtd - 1),
      y,
    }));
  if (n <= 4) return fileira(n, RECIPIENTE.y);
  const frente = Math.ceil(n / 2);
  return [...fileira(frente, RECIPIENTE.y), ...fileira(n - frente, PRATELEIRA.y)];
}

export const PRATINHO_DESCARTE = { x: 1150, y: 545, raio: 60 } as const;
export const DESCANSO_COLHER = { x: 1150, y: 400 } as const;

/** Caixa de ovos na frente da mesa, à direita. */
export const CAIXA_OVOS = { x: 1040, y: 660, espaco: 72 } as const;
export const OVO = { largura: 52, altura: 66 } as const;

/** Estação da forma (untar / despejar massa), na Cozinha. */
export const FORMA = { cx: 830, cy: 470, rx: 175, ry: 112, rxInterno: 158, ryInterno: 98, parede: 42 } as const;
/** Onde a tigela descansa (escala reduzida) enquanto a forma está no centro. */
export const TIGELA_LATERAL = { x: 330, y: 400, escala: 0.6 } as const;

export const MASCOTE = { x: 1170, y: 130 } as const;
export const BOTAO_PAUSA = { x: 1236, y: 44, raio: 34, segurarMs: 2000 } as const;

/** Forno (cena Forno). */
export const FORNO = {
  x: 360, y: 110, largura: 560, altura: 470,
  porta: { x: 400, y: 190, largura: 380, altura: 350 },
  botao: { x: 850, y: 270, raio: 44, raioGesto: 90 },
  luz: { x: 850, y: 170 },
  /** Posição e escala da forma dentro do forno. */
  formaDentro: { x: 590, y: 430, escala: 0.62 },
} as const;
export const BANCADA_FORNO = { formaX: 1080, formaY: 600, escala: 0.5 } as const;
export const LUVA = { x: 1180, y: 330 } as const;
export const PRATO_DESENFORMAR = { x: 1130, y: 260 } as const;

/** Bolo na cena Confeitar. */
export const BOLO = { cx: 640, topoY: 360, rx: 215, ry: 88, alturaLateral: 110, pratoRx: 290, pratoRy: 92 } as const;
export const BANDEJA_Y = 650;
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
