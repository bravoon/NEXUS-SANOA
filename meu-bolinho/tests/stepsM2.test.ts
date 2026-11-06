import { describe, expect, it } from 'vitest';
import { Decoracao, type Enfeite } from '../src/systems/decoration/Decoracao';
import { DecorStep } from '../src/systems/steps/DecorStep';
import { EggStep } from '../src/systems/steps/EggStep';
import { OvenStep } from '../src/systems/steps/OvenStep';
import { PourOutStep } from '../src/systems/steps/PourOutStep';
import { UnmoldStep } from '../src/systems/steps/UnmoldStep';
import { circulo } from './helpers';

describe('EggStep', () => {
  it('precisa estar na borda; 1º toque trinca, 2º abre', () => {
    const e = new EggStep(1, false);
    expect(e.toque(0)).toBe('fora_da_borda');
    expect(e.apoiarNaBorda()).toBe(true);
    expect(e.toque(1000)).toBe('trincou');
    expect(e.toque(1100)).toBe('ignorado'); // cooldown de 300 ms
    expect(e.estadoOvo).toBe('trincado');
    expect(e.toque(1400)).toBe('abriu');
    expect(e.metaAtingida()).toBe(true);
  });

  it('vários ovos: cada um volta a exigir borda + 2 toques', () => {
    const e = new EggStep(2, false);
    e.apoiarNaBorda(); e.toque(0); e.toque(400);
    expect(e.metaAtingida()).toBe(false);
    expect(e.toque(800)).toBe('fora_da_borda');
    e.apoiarNaBorda(); e.toque(1200); e.toque(1600);
    expect(e.ovosAbertos).toBe(2);
    expect(e.metaAtingida()).toBe(true);
    expect(e.apoiarNaBorda()).toBe(false);
  });

  it('modo Confeiteiro: casca bloqueia até ser retirada', () => {
    const e = new EggStep(1, true, () => 0); // rng 0 → sempre cai casca
    e.apoiarNaBorda(); e.toque(0); e.toque(400);
    expect(e.caiuCasca).toBe(true);
    expect(e.metaAtingida()).toBe(false);
    expect(e.retirarCasca()).toBe(true);
    expect(e.retirarCasca()).toBe(false);
    expect(e.metaAtingida()).toBe(true);
  });

  it('modo Fácil nunca derruba casca', () => {
    const e = new EggStep(3, false, () => 0);
    for (let i = 0; i < 3; i++) { e.apoiarNaBorda(); e.toque(i * 1000); e.toque(i * 1000 + 400); }
    expect(e.cascasNaTigela).toBe(0);
  });

  it('tirar da borda antes de trincar devolve o ovo à caixa', () => {
    const e = new EggStep(1, false);
    e.apoiarNaBorda();
    e.tirarDaBorda();
    expect(e.toque(0)).toBe('fora_da_borda');
  });
});

describe('PourOutStep', () => {
  const segurando = { segurando: true, anguloGraus: 90, bicoSobreAlvo: true };

  it('esvazia só segurando e com o bico sobre a forma; meta < 5%', () => {
    const p = new PourOutStep(2, 0.05);
    p.tick({ ...segurando, segurando: false }, 5000);
    p.tick({ ...segurando, bicoSobreAlvo: false }, 5000);
    expect(p.restante).toBe(2);
    while (!p.metaAtingida()) p.tick(segurando, 16);
    expect(p.fracaoRestante).toBeLessThan(0.05);
    expect(p.progresso).toBe(1);
  });

  it('massa é viscosa: mais lenta que a vazão de pó', () => {
    const p = new PourOutStep(2, 0.05);
    p.tick(segurando, 1000);
    expect(p.despejado).toBeCloseTo(0.3);
  });

  it('tigela vazia não pode iniciar a etapa', () => {
    expect(() => new PourOutStep(0, 0.05)).toThrow();
  });
});

