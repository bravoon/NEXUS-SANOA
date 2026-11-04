import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EventBus, type MapaEventos } from '../src/systems/events/EventBus';
import { BowlContents } from '../src/systems/fill/BowlContents';
import { PourStep } from '../src/systems/steps/PourStep';
import { StirStep } from '../src/systems/steps/StirStep';
import { RecipeRunner } from '../src/systems/recipe/RecipeRunner';
import type { ReceitaResolvida } from '../src/systems/recipe/recipeTypes';
import { circulo } from './helpers';

const segurando = { segurando: true, anguloGraus: 90, bicoSobreAlvo: true };

describe('PourStep', () => {
  const novo = () => new PourStep({ item: 'leite', quantidade: 1, tolerancia: 0.2, material: 'liquido' });

  it('despeja só segurando, inclinado e com o bico sobre a tigela', () => {
    const p = novo();
    p.tick({ ...segurando, bicoSobreAlvo: false }, 1000);
    p.tick({ ...segurando, anguloGraus: 20 }, 1000);
    p.tick({ ...segurando, segurando: false }, 1000);
    expect(p.despejado).toBe(0);
    p.tick(segurando, 1000);
    expect(p.despejado).toBeCloseTo(0.6);
  });

  it('ZERO AUTO-COMPLETE: soltar no meio congela o progresso', () => {
    const p = novo();
    p.tick(segurando, 500);
    const antes = p.progresso;
    for (let i = 0; i < 600; i++) p.tick({ ...segurando, segurando: false }, 16);
    expect(p.progresso).toBe(antes);
    expect(p.metaAtingida()).toBe(false);
  });

  it('meta só dentro da faixa de tolerância', () => {
    const p = novo();
    while (p.despejado < 0.79) p.tick(segurando, 10);
    expect(p.metaAtingida()).toBe(p.despejado >= 0.8);
    while (p.despejado < 1.0) p.tick(segurando, 10);
    expect(p.metaAtingida()).toBe(true);
  });

  it('excesso é corrigido com colheradas sem nunca pular a faixa', () => {
    const p = novo();
    while (p.disponivel > 0) p.tick(segurando, 16); // despeja tudo (1,5)
    expect(p.emExcesso).toBe(true);
    expect(p.metaAtingida()).toBe(false);
    let colheradas = 0;
    while (p.emExcesso) {
      expect(p.retirarColherada()).toBeGreaterThan(0);
      colheradas++;
    }
    expect(colheradas).toBeGreaterThan(0);
    expect(p.metaAtingida()).toBe(true);
    expect(p.retirarColherada()).toBe(0); // sem excesso, colher não tira mais
  });
});

describe('StirStep', () => {
  it('meta de voltas definida pela etapa', () => {
    const s = new StirStep(2);
    for (const a of circulo({ raio: 60, voltas: 1.5, duracaoMs: 1500 })) s.amostra(a.x, a.y, a.t);
    expect(s.metaAtingida()).toBe(false);
    for (const a of circulo({ raio: 60, voltas: 0.7, duracaoMs: 700, t0: 1516, anguloInicial: Math.PI })) s.amostra(a.x, a.y, a.t);
    expect(s.metaAtingida()).toBe(true);
    expect(s.progresso).toBe(1);
  });
});

