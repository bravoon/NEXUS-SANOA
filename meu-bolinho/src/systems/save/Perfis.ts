/**
 * Perfis de jogador ("Quem vai jogar?"), só neste aparelho: sem senha, sem e-mail, sem
 * internet. Cada perfil é um avatar + um nome opcional; a trilha (estrelas), a galeria e o
 * progresso ficam separados por perfil. As preferências da área dos pais são do aparelho.
 *
 * Puro: o armazenamento é injetado (testável). Leitura tolerante: dado corrompido → sem perfis.
 *
 * Como os dados ficam separados: `armazenamentoDoPerfil` embrulha o armazenamento e acrescenta
 * `@<id do perfil>` às chaves do jogador (galeria, progresso, trilha). As cenas não sabem disso.
 * Migração: o primeiro perfil criado herda os dados de antes dos perfis (chaves sem sufixo).
 */
import { CHAVE_GALERIA, CHAVE_PROGRESSO } from './Galeria';
import { armazenamentoLocal, type Armazenamento } from './Preferencias';
import { CHAVE_TRILHA } from '../progresso/Trilha';

export const CHAVE_PERFIS = 'meu-bolinho:perfis:v1';
export const MAX_PERFIS = 6;
export const MAX_NOME = 10;

export type Avatar = 'coelho' | 'gato' | 'urso' | 'panda' | 'raposa' | 'sapo' | 'pinguim' | 'leao';
export const AVATARES: readonly Avatar[] = ['coelho', 'gato', 'urso', 'panda', 'raposa', 'sapo', 'pinguim', 'leao'];
export const NOME_AVATAR: Record<Avatar, string> = {
  coelho: 'Coelhinho',
  gato: 'Gatinho',
  urso: 'Ursinho',
  panda: 'Pandinha',
  raposa: 'Raposinha',
  sapo: 'Sapinho',
  pinguim: 'Pinguinho',
  leao: 'Leãozinho',
};

export interface Perfil {
  id: string;
  /** Nome escolhido (pode ser vazio: aí aparece o nome do avatar). */
  nome: string;
  avatar: Avatar;
  /** ISO 8601. */
  criadoEm: string;
}

export interface DadosPerfis {
  perfis: Perfil[];
  /** Perfil jogando agora (null = ninguém escolhido ainda). */
  atual: string | null;
}

/** Chaves que pertencem ao jogador (o resto, como as preferências, é do aparelho). */
export const CHAVES_DO_JOGADOR: readonly string[] = [CHAVE_GALERIA, CHAVE_PROGRESSO, CHAVE_TRILHA];

export function nomeExibido(p: Perfil): string {
  return p.nome.trim() || NOME_AVATAR[p.avatar];
}

/** Nome digitado → nome guardado: só letras (com acento), espaço e hífen; no máximo MAX_NOME. */
export function limparNome(nome: string): string {
  return nome
    .replace(/[^\p{L} -]/gu, '')
    .replace(/\s+/g, ' ')
    .trimStart()
    .slice(0, MAX_NOME);
}

function ehPerfil(o: unknown): o is Perfil {
  if (typeof o !== 'object' || o === null) return false;
  const p = o as Record<string, unknown>;
  return (
    typeof p['id'] === 'string' &&
    p['id'].length > 0 &&
    typeof p['nome'] === 'string' &&
    AVATARES.includes(p['avatar'] as Avatar) &&
    typeof p['criadoEm'] === 'string'
  );
}

export function carregarPerfis(arm: Armazenamento | null): DadosPerfis {
  const vazio: DadosPerfis = { perfis: [], atual: null };
  if (!arm) return vazio;
  try {
    const o = JSON.parse(arm.getItem(CHAVE_PERFIS) ?? 'null') as unknown;
    if (typeof o !== 'object' || o === null) return vazio;
    const d = o as Record<string, unknown>;
    const perfis = Array.isArray(d['perfis']) ? d['perfis'].filter(ehPerfil).slice(0, MAX_PERFIS) : [];
    const ids = new Set<string>();
    const unicos = perfis.filter((p) => !ids.has(p.id) && ids.add(p.id));
    const atual = typeof d['atual'] === 'string' && ids.has(d['atual']) ? d['atual'] : null;
    return { perfis: unicos.map((p) => ({ ...p, nome: limparNome(p.nome) })), atual };
  } catch {
    return vazio;
  }
}

