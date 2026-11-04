import { describe, expect, it } from 'vitest';
import { avaliar } from '../src/systems/progresso/Avaliacao';
import { carregarEstrelas, montarTrilha, placar, registrarEstrelas } from '../src/systems/progresso/Trilha';
import type { ReceitaJson } from '../src/systems/recipe/recipeTypes';
import type { Armazenamento } from '../src/systems/save/Preferencias';
import { BeatStep } from '../src/systems/steps/BeatStep';
import { DecorStep } from '../src/systems/steps/DecorStep';
import { FillLayerStep } from '../src/systems/steps/FillLayerStep';
import { gerarDesenho, reamostrar, TraceStep } from '../src/systems/steps/TraceStep';

/** Vai e vem horizontal: `n` traços de `amplitude` px, cada um em `msPorTraco`. */
function vaiEVem(s: BeatStep, n: number, amplitude: number, msPorTraco: number, t0 = 0, dentro = true): number {
  let t = t0;
  s.amostra(500, 400, t, dentro);
  for (let i = 0; i < n; i++) {
    const de = i % 2 === 0 ? 500 : 500 + amplitude;
    const para = i % 2 === 0 ? 500 + amplitude : 500;
    for (let k = 1; k <= 8; k++) {
      t += msPorTraco / 8;
      s.amostra(de + ((para - de) * k) / 8, 400, t, dentro);
    }
  }
  return t;
}

describe('bater claras (BeatStep)', () => {
  it('vai e vem rápido e amplo conta batidas', () => {
    const s = new BeatStep(10);
    vaiEVem(s, 14, 80, 120);
    expect(s.batidas).toBeGreaterThanOrEqual(10);
    expect(s.metaAtingida()).toBe(true);
  });

  it('tremor (amplitude pequena), movimento lento e arrastar reto não contam', () => {
    const tremor = new BeatStep(5);
    vaiEVem(tremor, 40, 12, 60);
    expect(tremor.batidas).toBe(0);
    const lento = new BeatStep(5);
    vaiEVem(lento, 20, 80, 2000);
    expect(lento.batidas).toBe(0);
    const reto = new BeatStep(5);
    for (let t = 0; t < 3000; t += 16) reto.amostra(t * 0.8, 400, t, true);
    expect(reto.batidas).toBe(0);
  });

  it('batedor fora da tigela não bate', () => {
    const s = new BeatStep(5);
    vaiEVem(s, 20, 80, 120, 0, false);
    expect(s.batidas).toBe(0);
  });

  it('ZERO AUTO-COMPLETE: parou de bater, a espuma para', () => {
    const s = new BeatStep(30);
    const t = vaiEVem(s, 10, 80, 120);
    const antes = s.batidas;
    for (let k = 0; k < 300; k++) s.amostra(500, 400, t + k * 16, true);
    s.fimDoGesto();
    expect(s.batidas).toBe(antes);
    expect(s.metaAtingida()).toBe(false);
  });
});

describe('rechear (FillLayerStep)', () => {
  const novo = () => {
    const f = new FillLayerStep(0.8, 0xe57373);
    f.recheio.definirSuperficie({ x: 0, y: 0, largura: 100, altura: 100 }, () => true);
    return f;
  };
  const espalhar = (f: FillLayerStep) => {
    for (let y = 0; y <= 100; y += 10) { f.recheio.pintar(0, y); f.recheio.pintar(100, y); f.fimDoGesto(); }
  };

  it('a camada de cima só assenta depois do recheio', () => {
    const f = novo();
    expect(f.soltarCamada(0, 0)).toBe(false);
    espalhar(f);
    expect(f.soltarCamada(5, -3)).toBe(true);
    expect(f.metaAtingida()).toBe(true);
    expect(f.deslocamento).toEqual({ dx: 5, dy: -3 }); // fica onde a criança soltou: sem encaixe automático
  });

  it('soltar longe do bolo não assenta (a camada volta, nada é concluído)', () => {
    const f = novo();
    espalhar(f);
    expect(f.soltarCamada(80, 0)).toBe(false);
    expect(f.metaAtingida()).toBe(false);
  });
});

