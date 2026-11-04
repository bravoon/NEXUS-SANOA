/**
 * Trilha de fases (pura): a ordem vem de data/trilha.json; cada fase é uma receita.
 * - A fase 1 está sempre liberada; cada fase seguinte libera ao TERMINAR a anterior
 *   (qualquer modo, qualquer número de estrelas — nunca bloqueia por "nota").
 * - Guarda a melhor quantidade de estrelas de cada fase.
 * - "Novidade": mecânicas que aparecem pela primeira vez naquela fase (selo "Novo!").
 * - Receitas que não estão em trilha.json entram no fim (adicionar receita = só JSON).
 */
import type { ReceitaJson, TipoEtapa } from '../recipe/recipeTypes';
import type { Armazenamento } from '../save/Preferencias';

export type Mecanica = TipoEtapa | 'glace' | 'polvilhar';

export interface FaseTrilha {
  id: string;
  nome: string;
  corMassa: string;
  numero: number;
  liberada: boolean;
  concluida: boolean;
  estrelas: number;
  novidades: Mecanica[];
}

export type EstrelasPorFase = Record<string, number>;
export const CHAVE_TRILHA = 'meu-bolinho:trilha:v1';

export function mecanicasDa(r: ReceitaJson): Set<Mecanica> {
  const m = new Set<Mecanica>();
  for (const e of r.etapas) {
    m.add(e.tipo as TipoEtapa);
    if (e.tipo === 'decorar' && e.glace) m.add('glace');
    if (e.tipo === 'decorar' && e.polvilhar) m.add('polvilhar');
  }
  return m;
}

export function ordemDaTrilha(ordem: readonly string[], receitas: ReadonlyMap<string, ReceitaJson>): string[] {
  const conhecidas = ordem.filter((id) => receitas.has(id));
  const extras = [...receitas.keys()].filter((id) => !conhecidas.includes(id)).sort();
  return [...new Set([...conhecidas, ...extras])];
}

export function montarTrilha(
  ordem: readonly string[],
  receitas: ReadonlyMap<string, ReceitaJson>,
  estrelas: EstrelasPorFase,
  liberarTodas = false,
): FaseTrilha[] {
  const ids = ordemDaTrilha(ordem, receitas);
  const vistas = new Set<Mecanica>();
  const fases: FaseTrilha[] = [];
  ids.forEach((id, i) => {
    const r = receitas.get(id)!;
    const mec = mecanicasDa(r);
    const novidades = i === 0 ? [] : [...mec].filter((m) => !vistas.has(m));
    mec.forEach((m) => vistas.add(m));
    const e = Math.max(0, Math.min(3, Math.floor(estrelas[id] ?? 0)));
    const anterior = fases[i - 1];
    fases.push({
      id,
      nome: r.nome,
      corMassa: r.corMassa,
      numero: i + 1,
      liberada: liberarTodas || i === 0 || (anterior?.concluida ?? false),
      concluida: e > 0,
      estrelas: e,
      novidades,
    });
  });
  return fases;
}

/** Total de estrelas e máximo possível (para o placar da trilha). */
export function placar(fases: readonly FaseTrilha[]): { estrelas: number; maximo: number } {
  return { estrelas: fases.reduce((s, f) => s + f.estrelas, 0), maximo: fases.length * 3 };
}

export function carregarEstrelas(arm: Armazenamento | null): EstrelasPorFase {
  if (!arm) return {};
  try {
    const o = JSON.parse(arm.getItem(CHAVE_TRILHA) ?? '{}') as unknown;
    if (typeof o !== 'object' || o === null) return {};
    const out: EstrelasPorFase = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) if (typeof v === 'number' && v >= 0) out[k] = Math.min(3, Math.floor(v));
    return out;
  } catch {
    return {};
  }
}

/** Registra as estrelas de uma partida (guarda a melhor). Retorna as estrelas guardadas. */
export function registrarEstrelas(arm: Armazenamento | null, id: string, estrelas: number): EstrelasPorFase {
  const atual = carregarEstrelas(arm);
  atual[id] = Math.max(atual[id] ?? 0, Math.min(3, Math.max(1, Math.floor(estrelas))));
  try {
    arm?.setItem(CHAVE_TRILHA, JSON.stringify(atual));
  } catch {
    // armazenamento cheio/bloqueado: segue sem salvar
  }
  return atual;
}

/** Mundo da trilha (data/trilha.json): um grupo de fases com nome próprio. */
export interface MundoJson {
  nome: string;
  fases: string[];
}

export interface MundoTrilha {
  numero: number;
  nome: string;
  fases: FaseTrilha[];
  /** A primeira fase do mundo já está liberada. */
  aberto: boolean;
}

/** Ordem plana das fases (mundo 1, depois mundo 2...). */
export function ordemDosMundos(mundos: readonly MundoJson[]): string[] {
  return mundos.flatMap((m) => m.fases);
}

/**
 * Agrupa as fases montadas por mundo. Receitas fora de trilha.json (as "extras", que
 * `ordemDaTrilha` põe no fim) entram no último mundo.
 */
export function dividirEmMundos(fases: readonly FaseTrilha[], mundos: readonly MundoJson[]): MundoTrilha[] {
  const ids = new Map(fases.map((f) => [f.id, f]));
  const usados = new Set<string>();
  const out: MundoTrilha[] = mundos.map((m, i) => {
    const fs = m.fases.flatMap((id) => {
      const f = ids.get(id);
      if (!f || usados.has(id)) return [];
      usados.add(id);
      return [f];
    });
    return { numero: i + 1, nome: m.nome, fases: fs, aberto: fs[0]?.liberada ?? false };
  });
  const extras = fases.filter((f) => !usados.has(f.id));
  const ultimo = out[out.length - 1];
  if (extras.length) {
    if (ultimo) ultimo.fases.push(...extras);
    else out.push({ numero: 1, nome: 'Trilha', fases: [...extras], aberto: extras[0]!.liberada });
  }
  return out.filter((m) => m.fases.length > 0);
}

/** Mundo onde a criança está (o da primeira fase liberada ainda não concluída). */
export function mundoAtual(mundos: readonly MundoTrilha[]): number {
  const i = mundos.findIndex((m) => m.fases.some((f) => f.liberada && !f.concluida));
  if (i >= 0) return i;
  const ultimoAberto = mundos.map((m) => m.aberto).lastIndexOf(true);
  return Math.max(0, ultimoAberto);
}
