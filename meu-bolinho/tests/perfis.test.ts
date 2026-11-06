import { describe, expect, it } from 'vitest';
import {
  apagarPerfil,
  armazenamentoDoJogador,
  armazenamentoDoPerfil,
  carregarPerfis,
  CHAVE_PERFIS,
  criarPerfil,
  escolherPerfil,
  limparNome,
  MAX_PERFIS,
  nomeExibido,
  perfilAtual,
  renomearPerfil,
} from '../src/systems/save/Perfis';
import { CHAVE_GALERIA } from '../src/systems/save/Galeria';
import { CHAVE_PREFERENCIAS, type Armazenamento } from '../src/systems/save/Preferencias';
import { carregarEstrelas, CHAVE_TRILHA, registrarEstrelas } from '../src/systems/progresso/Trilha';

function memoria(): Armazenamento & { dados: Map<string, string> } {
  const dados = new Map<string, string>();
  return { dados, getItem: (k) => dados.get(k) ?? null, setItem: (k, v) => void dados.set(k, v), removeItem: (k) => void dados.delete(k) };
}
let n = 0;
const id = () => `id${n++}`;

describe('perfis de jogador', () => {
  it('sem perfis: lista vazia e ninguém jogando', () => {
    expect(carregarPerfis(memoria())).toEqual({ perfis: [], atual: null });
    expect(perfilAtual(null)).toBeNull();
  });

  it('criar deixa o perfil como atual; nome vazio mostra o nome do bichinho', () => {
    const arm = memoria();
    const r = criarPerfil(arm, 'coelho', '', new Date(0), id);
    expect(r.ok).toBe(true);
    expect(perfilAtual(arm)?.avatar).toBe('coelho');
    expect(nomeExibido(perfilAtual(arm)!)).toBe('Coelhinho');
    criarPerfil(arm, 'gato', 'Ana', new Date(0), id);
    expect(nomeExibido(perfilAtual(arm)!)).toBe('Ana');
  });

  it('cada perfil tem as próprias estrelas e galeria; as preferências são do aparelho', () => {
    const arm = memoria();
    const a = criarPerfil(arm, 'urso', 'Bia', new Date(0), id);
    const b = criarPerfil(arm, 'sapo', 'Caio', new Date(0), id);
    if (!a.ok || !b.ok) throw new Error();
    registrarEstrelas(armazenamentoDoPerfil(arm, a.perfil.id), 'fofinho', 3);
    registrarEstrelas(armazenamentoDoPerfil(arm, b.perfil.id), 'fofinho', 1);
    expect(carregarEstrelas(armazenamentoDoPerfil(arm, a.perfil.id))).toEqual({ fofinho: 3 });
    expect(carregarEstrelas(armazenamentoDoPerfil(arm, b.perfil.id))).toEqual({ fofinho: 1 });
    // o jogador atual (Caio) vê só as dele
    expect(carregarEstrelas(armazenamentoDoJogador(arm))).toEqual({ fofinho: 1 });
    escolherPerfil(arm, a.perfil.id);
    expect(carregarEstrelas(armazenamentoDoJogador(arm))).toEqual({ fofinho: 3 });
    armazenamentoDoPerfil(arm, a.perfil.id).setItem(CHAVE_PREFERENCIAS, '{"x":1}');
    expect(arm.getItem(CHAVE_PREFERENCIAS)).toBe('{"x":1}');
  });

  it('o primeiro perfil herda os dados de antes dos perfis (ninguém perde estrelas)', () => {
    const arm = memoria();
    arm.setItem(CHAVE_TRILHA, '{"fofinho":2,"chocolate":1}');
    arm.setItem(CHAVE_GALERIA, '[]');
    const r = criarPerfil(arm, 'panda', 'Duda', new Date(0), id);
    if (!r.ok) throw new Error();
    expect(carregarEstrelas(armazenamentoDoJogador(arm))).toEqual({ fofinho: 2, chocolate: 1 });
    expect(arm.getItem(CHAVE_TRILHA)).toBeNull();
    // o segundo perfil começa do zero
    criarPerfil(arm, 'leao', 'Edu', new Date(0), id);
    expect(carregarEstrelas(armazenamentoDoJogador(arm))).toEqual({});
  });

  it(`no máximo ${MAX_PERFIS} perfis`, () => {
    const arm = memoria();
    for (let i = 0; i < MAX_PERFIS; i++) expect(criarPerfil(arm, 'gato', '', new Date(0), id).ok).toBe(true);
    expect(criarPerfil(arm, 'gato', '', new Date(0), id)).toEqual({ ok: false, motivo: 'cheio' });
  });

  it('apagar remove o perfil e os dados dele, sem mexer nos outros', () => {
    const arm = memoria();
    const a = criarPerfil(arm, 'raposa', 'Fê', new Date(0), id);
    const b = criarPerfil(arm, 'pinguim', 'Gui', new Date(0), id);
    if (!a.ok || !b.ok) throw new Error();
    registrarEstrelas(armazenamentoDoPerfil(arm, a.perfil.id), 'fofinho', 2);
    registrarEstrelas(armazenamentoDoPerfil(arm, b.perfil.id), 'fofinho', 3);
    expect(apagarPerfil(arm, b.perfil.id)).toBe(true);
    expect(carregarPerfis(arm).perfis.map((p) => p.id)).toEqual([a.perfil.id]);
    expect(carregarPerfis(arm).atual).toBeNull(); // quem jogava foi apagado
    expect([...arm.dados.keys()].some((k) => k.endsWith(`@${b.perfil.id}`))).toBe(false);
    expect(carregarEstrelas(armazenamentoDoPerfil(arm, a.perfil.id))).toEqual({ fofinho: 2 });
  });

  it('nomes: só letras, curtos; renomear funciona', () => {
    expect(limparNome('  Ana<script>123')).toBe('Anascript');
    expect(limparNome('João Pedro da Silva')).toHaveLength(10);
    const arm = memoria();
    const r = criarPerfil(arm, 'coelho', 'Lu', new Date(0), id);
    if (!r.ok) throw new Error();
    renomearPerfil(arm, r.perfil.id, 'Luíza');
    expect(perfilAtual(arm)?.nome).toBe('Luíza');
  });

  it('dado corrompido não quebra: sem perfis', () => {
    const arm = memoria();
    arm.setItem(CHAVE_PERFIS, '{oops');
    expect(carregarPerfis(arm).perfis).toEqual([]);
    arm.setItem(CHAVE_PERFIS, JSON.stringify({ perfis: [{ id: 'x', nome: 'A', avatar: 'dragão', criadoEm: '' }, { id: 'y', nome: 'B', avatar: 'gato', criadoEm: '' }], atual: 'x' }));
    expect(carregarPerfis(arm)).toEqual({ perfis: [{ id: 'y', nome: 'B', avatar: 'gato', criadoEm: '' }], atual: null });
  });
});
