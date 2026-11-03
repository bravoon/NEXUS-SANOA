/**
 * Aceite: a receita real (data/recipes/fofinho.json) percorrida do início ao fim só com
 * input simulado, nos dois modos. Em cada etapa, antes de completar, verificamos que
 * "soltar no meio" não conclui e que o tempo sozinho não avança nada.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import difficulty from '../src/data/difficulty.json';
import ingredients from '../src/data/ingredients.json';
import { resolverReceita, validarReceita } from '../src/systems/recipe/recipeLoader';
import { Sessao } from '../src/systems/recipe/Sessao';
import type { Dificuldade, IngredienteDef, ParametrosDificuldade } from '../src/systems/recipe/recipeTypes';
import { CoverageStep } from '../src/systems/steps/CoverageStep';
import { DecorStep } from '../src/systems/steps/DecorStep';
import { EggStep } from '../src/systems/steps/EggStep';
import { OvenStep } from '../src/systems/steps/OvenStep';
import { PourOutStep } from '../src/systems/steps/PourOutStep';
import { PourStep } from '../src/systems/steps/PourStep';
import { StirStep } from '../src/systems/steps/StirStep';
import { UnmoldStep } from '../src/systems/steps/UnmoldStep';
import { circulo } from './helpers';

const dirReceitas = join(__dirname, '../src/data/recipes');
const lerReceita = (arq: string) => JSON.parse(readFileSync(join(dirReceitas, arq), 'utf8'));
const json = lerReceita('fofinho.json');
const segurando = { segurando: true, anguloGraus: 90, bicoSobreAlvo: true };
const area = { x: 0, y: 0, largura: 200, altura: 200 };

function pintarTudo(s: CoverageStep): void {
  for (let y = 0; y <= 200; y += 10) {
    s.pintar(0, y);
    s.pintar(200, y);
    s.fimDoGesto();
  }
}

function jogar(dificuldade: Dificuldade, rng: () => number, bruto: unknown = json) {
  const receita = resolverReceita(validarReceita(bruto), dificuldade, difficulty as Record<Dificuldade, ParametrosDificuldade>, ingredients as Record<string, IngredienteDef>);
  const sessao = new Sessao(receita, rng);
  const r = sessao.runner;
  const cenas: string[] = [];
  let t = 0;
  r.iniciar();

  /** Gesto que NÃO completa: o estado não pode virar "concluida". */
  const gestoIncompleto = (acao: () => void) => {
    const i = r.estado.indice;
    r.inicioDoGesto();
    acao();
    r.fimDoGesto();
    expect(r.estado.sub).not.toBe('concluida');
    expect(r.estado.indice).toBe(i);
  };

  while (r.estado.sub !== 'final') {
    expect(r.estado.sub).toBe('aguardando');
    if (cenas.at(-1) !== sessao.cenaAtual) cenas.push(sessao.cenaAtual!);
    const c = r.controlador!;

    if (c instanceof PourStep) {
      gestoIncompleto(() => c.tick(segurando, 300));
      r.inicioDoGesto();
      while (!c.metaAtingida()) c.tick({ ...segurando, anguloGraus: 50 }, 16);
      sessao.tigela.adicionar(c.params.item, c.despejado);
      r.fimDoGesto();
    } else if (c instanceof EggStep) {
      for (let ovo = 0; ovo < c.quantidade; ovo++) {
        gestoIncompleto(() => c.apoiarNaBorda());
        gestoIncompleto(() => c.toque((t += 1000)));
        r.inicioDoGesto();
        c.toque((t += 1000));
        if (c.caiuCasca) r.reportarErro('casca');
        r.fimDoGesto();
        if (r.estado.sub === 'correcao') {
          r.inicioDoGesto();
          while (c.cascasNaTigela > 0) c.retirarCasca();
          r.fimDoGesto();
        }
      }
    } else if (c instanceof StirStep) {
      gestoIncompleto(() => { for (const a of circulo({ raio: 60, voltas: 1, duracaoMs: 1000, t0: (t += 2000) })) c.amostra(a.x, a.y, a.t); });
      r.inicioDoGesto();
      for (const a of circulo({ raio: 60, voltas: c.voltasMeta + 0.5, duracaoMs: 15000, t0: (t += 2000) })) c.amostra(a.x, a.y, a.t);
      r.fimDoGesto();
    } else if (c instanceof CoverageStep) {
      c.definirSuperficie(area, () => true);
      gestoIncompleto(() => c.pintar(100, 100));
      r.inicioDoGesto();
      pintarTudo(c);
      r.fimDoGesto();
    } else if (c instanceof PourOutStep) {
      expect(c.inicial).toBeCloseTo(sessao.tigela.total);
      gestoIncompleto(() => c.tick(segurando, 1000));
      r.inicioDoGesto();
      while (!c.metaAtingida()) c.tick(segurando, 16);
      r.fimDoGesto();
    } else if (c instanceof OvenStep) {
      gestoIncompleto(() => c.colocarForma());
      gestoIncompleto(() => c.tocarPorta());
      c.assar(60_000);
      expect(c.fase).toBe('timer'); // sem girar o timer, o tempo não faz nada
      gestoIncompleto(() => { for (const a of circulo({ raio: 60, voltas: 1.2, duracaoMs: 1200, t0: (t += 2000) })) c.girarTimer(a.x, a.y, a.t); });
      c.assar(c.duracaoMs);
      gestoIncompleto(() => c.tocarPorta());
      gestoIncompleto(() => expect(c.pegarForma()).toBe('quente'));
      gestoIncompleto(() => c.equiparLuva());
      r.inicioDoGesto();
      expect(c.pegarForma()).toBe('ok');
      c.soltarForma(true);
      r.fimDoGesto();
    } else if (c instanceof UnmoldStep) {
      gestoIncompleto(() => c.colocarPrato());
      gestoIncompleto(() => { c.iniciarSwipe(0, 0, (t += 1000)); c.terminarSwipe(0, 100, t + 2000); });
      r.inicioDoGesto();
      c.iniciarSwipe(0, 0, (t += 5000));
      c.moverSwipe(0, 100, t + 100);
      c.terminarSwipe(0, 200, t + 200);
      r.fimDoGesto();
    } else if (c instanceof DecorStep) {
      c.cobertura.definirSuperficie(area, () => true);
      gestoIncompleto(() => pintarTudo(c.cobertura));
      gestoIncompleto(() => c.decoracao.adicionar([{ tipo: 'vela', x: 0, y: 0, rot: 0, cor: 0 }]));
      r.inicioDoGesto();
      expect(c.finalizar()).toBe(true);
      r.fimDoGesto();
    } else {
      throw new Error('controlador inesperado');
    }

    expect(r.estado.sub).toBe('concluida');
    r.proxima();
  }
  return { receita, sessao, cenas };
}