describe('escrever com glacê (TraceStep)', () => {
  const coracao = gerarDesenho('coracao', 640, 360, 215, 88);

  it('todos os desenhos geram caminhos com pontos de controle', () => {
    for (const d of ['coracao', 'estrela', 'circulo', 'onda'] as const) {
      const pts = reamostrar(gerarDesenho(d, 0, 0, 200, 100), 10);
      expect(pts.length).toBeGreaterThan(20);
    }
  });

  it('seguir o desenho completa; seguir só metade não', () => {
    const t = new TraceStep(coracao, 20, 0.85);
    const metade = coracao.slice(0, Math.floor(coracao.length / 2));
    for (const p of metade) t.tracar(p.x, p.y);
    expect(t.metaAtingida()).toBe(false);
    for (const p of coracao) t.tracar(p.x, p.y);
    expect(t.metaAtingida()).toBe(true);
  });

  it('rabiscar fora do desenho não conta', () => {
    const t = new TraceStep(coracao, 20, 0.85);
    for (let i = 0; i < 200; i++) t.tracar(100 + (i % 20) * 5, 600 + (i % 7) * 3);
    expect(t.fracao).toBe(0);
  });

  it('ZERO AUTO-COMPLETE: levantar o dedo não liga traços distantes', () => {
    const t = new TraceStep(coracao, 20, 0.85);
    const a = coracao[0]!, b = coracao[40]!;
    t.tracar(a.x, a.y);
    t.fimDoGesto();
    t.tracar(b.x, b.y); // novo toque longe: só conta perto de b
    const ligado = new TraceStep(coracao, 20, 0.85);
    ligado.tracar(a.x, a.y);
    ligado.tracar(b.x, b.y); // se o dedo NÃO tivesse levantado, o traço reto contaria mais
    expect(t.fracao).toBeLessThan(ligado.fracao);
    expect(t.metaAtingida()).toBe(false);
  });
});

describe('decorar com glacê (DecorStep)', () => {
  it('fases: cobrir → glacê → enfeitar; "Pronto!" só no fim', () => {
    const d = new DecorStep(0.8, 0x5a3220, { desenho: 'estrela', cor: '#FFFFFF', tracado: 0.8, tolerancia: 20 });
    d.cobertura.definirSuperficie({ x: 0, y: 0, largura: 100, altura: 100 }, () => true);
    expect(d.fase).toBe('cobrir');
    for (let y = 0; y <= 100; y += 10) { d.cobertura.pintar(0, y); d.cobertura.pintar(100, y); d.fimDoGesto(); }
    expect(d.fase).toBe('glace');
    expect(d.finalizar()).toBe(false);
    const caminho = gerarDesenho('estrela', 50, 50, 100, 100);
    d.definirGlace(caminho);
    for (const p of reamostrar(caminho, 3)) d.tracoGlace!.tracar(p.x, p.y);
    expect(d.fase).toBe('enfeitar');
    expect(d.finalizar()).toBe(true);
  });
});

describe('estrelas (avaliação sem punição)', () => {
  it('terminar sempre dá pelo menos 1 estrela', () => {
    expect(avaliar({ excessos: 9, coberturaFinal: 0.8, enfeites: 0 }).estrelas).toBe(1);
  });
  it('medidas certinhas e bolo caprichado dão as outras', () => {
    expect(avaliar({ excessos: 0, coberturaFinal: 0.8, enfeites: 0 })).toMatchObject({ estrelas: 2, medidasCertinhas: true });
    expect(avaliar({ excessos: 1, coberturaFinal: 0.97, enfeites: 5 })).toMatchObject({ estrelas: 2, boloCaprichado: true });
    expect(avaliar({ excessos: 0, coberturaFinal: 0.97, enfeites: 3 }).estrelas).toBe(3);
  });
});

