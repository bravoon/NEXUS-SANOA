/**
 * Galeria de bolos e progresso por receita, em localStorage (só neste aparelho).
 * Puro: o armazenamento é injetado (testável; o jogo usa armazenamentoLocal()).
 *
 * - Bolo novo entra no início; a galeria guarda no máximo MAX_BOLOS (os mais antigos saem).
 * - Se o navegador recusar por falta de espaço, remove os mais antigos até caber.
 * - Leitura tolerante: entradas inválidas são ignoradas; JSON corrompido = galeria vazia.
 */
import type { Dificuldade } from '../recipe/recipeTypes';
import type { Armazenamento } from './Preferencias';

export const CHAVE_GALERIA = 'meu-bolinho:galeria:v1';
export const CHAVE_PROGRESSO = 'meu-bolinho:progresso:v1';
export const MAX_BOLOS = 30;

export interface BoloSalvo {
  id: string;
  receitaId: string;
  nomeReceita: string;
  dificuldade: Dificuldade;
  /** ISO 8601. */
  criadoEm: string;
  /** Foto JPEG em data URL. */
  foto: string;
  enfeites: number;
}

export type Progresso = Record<string, Record<Dificuldade, number>>;

function ehBolo(o: unknown): o is BoloSalvo {
  if (typeof o !== 'object' || o === null) return false;
  const b = o as Record<string, unknown>;
  return (
    typeof b['id'] === 'string' &&
    typeof b['receitaId'] === 'string' &&
    typeof b['nomeReceita'] === 'string' &&
    (b['dificuldade'] === 'facil' || b['dificuldade'] === 'confeiteiro') &&
    typeof b['criadoEm'] === 'string' &&
    typeof b['foto'] === 'string' &&
    b['foto'].startsWith('data:image/') &&
    typeof b['enfeites'] === 'number'
  );
}

function ler<T>(arm: Armazenamento | null, chave: string): T | null {
  if (!arm) return null;
  try {
    const bruto = arm.getItem(chave);
    return bruto ? (JSON.parse(bruto) as T) : null;
  } catch {
    return null;
  }
}

export function carregarGaleria(arm: Armazenamento | null): BoloSalvo[] {
  const dados = ler<unknown>(arm, CHAVE_GALERIA);
  return Array.isArray(dados) ? dados.filter(ehBolo).slice(0, MAX_BOLOS) : [];
}

function gravarGaleria(arm: Armazenamento, bolos: BoloSalvo[]): boolean {
  try {
    arm.setItem(CHAVE_GALERIA, JSON.stringify(bolos));
    return true;
  } catch {
    return false;
  }
}

export interface ResultadoSalvar {
  ok: boolean;
  /** Bolos antigos removidos para abrir espaço. */
  removidos: number;
}

export function salvarBolo(arm: Armazenamento | null, bolo: BoloSalvo): ResultadoSalvar {
  if (!arm || !ehBolo(bolo)) return { ok: false, removidos: 0 };
  const atuais = carregarGaleria(arm).filter((b) => b.id !== bolo.id);
  let lista = [bolo, ...atuais];
  let removidos = Math.max(0, lista.length - MAX_BOLOS);
  lista = lista.slice(0, MAX_BOLOS);
  while (!gravarGaleria(arm, lista)) {
    if (lista.length <= 1) return { ok: false, removidos };
    lista = lista.slice(0, -1);
    removidos++;
  }
  return { ok: true, removidos };
}

export function removerBolo(arm: Armazenamento | null, id: string): boolean {
  if (!arm) return false;
  const lista = carregarGaleria(arm);
  const nova = lista.filter((b) => b.id !== id);
  return nova.length !== lista.length && gravarGaleria(arm, nova);
}

export function carregarProgresso(arm: Armazenamento | null): Progresso {
  const dados = ler<Record<string, unknown>>(arm, CHAVE_PROGRESSO);
  const p: Progresso = {};
  if (!dados || typeof dados !== 'object') return p;
  for (const [id, v] of Object.entries(dados)) {
    if (typeof v !== 'object' || v === null) continue;
    const r = v as Record<string, unknown>;
    const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);
    p[id] = { facil: n(r['facil']), confeiteiro: n(r['confeiteiro']) };
  }
  return p;
}

export function registrarConclusao(arm: Armazenamento | null, receitaId: string, d: Dificuldade): Progresso {
  const p = carregarProgresso(arm);
  const r = (p[receitaId] ??= { facil: 0, confeiteiro: 0 });
  r[d]++;
  try {
    arm?.setItem(CHAVE_PROGRESSO, JSON.stringify(p));
  } catch {
    // sem espaço: o progresso desta vez não fica salvo; o jogo segue normalmente
  }
  return p;
}