describe('receita completa (fofinho.json)', () => {
  it('modo Fácil: 10 etapas, 4 ingredientes, passa pelas 3 cenas na ordem', () => {
    const { receita, cenas, sessao } = jogar('facil', () => 0);
    expect(receita.etapas).toHaveLength(10);
    expect(receita.ingredientes).toEqual(['farinha', 'acucar', 'ovo', 'leite']);
    expect(cenas).toEqual(['Cozinha', 'Forno', 'Confeitar']);
    expect(sessao.runner.estado.sub).toBe('final');
  });

  it('modo Confeiteiro: fermento, casca de ovo e 10 voltas', () => {
    const { receita, sessao } = jogar('confeiteiro', () => 0); // rng 0 → casca em todo ovo
    expect(receita.etapas).toHaveLength(11);
    expect(receita.ingredientes).toContain('fermento');
    expect(receita.etapas.find((e) => e.tipo === 'mexer')).toEqual({ tipo: 'mexer', voltas: 10 });
    expect(sessao.runner.estado.sub).toBe('final');
  });
});

describe('toda receita em data/recipes joga do início ao fim só com input (adicionar receita = adicionar JSON)', () => {
  const arquivos = readdirSync(dirReceitas).filter((f) => f.endsWith('.json'));
  it('há pelo menos 2 receitas', () => expect(arquivos.length).toBeGreaterThanOrEqual(2));
  for (const arq of arquivos) {
    for (const d of ['facil', 'confeiteiro'] as const) {
      it(`${arq} [${d}]`, () => {
        const { sessao, cenas } = jogar(d, () => 0.3, lerReceita(arq));
        expect(sessao.runner.estado.sub).toBe('final');
        // as cenas aparecem na ordem do fluxo, sem voltar
        const ordem = ['Cozinha', 'Forno', 'Confeitar'];
        expect(cenas.map((c) => ordem.indexOf(c))).toEqual([...cenas.map((c) => ordem.indexOf(c))].sort());
      });
    }
  }

  it('uma receita inventada agora (nunca vista pelo código) também funciona', () => {
    const inventada = {
      id: 'teste-limao', nome: 'Bolo de Limão', corMassa: '#F3E79B',
      etapas: [
        { tipo: 'despejar', item: 'farinha', quantidade: 1.25 },
        { tipo: 'quebrar_ovo', quantidade: 1 },
        { tipo: 'despejar', item: 'leite', quantidade: 0.5, tolerancia: 0.3 },
        { tipo: 'mexer', voltas: 3 },
        { tipo: 'despejar_massa' },
        { tipo: 'forno', tempoSegundos: 15 },
        { tipo: 'desenformar' },
        { tipo: 'decorar', corCobertura: '#FFFDE7', cobertura: 0.6 },
      ],
    };
    expect(jogar('facil', () => 0.9, inventada).sessao.runner.estado.sub).toBe('final');
  });
});