describe('OvenStep', () => {
  const girarUmaVolta = (o: OvenStep) => {
    for (const a of circulo({ raio: 60, voltas: 1.2, duracaoMs: 1200 })) o.girarTimer(a.x, a.y, a.t);
  };

  it('fases avançam só por input; assar é a única fase por tempo', () => {
    const o = new OvenStep(20);
    o.assar(60_000);
    expect(o.fase).toBe('colocar');
    expect(o.tocarPorta()).toBe('nada');
    o.colocarForma();
    expect(o.fase).toBe('fechar');
    expect(o.tocarPorta()).toBe('fechou');
    o.assar(60_000);
    expect(o.fase).toBe('timer'); // sem girar o timer, não assa
    girarUmaVolta(o);
    expect(o.fase).toBe('assando');
    expect(o.voltasTimer).toBe(1); // limitado a 1 volta
    o.assar(10_000);
    expect(o.progressoAssar).toBeCloseTo(0.5);
    o.assar(10_000);
    expect(o.fase).toBe('apitou');
  });

  it('meia volta no timer não liga o forno', () => {
    const o = new OvenStep(20);
    o.colocarForma(); o.tocarPorta();
    for (const a of circulo({ raio: 60, voltas: 0.6, duracaoMs: 600 })) o.girarTimer(a.x, a.y, a.t);
    o.soltarTimer();
    expect(o.fase).toBe('timer');
  });

  it('forma não pode ser retirada sem luva', () => {
    const o = new OvenStep(15);
    o.colocarForma(); o.tocarPorta(); girarUmaVolta(o); o.assar(15_000);
    expect(o.pegarForma()).toBe('fechado');
    expect(o.tocarPorta()).toBe('abriu');
    expect(o.pegarForma()).toBe('quente');
    expect(o.metaAtingida()).toBe(false);
    o.equiparLuva();
    expect(o.pegarForma()).toBe('ok');
    o.soltarForma(false); // soltou fora da bancada
    expect(o.metaAtingida()).toBe(false);
    expect(o.pegarForma()).toBe('ok');
    o.soltarForma(true);
    expect(o.metaAtingida()).toBe(true);
  });

  it('tempo de forno limitado a 15–25 s', () => {
    expect(new OvenStep(5).duracaoMs).toBe(15_000);
    expect(new OvenStep(99).duracaoMs).toBe(25_000);
  });
});

describe('UnmoldStep', () => {
  it('sem prato não desenforma; swipe fraco desfaz a virada', () => {
    const u = new UnmoldStep();
    expect(u.iniciarSwipe(0, 0, 0)).toBe(false);
    u.colocarPrato();
    u.iniciarSwipe(0, 0, 0);
    expect(u.moverSwipe(0, 75, 1000)).toBeCloseTo(0.5);
    expect(u.terminarSwipe(0, 200, 2000)).toBe('lento');
    expect(u.progressoVirada).toBe(0);
    expect(u.metaAtingida()).toBe(false);
    u.iniciarSwipe(0, 0, 3000);
    u.moverSwipe(0, 100, 3100);
    expect(u.terminarSwipe(0, 200, 3200)).toBe('ok');
    expect(u.metaAtingida()).toBe(true);
  });
});

describe('Decoracao e DecorStep', () => {
  const e = (tipo: Enfeite['tipo'] = 'confeito'): Enfeite => ({ tipo, x: 0, y: 0, rot: 0, cor: 0 });

  it('desfazer remove a última ação inteira (porção de granulado)', () => {
    const d = new Decoracao();
    d.adicionar([e('vela')]);
    d.adicionar([e('granulado'), e('granulado'), e('granulado')]);
    expect(d.total).toBe(4);
    expect(d.desfazer()).toHaveLength(3);
    expect(d.itens.map((i) => i.tipo)).toEqual(['vela']);
  });

  it('respeita o máximo de itens', () => {
    const d = new Decoracao(5);
    d.adicionar([e(), e(), e(), e()]);
    d.adicionar([e(), e(), e()]);
    expect(d.total).toBe(5);
    expect(d.adicionar([e()])).toBe(false);
  });

  it('"Pronto!" só vale depois da cobertura mínima', () => {
    const s = new DecorStep(0.8, 0x5a3220);
    const area = { x: 0, y: 0, largura: 100, altura: 100 };
    s.cobertura.definirSuperficie(area, () => true);
    expect(s.finalizar()).toBe(false);
    s.cobertura.pintar(50, 50);
    s.cobertura.pintar(50, 50);
    for (let y = 0; y <= 100; y += 10) { s.cobertura.pintar(0, y); s.cobertura.pintar(100, y); s.fimDoGesto(); }
    expect(s.coberturaOk).toBe(true);
    expect(s.metaAtingida()).toBe(false);
    expect(s.finalizar()).toBe(true);
    expect(s.metaAtingida()).toBe(true);
  });
});
