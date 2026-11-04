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
import { BeatStep } from '../src/systems/steps/BeatStep';
import { FillLayerStep } from '../src/systems/steps/FillLayerStep';
import { GrateStep } from '../src/systems/steps/GrateStep';
import { SiftStep } from '../src/systems/steps/SiftStep';
import { RollStep } from '../src/systems/steps/RollStep';
import { CutStep } from '../src/systems/steps/CutStep';
import { SliceStep } from '../src/systems/steps/SliceStep';
import { gerarDesenho, reamostrar } from '../src/systems/steps/TraceStep';
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
    } else if (c instanceof BeatStep) {
      // vai e vem rápido; um gesto curto não termina, parar no meio congela
      const bater = (n: number) => {
        c.amostra(0, 0, (t += 1000), true);
        for (let i = 0; i < n; i++) for (let k = 1; k <= 6; k++) c.amostra((i % 2 === 0 ? k : 6 - k) * 15, 0, (t += 20), true);
      };
      gestoIncompleto(() => bater(3));
      r.inicioDoGesto();
      while (!c.metaAtingida()) bater(4);
      r.fimDoGesto();
    } else if (c instanceof SiftStep) {
      // sacudir de lado a lado sobre a tigela; fora da tigela nada cai
      let lado = 1;
      const sacudir = (n: number, sobre: boolean) => {
        let caiu = 0;
        for (let i = 0; i < n; i++) caiu += c.amostra((lado = -lado) * 80, (t += 120), sobre);
        return caiu;
      };
      gestoIncompleto(() => expect(sacudir(20, false)).toBe(0));
      gestoIncompleto(() => sacudir(3, true));
      r.inicioDoGesto();
      for (let i = 0; i < 500 && !c.metaAtingida(); i++) sessao.tigela.adicionar(c.item, sacudir(1, true));
      r.fimDoGesto();
    } else if (c instanceof GrateStep) {
      // passadas verticais na face do ralador; de lado não rala
      const passar = (n: number, vertical: boolean) => {
        let q = 0;
        for (let i = 0; i < n; i++) for (let k = 1; k <= 6; k++) {
          const v = (i % 2 === 0 ? k : 6 - k) * 12;
          q += c.amostra(vertical ? 0 : v, vertical ? v : 0, (t += 30), true);
        }
        return q;
      };
      gestoIncompleto(() => expect(passar(10, false)).toBe(0));
      gestoIncompleto(() => passar(3, true));
      r.inicioDoGesto();
      for (let i = 0; i < 500 && !c.metaAtingida(); i++) sessao.tigela.adicionar(c.item, passar(2, true));
      r.fimDoGesto();
    } else if (c instanceof RollStep) {
      // rolo antes de colocar a massa não abre; depois, passadas amplas abrem
      const rolar = (n: number) => { for (let i = 0; i < n; i++) for (let k = 1; k <= 6; k++) c.amostra(0, (i % 2 === 0 ? k : 6 - k) * 20, (t += 40), true); };
      gestoIncompleto(() => { rolar(6); expect(c.passadas).toBe(0); });
      gestoIncompleto(() => expect(c.colocarMassa()).toBe(true));
      gestoIncompleto(() => rolar(2));
      r.inicioDoGesto();
      for (let i = 0; i < 200 && !c.metaAtingida(); i++) rolar(2);
      r.fimDoGesto();
    } else if (c instanceof CutStep) {
      gestoIncompleto(() => expect(c.cortar(2, 0)).toBe('fora'));
      gestoIncompleto(() => expect(c.cortar(0, 0)).toBe('cortou'));
      gestoIncompleto(() => expect(c.cortar(0.05, 0)).toBe('encostado'));
      const lugares = Array.from({ length: 40 }, (_, k) => ({ x: Math.cos(k * 2.4) * Math.sqrt(k / 40) * 0.75, y: Math.sin(k * 2.4) * Math.sqrt(k / 40) * 0.75 }));
      for (const l of lugares) {
        if (c.metaAtingida()) break;
        r.inicioDoGesto();
        c.cortar(l.x, l.y);
        r.fimDoGesto();
      }
      expect(c.metaAtingida()).toBe(true);
    } else if (c instanceof SliceStep) {
      gestoIncompleto(() => expect(c.cortar({ x: -0.3, y: 0 }, { x: 0.3, y: 0 })).toBe('curto'));
      gestoIncompleto(() => expect(c.cortar({ x: -1, y: 0.6 }, { x: 1, y: 0.6 })).toBe('fora_do_meio'));
      gestoIncompleto(() => expect(c.cortar({ x: -1.1, y: 0 }, { x: 1.1, y: 0 })).toBe('cortou'));
      gestoIncompleto(() => expect(c.cortar({ x: -1.1, y: 0.02 }, { x: 1.1, y: -0.02 })).toBe('repetido'));
      for (let k = 1; !c.metaAtingida() && k < 6; k++) {
        const a = (k * 60 * Math.PI) / 180;
        r.inicioDoGesto();
        c.cortar({ x: -Math.cos(a) * 1.1, y: -Math.sin(a) * 1.1 }, { x: Math.cos(a) * 1.1, y: Math.sin(a) * 1.1 });
        r.fimDoGesto();
      }
      expect(c.metaAtingida()).toBe(true);
      // (a etapa já concluiu no último fimDoGesto)
    } else if (c instanceof FillLayerStep) {
      c.recheio.definirSuperficie(area, () => true);
      gestoIncompleto(() => pintarTudo(c.recheio));
      gestoIncompleto(() => expect(c.soltarCamada(200, 0)).toBe(false)); // longe: não assenta
      r.inicioDoGesto();
      expect(c.soltarCamada(4, 2)).toBe(true);
      r.fimDoGesto();
    } else if (c instanceof DecorStep) {
      c.cobertura.definirSuperficie(area, () => true);
      gestoIncompleto(() => pintarTudo(c.cobertura));
      if (c.glace) {
        expect(c.finalizar()).toBe(false); // sem o glacê, "Pronto!" não vale
        const caminho = gerarDesenho(c.glace.desenho, 100, 100, 100, 100);
        c.definirGlace(caminho);
        gestoIncompleto(() => c.tracoGlace!.tracar(caminho[0]!.x, caminho[0]!.y));
        gestoIncompleto(() => { for (const p of reamostrar(caminho, 3)) c.tracoGlace!.tracar(p.x, p.y); });
      }
      if (c.polvilhador) {
        expect(c.fase).toBe('polvilhar');
        expect(c.finalizar()).toBe(false); // sem polvilhar, "Pronto!" não vale
        const sp = c.polvilhador;
        sp.definirSuperficie(area, () => true);
        const sacudir = (x: number, y: number, n: number) => { for (let i = 0; i < n; i++) sp.amostra(x + (i % 2 ? 60 : -60), y, (t += 120)); };
        gestoIncompleto(() => sacudir(100, 30, 6));
        for (let y = 0; y <= 200 && !sp.metaAtingida(); y += 30)
          for (let x = 0; x <= 200 && !sp.metaAtingida(); x += 30) gestoIncompleto(() => { sp.fimDoGesto(); sacudir(x, y - 70, 4); });
        expect(sp.metaAtingida()).toBe(true);
      }
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
  it('há as 24 receitas da trilha', () => expect(arquivos.length).toBeGreaterThanOrEqual(24));
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
