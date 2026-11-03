/**
 * Preferências da área dos pais, salvas em localStorage (só neste aparelho; nada sai dele).
 * Leitura tolerante: dado ausente, corrompido ou storage bloqueado → valores padrão.
 */
export interface Preferencias {
  volumeGeral: number;
  volumeMusica: number;
  volumeEfeitos: number;
  narracao: boolean;
  musica: boolean;
  /** Área dos pais: todas as fases da trilha liberadas. */
  liberarFases: boolean;
}

export const PREFERENCIAS_PADRAO: Readonly<Preferencias> = {
  volumeGeral: 0.8,
  volumeMusica: 0.35,
  volumeEfeitos: 0.8,
  narracao: true,
  musica: true,
  liberarFases: false,
};

export interface Armazenamento {
  getItem(chave: string): string | null;
  setItem(chave: string, valor: string): void;
}

export const CHAVE_PREFERENCIAS = 'meu-bolinho:preferencias:v1';

const volume = (v: unknown, padrao: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : padrao;
const booleano = (v: unknown, padrao: boolean): boolean => (typeof v === 'boolean' ? v : padrao);

export function carregarPreferencias(armazenamento: Armazenamento | null): Preferencias {
  const p = { ...PREFERENCIAS_PADRAO };
  if (!armazenamento) return p;
  try {
    const bruto = armazenamento.getItem(CHAVE_PREFERENCIAS);
    if (!bruto) return p;
    const o = JSON.parse(bruto) as Record<string, unknown>;
    if (typeof o !== 'object' || o === null) return p;
    return {
      volumeGeral: volume(o['volumeGeral'], p.volumeGeral),
      volumeMusica: volume(o['volumeMusica'], p.volumeMusica),
      volumeEfeitos: volume(o['volumeEfeitos'], p.volumeEfeitos),
      narracao: booleano(o['narracao'], p.narracao),
      musica: booleano(o['musica'], p.musica),
      liberarFases: booleano(o['liberarFases'], p.liberarFases),
    };
  } catch {
    return p;
  }
}

/** Salva; retorna false se o storage recusar (modo privado, cota). O jogo segue funcionando. */
export function salvarPreferencias(armazenamento: Armazenamento | null, p: Preferencias): boolean {
  if (!armazenamento) return false;
  try {
    armazenamento.setItem(CHAVE_PREFERENCIAS, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

/** localStorage do navegador, ou null quando indisponível/bloqueado. */
export function armazenamentoLocal(): Armazenamento | null {
  try {
    const ls = globalThis.localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}