describe('RecipeRunner (integração com a FSM)', () => {
  const receita: ReceitaResolvida = {
    id: 't', nome: 't', produto: 'bolo', corMassa: '#ffffff', dificuldade: 'facil', ingredientes: ['leite'], recipientes: ['leite'],
    etapas: [
      { tipo: 'despejar', item: 'leite', alvo: 'tigela', quantidade: 1, tolerancia: 0.2, material: 'liquido' },
      { tipo: 'mexer', voltas: 1 },
    ],
  };

  it('fluxo completo só avança com input', () => {
    const bus = new EventBus<MapaEventos>();
    const concluidas: number[] = [];
    let terminou = false;
    bus.on('etapa:concluida', (e) => concluidas.push(e.indice));
    bus.on('receita:concluida', () => (terminou = true));

    const r = new RecipeRunner(receita, bus, { rng: () => 0, tigela: new BowlContents(4) });
    r.iniciar();
    expect(r.estado.sub).toBe('aguardando');

    // soltar sem ter despejado o suficiente não conclui
    r.inicioDoGesto();
    (r.controlador as PourStep).tick(segurando, 500);
    r.fimDoGesto();
    expect(r.estado.sub).toBe('aguardando');

    r.inicioDoGesto();
    (r.controlador as PourStep).tick(segurando, 1000);
    r.fimDoGesto();
    expect(concluidas).toEqual([0]);
    r.proxima();

    const mexer = r.controlador as StirStep;
    expect(mexer).toBeInstanceOf(StirStep);
    r.inicioDoGesto();
    for (const a of circulo({ raio: 60, voltas: 1.1, duracaoMs: 1100 })) mexer.amostra(a.x, a.y, a.t);
    r.fimDoGesto();
    r.proxima();
    expect(terminou).toBe(true);
    expect(r.estado.sub).toBe('final');
  });

  it('excesso leva à correção; colher + soltar conclui', () => {
    const bus = new EventBus<MapaEventos>();
    const erros: string[] = [];
    bus.on('etapa:erro', (e) => erros.push(e.erro));
    const r = new RecipeRunner(receita, bus, { rng: () => 0, tigela: new BowlContents(4) });
    r.iniciar();
    const p = r.controlador as PourStep;

    r.inicioDoGesto();
    while (p.disponivel > 0) p.tick(segurando, 16);
    if (p.emExcesso) r.reportarErro('excesso');
    r.fimDoGesto();
    expect(r.estado.sub).toBe('correcao');
    expect(erros).toEqual(['excesso']);

    r.inicioDoGesto(); // pega a colher
    while (p.emExcesso) p.retirarColherada();
    r.fimDoGesto();
    expect(r.estado.sub).toBe('concluida');
  });
});

describe('RecipeRunner: saída da correção', () => {
  it('casca retirada antes do 2º ovo: volta para aguardando; depois conclui normalmente', async () => {
    const { EggStep } = await import('../src/systems/steps/EggStep');
    const bus = new EventBus<MapaEventos>();
    const receita: ReceitaResolvida = {
      id: 'o', nome: 'o', produto: 'bolo', corMassa: '#ffffff', dificuldade: 'confeiteiro', ingredientes: ['ovo'], recipientes: [],
      etapas: [{ tipo: 'quebrar_ovo', quantidade: 2, cascaDeOvo: true }],
    };
    const r = new RecipeRunner(receita, bus, { rng: () => 0, tigela: new BowlContents(4) });
    r.iniciar();
    const e = r.controlador as InstanceType<typeof EggStep>;
    r.inicioDoGesto(); e.apoiarNaBorda(); r.fimDoGesto();
    r.inicioDoGesto(); e.toque(0); r.fimDoGesto();
    r.inicioDoGesto(); e.toque(500); if (e.caiuCasca) r.reportarErro('casca'); r.fimDoGesto();
    expect(r.estado.sub).toBe('correcao');
    r.inicioDoGesto(); e.retirarCasca(); r.fimDoGesto(); // colher
    expect(r.estado).toMatchObject({ sub: 'aguardando', erro: null });
    r.inicioDoGesto(); e.apoiarNaBorda(); e.toque(2000); e.toque(2500); if (e.caiuCasca) r.reportarErro('casca'); r.fimDoGesto();
    expect(r.estado.sub).toBe('correcao'); // o 2º ovo também derrubou casca (rng 0)
    r.inicioDoGesto(); e.retirarCasca(); r.fimDoGesto();
    expect(r.estado.sub).toBe('concluida');
  });
});

describe('regra arquitetural: etapas não usam tweens nem timers', () => {
  const dir = join(__dirname, '../src/systems/steps');
  for (const arquivo of readdirSync(dir)) {
    it(arquivo, () => {
      const codigo = readFileSync(join(dir, arquivo), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(codigo).not.toMatch(/tweens|setTimeout|setInterval|time\.delayedCall|requestAnimationFrame|from 'phaser'/);
    });
  }
});
