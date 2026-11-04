/**
 * Teste no navegador do Mundo 3 (Padaria da Praça): torta, biscoitos, brownie e cupcakes,
 * com as mecânicas abrir massa, cortar biscoitos e fatiar.
 * Uso: npm run build && npx vite preview --port 4173 &  node tests/e2e/padaria.cjs [pasta-capturas]
 */
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:4173/?debug';
const PASTA = process.argv[2] || null;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e)));
  let falhas = 0;
  const ok = (c, m) => { console.log((c ? '  ok  ' : '  FALHOU  ') + m); if (!c) falhas++; };
  const foto = async (n) => { if (PASTA) await p.screenshot({ path: `${PASTA}/padaria-${n}.png` }); };
  const st = () => p.evaluate(() => {
    const cenas = window.__jogo.scene.getScenes(true).map((s) => s.scene.key).join(',');
    const a = window.__jogo.scene.getScenes(true).find((s) => s.sessao);
    if (!a) return { cenas };
    const r = a.sessao.runner, k = r.controlador || {};
    return { cenas, cena: a.scene.key, sub: r.estado.sub, tipo: r.etapa && r.etapa.tipo, batidas: k.batidas, espuma: a.sessao.espuma };
  });
  const esperar = async (f, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await st(); if (f(s)) return s; await p.waitForTimeout(100); } return null; };
  /** Completa a etapa atual pelo núcleo (atalho de teste). */
  const pular = async () => {
    const antes = await st();
    await p.evaluate(() => {
      const a = window.__jogo.scene.getScenes(true).find((s) => s.sessao);
      const r = a.sessao.runner, k = r.controlador;
      const seg = { segurando: true, anguloGraus: 60, bicoSobreAlvo: true };
      const area = { x: 0, y: 0, largura: 10, altura: 10 };
      const pintar = (c) => { c.definirSuperficie(area, () => true); for (let y = 0; y <= 10; y++) { c.pintar(0, y); c.pintar(10, y); } };
      r.inicioDoGesto();
      switch (k.tipo) {
        case 'despejar': while (!k.metaAtingida()) k.tick(seg, 16); a.sessao.tigela.adicionar(k.params.item, k.despejado); break;
        case 'quebrar_ovo': for (let j = 0; j < k.quantidade; j++) { k.apoiarNaBorda(); k.toque(j * 1e4); k.toque(j * 1e4 + 500); } while (k.retirarCasca()); break;
        case 'bater': for (let t = 0; !k.metaAtingida() && t < 4000; t++) k.amostra((t % 2) * 100, 0, t * 200, true); break;
        case 'mexer': for (let t = 0; t < 3000 && !k.metaAtingida(); t++) k.amostra(Math.cos(t * 0.3) * 60, Math.sin(t * 0.3) * 60, t * 50); break;
        case 'untar': pintar(k); break;
        case 'despejar_massa': while (!k.metaAtingida()) { const q = k.tick(seg, 16); a.sessao.tigela.removerProporcional(q); a.sessao.forma.massa += q; } break;
        case 'forno': k.colocarForma(); k.tocarPorta(); for (let t = 0; t < 60; t++) k.girarTimer(Math.cos(t * 0.3) * 60, Math.sin(t * 0.3) * 60, 1e6 + t * 50); k.assar(k.duracaoMs); k.tocarPorta(); k.equiparLuva(); k.pegarForma(); k.soltarForma(true); break;
        case 'desenformar': k.colocarPrato(); k.iniciarSwipe(0, 0, 0); k.terminarSwipe(0, 300, 100); break;
        case 'peneirar': for (let t = 0; !k.metaAtingida() && t < 4000; t++) a.sessao.tigela.adicionar(k.item, k.amostra((t % 2) * 160, t * 120, true)); break;
        case 'ralar': for (let t = 0; !k.metaAtingida() && t < 4000; t++) a.sessao.tigela.adicionar(k.item, k.amostra(0, (t % 2) * 100, t * 150, true)); break;
        case 'abrir_massa': k.colocarMassa(); a.sessao.forma.massa = Math.max(0.5, a.sessao.tigela.total); a.sessao.tigela.removerProporcional(a.sessao.tigela.total); for (let t = 0; !k.metaAtingida() && t < 4000; t++) k.amostra(0, (t % 2) * 120, t * 200, true); a.sessao.forma.aberta = 1; break;
        case 'cortar': for (let j = 0; j < 60 && !k.metaAtingida(); j++) { const n = { x: Math.cos(j * 2.4) * Math.sqrt(j / 60) * 0.75, y: Math.sin(j * 2.4) * Math.sqrt(j / 60) * 0.75 }; if (k.cortar(n.x, n.y) === 'cortou') a.sessao.forma.biscoitos.push(n); } a.sessao.forma.sobraRetirada = true; break;
        case 'fatiar': for (let j = 0; j < 6 && !k.metaAtingida(); j++) { const g = j * Math.PI / 3; k.cortar({ x: -Math.cos(g) * 1.1, y: -Math.sin(g) * 1.1 }, { x: Math.cos(g) * 1.1, y: Math.sin(g) * 1.1 }); } break;
        case 'rechear': pintar(k.recheio); k.soltarCamada(0, 0); break;
        case 'decorar':
          pintar(k.cobertura);
          if (k.glace) { k.definirGlace([{ x: 0, y: 0 }, { x: 100, y: 0 }]); for (let x = 0; x <= 100; x += 2) k.tracoGlace.tracar(x, 0); }
          if (k.polvilhador) { const sp = k.polvilhador; sp.definirSuperficie({ x: 0, y: 0, largura: 200, altura: 200 }, () => true); let t = 0; for (let y = 0; y <= 200 && !sp.metaAtingida(); y += 30) for (let x = 0; x <= 200 && !sp.metaAtingida(); x += 30) { sp.fimDoGesto(); for (let i = 0; i < 4; i++) sp.amostra(x + (i % 2 ? 60 : -60), y - 70, (t += 120)); } }
          k.finalizar(); a.sessao.coberturaFinal = k.cobertura.cobertura; break;
      }
      r.fimDoGesto();
    });
    await esperar((s) => s.cenas.includes('Resultado') || (s.sub === 'aguardando' && (s.tipo !== antes.tipo || s.cena !== antes.cena) && s.cenas.includes(s.cena)), 20000);
    await p.waitForTimeout(300);
  };
  const pularAte = async (tipo) => {
    for (let i = 0; i < 40 && (await st()).tipo !== tipo; i++) await pular();
    await esperar((s) => s.tipo === tipo && s.sub === 'aguardando' && s.cenas.split(',').includes(s.cena), 20000);
    await p.waitForTimeout(700);
  };
  const abrirFase = async (id, mundo, modo = 'facil') => {
    await p.evaluate((mundo) => {
      // sempre reabre: fecha janelas abertas e relê o progresso/preferências
      const g = window.__jogo.scene;
      if (g.isActive('Trilha')) { g.getScene('Trilha').scene.restart({ mundo }); return; }
      for (const s of g.getScenes(true)) s.scene.stop();
      g.start('Trilha', { mundo });
    }, mundo);
    await p.waitForFunction((id) => { const t = window.__jogo.scene.getScene('Trilha'); return t.scene.isActive() && t.children.getByName(id); }, id, { timeout: 20000 });
    await p.waitForTimeout(400);
    const c = await p.evaluate((id) => { const o = window.__jogo.scene.getScene('Trilha').children.getByName(id); return { x: o.x, y: o.y }; }, id);
    await p.mouse.click(c.x, c.y); await p.waitForTimeout(500);
    await p.mouse.click(modo === 'facil' ? 470 : 810, 400); await p.waitForTimeout(1500);
  };

  /** Sequência de pontos com o dedo apertado, disparada no mesmo turno (headless é lento demais p/ "sacudir"). */
  const rajada = (pts, dtMs = 130) => p.evaluate(({ pts, dtMs }) => {
    const cv = document.querySelector('canvas'); const r = cv.getBoundingClientRect();
    for (const q of pts) {
      const t0 = performance.now(); while (performance.now() - t0 < dtMs) {}
      cv.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.left + q[0], clientY: r.top + q[1], buttons: 1 }));
    }
  }, { pts, dtMs });
  const ladoALado = (x, y, n, amp) => Array.from({ length: n }, (_, k) => [x + (k % 2 ? amp : -amp), y]);
  const sobeDesce = (x, y, n, amp) => Array.from({ length: n }, (_, k) => [x, y + (k % 2 ? amp : -amp)]);
  const ctrl = (campo) => p.evaluate((campo) => { const a = window.__jogo.scene.getScenes(true).find((s) => s.sessao); const k = a.sessao.runner.controlador; return campo.split('.').reduce((o, c) => o && o[c], k); }, campo);
  const cenaAtiva = (k) => p.evaluate((k) => window.__jogo.scene.isActive(k), k);

  const perfil = "localStorage.setItem('meu-bolinho:perfis:v1', JSON.stringify({ perfis: [{ id: 'p', nome: 'Teo', avatar: 'leao', criadoEm: '2026-01-01T00:00:00Z' }], atual: 'p' }))";
  await p.goto(BASE); await p.waitForTimeout(1500);
  await p.evaluate((perfil) => { localStorage.clear(); eval(perfil); localStorage.setItem('meu-bolinho:preferencias:v1', JSON.stringify({ liberarFases: true })); }, perfil);
  await p.reload(); await p.waitForTimeout(1500);
  const forma = () => p.evaluate(() => { const f = window.__jogo.scene.getScene('Cozinha').sessao.forma; return { massa: f.massa, aberta: f.aberta, biscoitos: f.biscoitos.length, sobra: f.sobraRetirada }; });

  console.log('Mundo 3: Padaria da Praça');
  await p.evaluate(() => { const g = window.__jogo.scene; for (const s of g.getScenes(true)) s.scene.stop(); g.start('Trilha', { mundo: 2 }); });
  await p.waitForFunction(() => window.__jogo.scene.getScene('Trilha').children.getByName('brownie'), null, { timeout: 20000 });
  await p.waitForTimeout(600);
  ok((await p.evaluate(() => window.__jogo.scene.getScene('Trilha').mundo)) === 2, 'trilha mostra o mundo 3');
  await foto('01-trilha-mundo3');

  console.log('Mecânica nova: abrir a massa com o rolo (Torta de Morango)');
  await abrirFase('torta_morango', 2);
  await pularAte('abrir_massa');
  await foto('02-abrir-bola');
  // rolar sem a massa na forma: o rolo nem aparece; nada abre
  await p.mouse.move(830, 470); await p.mouse.down(); await rajada(sobeDesce(830, 470, 10, 70)); await p.mouse.up();
  ok((await ctrl('passadas')) === 0, 'sem levar a massa até a forma, nada abre');
  const bola = await p.evaluate(() => { const b = window.__jogo.scene.getScene('Cozinha').bola; return { x: b.x, y: b.y }; });
  await p.mouse.move(bola.x, bola.y); await p.mouse.down(); await p.mouse.move(600, 300, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(600);
  ok(!(await ctrl('massaNaForma')), 'soltar a massa longe da forma: ela volta');
  await p.mouse.move(bola.x, bola.y); await p.mouse.down(); await p.mouse.move(830, 470, { steps: 12 }); await p.mouse.up(); await p.waitForTimeout(600);
  ok(await ctrl('massaNaForma'), 'massa levada até a forma');
  ok((await forma()).aberta === 0, 'a massa chega como bola (ainda fechada)');
  await p.mouse.move(830, 470); await p.mouse.down(); await p.waitForTimeout(1500);
  ok((await ctrl('passadas')) === 0, 'segurar o rolo parado não abre');
  await rajada(ladoALado(830, 470, 6, 4));
  ok((await ctrl('passadas')) === 0, 'tremer o rolo não abre');
  await rajada(sobeDesce(830, 470, 6, 60), 220); // ritmo de rolo (~4 passadas por segundo)
  const pa = await ctrl('passadas');
  ok(pa >= 3, `passadas para a frente e para trás abrem a massa (${pa})`);
  await p.waitForTimeout(1500);
  ok((await ctrl('passadas')) === pa, 'parou de rolar: a massa parou de abrir');
  await foto('03-abrir-meio');
  await rajada(sobeDesce(830, 470, 20, 60), 220);
  await p.mouse.up(); await p.waitForTimeout(500);
  ok((await esperar((s) => s.tipo !== 'abrir_massa', 8000)) !== null, 'massa aberta: etapa concluída');
  await pularAte('forno'); await p.waitForTimeout(600);
  await foto('04-torta-forno');
  await pularAte('decorar'); await p.waitForTimeout(600);
  await foto('05-torta-prato');

  console.log('Mecânica nova: cortar biscoitos (Biscoitos Amanteigados)');
  await abrirFase('biscoitos', 2);
  await pularAte('cortar');
  const soltarCortador = async (x, y) => { await p.mouse.move(1120, 400); await p.mouse.down(); await p.mouse.move(x, y, { steps: 8 }); await p.waitForTimeout(150); await p.mouse.up(); await p.waitForTimeout(500); };
  await soltarCortador(1000, 470);
  ok((await ctrl('biscoitos.length')) === 0, 'soltar o cortador fora da massa não corta');
  await soltarCortador(830, 470);
  ok((await ctrl('biscoitos.length')) === 1, 'soltar em cima da massa corta um biscoito ali');
  await soltarCortador(840, 474);
  ok((await ctrl('biscoitos.length')) === 1, 'encostado num biscoito já cortado não corta');
  await foto('06-cortar-um');
  for (const [x, y] of [[740, 430], [920, 430], [740, 515], [920, 515], [830, 400], [830, 540], [700, 470], [960, 470]]) {
    if ((await st()).tipo !== 'cortar') break;
    await soltarCortador(x, y);
  }
  const fb = await forma();
  ok(fb.biscoitos >= 6 && fb.sobra, `biscoitos cortados onde a criança soltou (${fb.biscoitos}); a sobra de massa sai`);
  await foto('07-cortar-fim');
  await pularAte('decorar'); await p.waitForTimeout(600);
  const pecas = await p.evaluate(() => window.__jogo.scene.getScene('Confeitar').bolo.geometria.pecas.length);
  ok(pecas === fb.biscoitos, `no prato estão os mesmos ${pecas} biscoitos cortados`);
  await foto('08-biscoitos-prato');

  console.log('Mecânica nova: fatiar (Brownie)');
  await abrirFase('brownie', 2);
  await pularAte('fatiar');
  await foto('09-fatiar-inicio');
  const topo = await p.evaluate(() => { const b = window.__jogo.scene.getScene('Confeitar').bolo; return { x: b.topo.x, y: b.topo.y, rx: b.geometria.rx, ry: b.geometria.ry }; });
  const faca = async (x0, y0, x1, y1) => { await p.mouse.move(x0, y0); await p.mouse.down(); await p.mouse.move(x1, y1, { steps: 14 }); await p.mouse.up(); await p.waitForTimeout(400); };
  await faca(topo.x - 60, topo.y, topo.x + 60, topo.y);
  ok((await ctrl('cortes.length')) === 0, 'traço curto no meio não fatia');
  await faca(topo.x - topo.rx * 1.2, topo.y + topo.ry * 0.7, topo.x + topo.rx * 1.2, topo.y + topo.ry * 0.7);
  ok((await ctrl('cortes.length')) === 0, 'atravessar longe do meio não fatia');
  await faca(topo.x - topo.rx * 1.2, topo.y, topo.x + topo.rx * 1.2, topo.y);
  ok((await ctrl('cortes.length')) === 1, 'atravessar de ponta a ponta pelo meio fatia');
  await faca(topo.x + topo.rx * 1.2, topo.y + 5, topo.x - topo.rx * 1.2, topo.y - 5);
  ok((await ctrl('cortes.length')) === 1, 'repetir o mesmo corte não conta');
  await foto('10-fatiar-um');
  await faca(topo.x, topo.y - topo.ry * 1.3, topo.x, topo.y + topo.ry * 1.3);
  await esperar((s) => s.cenas.includes('Resultado'), 20000); await p.waitForTimeout(3000);
  await foto('11-brownie-resultado');
  ok((await st()).cenas.includes('Resultado'), 'dois cortes: brownie em 4 fatias, vai para o resultado');
  const ft = await p.evaluate(() => { const r = window.__jogo.scene.getScene('Resultado'); return !!r.sessao.fotoUrl; });
  ok(ft, 'a foto da galeria é do brownie já fatiado');

  console.log('Cupcakes');
  await abrirFase('cupcakes', 2);
  await pularAte('forno'); await p.waitForTimeout(600);
  await foto('12-cupcakes-forno');
  await pularAte('decorar'); await p.waitForTimeout(600);
  await foto('13-cupcakes-prato');
  const entre = await p.evaluate(() => { const b = window.__jogo.scene.getScene('Confeitar').bolo; const [a, c] = b.geometria.pecas; return b.noTopo({ x: (a.cx + c.cx) / 2, y: a.cy }); });
  ok(!entre, 'o espaço entre os cupcakes não é "topo" (cobertura só em cima deles)');

  ok(erros.length === 0, 'sem erros de página ' + erros.join(' | '));
  console.log(falhas ? `PADARIA: ${falhas} falha(s)` : 'PADARIA: tudo ok');
  await b.close();
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.log('ERRO', e); process.exit(1); });
