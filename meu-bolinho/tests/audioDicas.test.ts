import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import falas from '../src/data/falas.json';
import ingredients from '../src/data/ingredients.json';
import { FilaNarracao, type ReprodutorFala } from '../src/systems/audio/FilaNarracao';
import { HintTimer } from '../src/systems/hint/HintTimer';
import {
  CHAVE_PREFERENCIAS,
  PREFERENCIAS_PADRAO,
  carregarPreferencias,
  salvarPreferencias,
  type Armazenamento,
} from '../src/systems/save/Preferencias';

/** Reprodutor falso: registra o que tocou e deixa o teste decidir quando cada fala termina. */
class ReprodutorFalso implements ReprodutorFala {
  tocadas: string[] = [];
  simultaneas = 0;
  maxSimultaneas = 0;
  private fins: Array<() => void> = [];
  tocar(id: string, fim: () => void): void {
    this.tocadas.push(id);
    this.simultaneas++;
    this.maxSimultaneas = Math.max(this.maxSimultaneas, this.simultaneas);
    this.fins.push(() => {
      this.simultaneas--;
      fim();
    });
  }
  parar(): void {
    if (this.fins.length) this.simultaneas--;
    this.fins = [];
  }
  terminarAtual(): void {
    this.fins.shift()?.();
  }
}

describe('FilaNarracao', () => {
  it('nunca toca duas falas ao mesmo tempo', () => {
    const r = new ReprodutorFalso();
    const f = new FilaNarracao(r, 5);
    f.falar('a'); f.falar('b'); f.falar('c');
    expect(r.tocadas).toEqual(['a']);
    r.terminarAtual(); r.terminarAtual(); r.terminarAtual();
    expect(r.tocadas).toEqual(['a', 'b', 'c']);
    expect(r.maxSimultaneas).toBe(1);
  });

  it('ignora fala repetida que está tocando ou na fila', () => {
    const r = new ReprodutorFalso();
    const f = new FilaNarracao(r);
    f.falar('a'); f.falar('a'); f.falar('b'); f.falar('b');
    expect(f.pendentes).toEqual(['b']);
  });

  it('limita a fila descartando as falas normais mais antigas', () => {
    const r = new ReprodutorFalso();
    const f = new FilaNarracao(r, 2);
    f.falar('tocando'); f.falar('velha'); f.falar('media'); f.falar('nova');
    expect(f.pendentes).toEqual(['media', 'nova']);
  });

  it('prioridade alta passa na frente das normais sem cortar a atual', () => {
    const r = new ReprodutorFalso();
    const f = new FilaNarracao(r, 3);
    f.falar('atual'); f.falar('normal'); f.falar('perigo', 'alta');
    expect(f.falando).toBe('atual');
    expect(f.pendentes).toEqual(['perigo', 'normal']);
  });

  it('parar corta tudo e um fim atrasado da fala cortada não dispara a próxima', () => {
    const r = new ReprodutorFalso();
    const f = new FilaNarracao(r);
    let fimAtrasado: (() => void) | null = null;
    const espiao: ReprodutorFala = { tocar: (id, fim) => { r.tocar(id, fim); fimAtrasado = fim; }, parar: () => r.parar() };
    const g = new FilaNarracao(espiao);
    g.falar('a'); g.falar('b');
    g.parar();
    fimAtrasado!();
    expect(g.falando).toBeNull();
    expect(r.tocadas).toEqual(['a']);
    void f;
  });
});