function gravar(arm: Armazenamento, d: DadosPerfis): boolean {
  try {
    arm.setItem(CHAVE_PERFIS, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

export function perfilAtual(arm: Armazenamento | null): Perfil | null {
  const d = carregarPerfis(arm);
  return d.perfis.find((p) => p.id === d.atual) ?? null;
}

export type ResultadoCriar = { ok: true; perfil: Perfil } | { ok: false; motivo: 'cheio' | 'sem_armazenamento' };

/**
 * Cria um perfil e já o deixa como atual. O primeiro perfil herda os dados de antes dos
 * perfis (quem já jogava não perde as estrelas nem a galeria).
 */
export function criarPerfil(
  arm: Armazenamento | null,
  avatar: Avatar,
  nome: string,
  agora: Date = new Date(),
  gerarId: () => string = () => `p${agora.getTime().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
): ResultadoCriar {
  if (!arm) return { ok: false, motivo: 'sem_armazenamento' };
  const d = carregarPerfis(arm);
  if (d.perfis.length >= MAX_PERFIS) return { ok: false, motivo: 'cheio' };
  let id = gerarId();
  while (d.perfis.some((p) => p.id === id)) id += 'x';
  const perfil: Perfil = { id, nome: limparNome(nome).trim(), avatar, criadoEm: agora.toISOString() };
  const primeiro = d.perfis.length === 0;
  if (!gravar(arm, { perfis: [...d.perfis, perfil], atual: id })) return { ok: false, motivo: 'sem_armazenamento' };
  if (primeiro) migrarDadosAntigos(arm, id);
  return { ok: true, perfil };
}

/** Copia os dados sem perfil (versão antiga do jogo) para o perfil e apaga os antigos. */
function migrarDadosAntigos(arm: Armazenamento, id: string): void {
  for (const chave of CHAVES_DO_JOGADOR) {
    try {
      const v = arm.getItem(chave);
      if (v === null) continue;
      if (arm.getItem(chaveDoPerfil(chave, id)) === null) arm.setItem(chaveDoPerfil(chave, id), v);
      arm.removeItem?.(chave);
    } catch {
      // sem espaço: os dados antigos continuam onde estavam
    }
  }
}

export function escolherPerfil(arm: Armazenamento | null, id: string): boolean {
  if (!arm) return false;
  const d = carregarPerfis(arm);
  if (!d.perfis.some((p) => p.id === id)) return false;
  return gravar(arm, { ...d, atual: id });
}

export function renomearPerfil(arm: Armazenamento | null, id: string, nome: string): boolean {
  if (!arm) return false;
  const d = carregarPerfis(arm);
  const p = d.perfis.find((x) => x.id === id);
  if (!p) return false;
  p.nome = limparNome(nome).trim();
  return gravar(arm, d);
}

/** Apaga o perfil e todos os dados dele (estrelas, galeria, progresso). */
export function apagarPerfil(arm: Armazenamento | null, id: string): boolean {
  if (!arm) return false;
  const d = carregarPerfis(arm);
  if (!d.perfis.some((p) => p.id === id)) return false;
  for (const chave of CHAVES_DO_JOGADOR) {
    try {
      arm.removeItem?.(chaveDoPerfil(chave, id));
    } catch {
      // ignora
    }
  }
  return gravar(arm, { perfis: d.perfis.filter((p) => p.id !== id), atual: d.atual === id ? null : d.atual });
}

export function chaveDoPerfil(chave: string, id: string): string {
  return `${chave}@${id}`;
}

/**
 * Armazenamento visto pelo jogador `id`: as chaves do jogador ganham o sufixo do perfil;
 * as demais (preferências do aparelho) passam direto.
 */
export function armazenamentoDoPerfil(base: Armazenamento, id: string): Armazenamento {
  const k = (chave: string) => (CHAVES_DO_JOGADOR.includes(chave) ? chaveDoPerfil(chave, id) : chave);
  return {
    getItem: (chave) => base.getItem(k(chave)),
    setItem: (chave, valor) => base.setItem(k(chave), valor),
    removeItem: (chave) => base.removeItem?.(k(chave)),
  };
}

/** Armazenamento do jogador atual (sem perfil escolhido: o armazenamento comum). */
export function armazenamentoDoJogador(base: Armazenamento | null): Armazenamento | null {
  if (!base) return null;
  const p = perfilAtual(base);
  return p ? armazenamentoDoPerfil(base, p.id) : base;
}

/** Atalho das cenas: armazenamento do jogador atual neste aparelho. */
export function armazenamentoJogador(): Armazenamento | null {
  return armazenamentoDoJogador(armazenamentoLocal());
}