describe('trilha de fases', () => {
  const r = (id: string, tipos: string[], glace = false): ReceitaJson => ({
    id, nome: id, corMassa: '#ffffff',
    etapas: tipos.map((tipo) => (tipo === 'decorar' && glace ? { tipo, glace: 'coracao' } : { tipo })),
  });
  const receitas = new Map<string, ReceitaJson>([
    ['a', r('a', ['despejar', 'mexer', 'decorar'])],
    ['b', r('b', ['despejar', 'bater', 'mexer', 'decorar'])],
    ['c', r('c', ['despejar', 'rechear', 'decorar'], true)],
    ['z-extra', r('z-extra', ['despejar'])],
  ]);

  it('começa só com a fase 1 liberada; terminar libera a próxima', () => {
    let t = montarTrilha(['a', 'b', 'c'], receitas, {});
    expect(t.map((f) => f.liberada)).toEqual([true, false, false, false]);
    t = montarTrilha(['a', 'b', 'c'], receitas, { a: 1 });
    expect(t.map((f) => f.liberada)).toEqual([true, true, false, false]);
  });

  it('nunca bloqueia por "nota": 1 estrela já libera', () => {
    const t = montarTrilha(['a', 'b'], receitas, { a: 1, b: 1 });
    expect(t[2]!.liberada).toBe(true);
  });

  it('área dos pais pode liberar todas', () => {
    expect(montarTrilha(['a', 'b', 'c'], receitas, {}, true).every((f) => f.liberada)).toBe(true);
  });

  it('marca a mecânica nova de cada fase e põe receitas fora da ordem no fim', () => {
    const t = montarTrilha(['a', 'b', 'c'], receitas, {});
    expect(t.map((f) => f.id)).toEqual(['a', 'b', 'c', 'z-extra']);
    expect(t[1]!.novidades).toEqual(['bater']);
    expect(t[2]!.novidades.sort()).toEqual(['glace', 'rechear']);
    expect(t[3]!.novidades).toEqual([]);
  });

  it('guarda a melhor pontuação e soma o placar', () => {
    const dados = new Map<string, string>();
    const arm: Armazenamento = { getItem: (k) => dados.get(k) ?? null, setItem: (k, v) => void dados.set(k, v) };
    registrarEstrelas(arm, 'a', 3);
    registrarEstrelas(arm, 'a', 1);
    registrarEstrelas(arm, 'b', 2);
    expect(carregarEstrelas(arm)).toEqual({ a: 3, b: 2 });
    expect(placar(montarTrilha(['a', 'b', 'c'], receitas, carregarEstrelas(arm)))).toEqual({ estrelas: 5, maximo: 12 });
  });
});

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import trilhaDados from '../src/data/trilha.json';
import { dividirEmMundos, mundoAtual, ordemDosMundos } from '../src/systems/progresso/Trilha';
const trilhaJson = ordemDosMundos(trilhaDados.mundos);
import { validarReceita } from '../src/systems/recipe/recipeLoader';

describe('trilha real (data/trilha.json)', () => {
  const dir = join(__dirname, '../src/data/recipes');
  const receitas = new Map(readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
    const r = validarReceita(JSON.parse(readFileSync(join(dir, f), 'utf8')));
    return [r.id, r] as const;
  }));

  it('todo id da trilha existe e toda receita está na trilha', () => {
    for (const id of trilhaJson) expect(receitas.has(id), id).toBe(true);
    expect([...receitas.keys()].sort()).toEqual([...trilhaJson].sort());
  });

  it('cada mecânica nova estreia na fase planejada', () => {
    const t = montarTrilha(trilhaJson, receitas, {});
    const estreia = (m: string) => t.find((f) => (f.novidades as string[]).includes(m))?.id;
    expect(estreia('bater')).toBe('nuvem');
    expect(estreia('rechear')).toBe('morango');
    expect(estreia('glace')).toBe('aniversario');
    expect(estreia('peneirar')).toBe('fuba');
    expect(estreia('ralar')).toBe('coco');
    expect(estreia('polvilhar')).toBe('limao');
  });

  it('16 fases em 2 mundos de 8; o mundo 2 abre ao terminar a fase 8', () => {
    expect(trilhaJson).toHaveLength(16);
    const est: Record<string, number> = {};
    let mundos = dividirEmMundos(montarTrilha(trilhaJson, receitas, est), trilhaDados.mundos);
    expect(mundos.map((m) => m.fases.length)).toEqual([8, 8]);
    expect(mundos[1]!.aberto).toBe(false);
    expect(mundoAtual(mundos)).toBe(0);
    for (const id of trilhaJson.slice(0, 8)) est[id] = 1;
    mundos = dividirEmMundos(montarTrilha(trilhaJson, receitas, est), trilhaDados.mundos);
    expect(mundos[1]!.aberto).toBe(true);
    expect(mundos[1]!.fases[0]!.numero).toBe(9);
    expect(mundoAtual(mundos)).toBe(1);
  });

  it('nenhuma receita da trilha passa do limite de ingredientes nos dois modos', async () => {
    const { carregarReceita } = await import('../src/data/registry');
    for (const id of trilhaJson) for (const d of ['facil', 'confeiteiro'] as const) expect(() => carregarReceita(id, d), `${id} ${d}`).not.toThrow();
  });
});