describe('HintTimer', () => {
  it('sobe de nível aos 6, 12 e 20 s de inatividade', () => {
    const h = new HintTimer();
    const niveis: number[] = [];
    for (let t = 0; t < 25000; t += 100) { const n = h.atualizar(100, true); if (n) niveis.push(n); }
    expect(niveis).toEqual([1, 2, 3]);
  });

  it('atividade zera e esconde a dica', () => {
    const h = new HintTimer();
    h.atualizar(13000, true);
    expect(h.nivel).toBe(2);
    expect(h.atividade()).toBe(true);
    expect(h.nivel).toBe(0);
    expect(h.atualizar(5000, true)).toBeNull();
  });

  it('não corre enquanto inativo (comemoração, forno assando, gesto em andamento)', () => {
    const h = new HintTimer();
    for (let i = 0; i < 100; i++) h.atualizar(1000, false);
    expect(h.nivel).toBe(0);
    expect(h.inativoMs).toBe(0);
  });

  it('um salto grande de tempo entrega só o nível mais alto, uma vez', () => {
    const h = new HintTimer();
    expect(h.atualizar(30000, true)).toBe(3);
    expect(h.atualizar(30000, true)).toBeNull();
  });
});

describe('Preferências (área dos pais)', () => {
  const memoria = (): Armazenamento & { dados: Map<string, string> } => {
    const dados = new Map<string, string>();
    return { dados, getItem: (k) => dados.get(k) ?? null, setItem: (k, v) => void dados.set(k, v) };
  };

  it('salva e carrega', () => {
    const m = memoria();
    const p = { ...PREFERENCIAS_PADRAO, narracao: false, volumeGeral: 0.3 };
    expect(salvarPreferencias(m, p)).toBe(true);
    expect(carregarPreferencias(m)).toEqual(p);
  });

  it('dado corrompido, ausente ou inválido cai nos padrões', () => {
    const m = memoria();
    expect(carregarPreferencias(m)).toEqual(PREFERENCIAS_PADRAO);
    m.dados.set(CHAVE_PREFERENCIAS, '{não é json');
    expect(carregarPreferencias(m)).toEqual(PREFERENCIAS_PADRAO);
    m.dados.set(CHAVE_PREFERENCIAS, JSON.stringify({ volumeGeral: 7, narracao: 'sim', musica: false }));
    expect(carregarPreferencias(m)).toEqual({ ...PREFERENCIAS_PADRAO, volumeGeral: 1, musica: false });
  });

  it('storage bloqueado (modo privado) não quebra o jogo', () => {
    const bloqueado: Armazenamento = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceeded'); } };
    expect(carregarPreferencias(bloqueado)).toEqual(PREFERENCIAS_PADRAO);
    expect(salvarPreferencias(bloqueado, PREFERENCIAS_PADRAO)).toBe(false);
    expect(carregarPreferencias(null)).toEqual(PREFERENCIAS_PADRAO);
  });
});

describe('catálogo de falas', () => {
  const ids = new Set(Object.keys(falas));
  const arquivos = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? arquivos(p) : p.endsWith('.ts') ? [p] : []; });

  it('todo falar("id") usado no código existe em falas.json', () => {
    const usados = new Set<string>();
    for (const arq of arquivos(join(__dirname, '../src'))) {
      const codigo = readFileSync(arq, 'utf8');
      for (const m of codigo.matchAll(/(?:falar|fala:)\s*\(?\s*'([a-z_.0-9]+)'/g)) usados.add(m[1]!);
    }
    expect(usados.size).toBeGreaterThan(20);
    for (const id of usados) expect(ids.has(id), `fala "${id}" sem texto em falas.json`).toBe(true);
  });

  it('cada ingrediente despejável tem fala de vez e de rejeição', () => {
    for (const [item, def] of Object.entries(ingredients)) {
      if (item === 'ovo') continue;
      expect(ids.has(`despejar.${item}`), `despejar.${item}`).toBe(true);
      expect(ids.has(`rejeicao.${item}`), `rejeicao.${item}`).toBe(true);
      void def;
    }
  });

  it('roteiro de gravação está em dia com falas.json', () => {
    const roteiro = readFileSync(join(__dirname, '../docs/ROTEIRO_NARRACAO.md'), 'utf8');
    for (const id of ids) expect(roteiro, `roteiro sem "${id}" (rode npm run roteiro)`).toContain(`\`${id}\``);
  });
});
