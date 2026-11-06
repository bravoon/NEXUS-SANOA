/**
 * Teste no navegador dos perfis de jogador e do mundo 2 (peneirar, ralar, polvilhar).
 * Uso: npm run build && npx vite preview --port 4173 &  node tests/e2e/mundo2.cjs [pasta-capturas]
 * Etapas fora do foco são avançadas pelo núcleo; perfis e mecânicas novas usam input real.
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
  const foto = async (n) => { if (PASTA) await p.screenshot({ path: `${PASTA}/mundo2-${n}.png` }); };
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

  await p.goto(BASE); await p.waitForTimeout(1500);
  await p.evaluate(() => localStorage.clear());
  await p.reload(); await p.waitForTimeout(1500);

  console.log('Perfis: "Quem vai jogar?" (sem senha, só neste aparelho)');
  await p.mouse.click(530, 570); await p.waitForTimeout(800); // Jogar
  ok(await cenaAtiva('NovoPerfil'), 'sem perfis, "Jogar" abre a criação de jogador');
  await foto('01-escolher-bichinho');
  await p.mouse.click(295, 250); await p.waitForTimeout(800); // coelho
  for (const [x, y] of [[190, 290], [490, 390], [190, 290]]) { await p.mouse.click(x, y); await p.waitForTimeout(120); } // A N A
  ok((await p.evaluate(() => window.__jogo.scene.getScene('NovoPerfil').nome)) === 'Ana', 'teclado de letras grandes escreve o nome (Ana)');
  await foto('02-nome');
  await p.mouse.click(700, 655); await p.waitForTimeout(1200); // Pronto
  const perfis1 = await p.evaluate(() => JSON.parse(localStorage.getItem('meu-bolinho:perfis:v1')));
  ok(perfis1.perfis.length === 1 && perfis1.perfis[0].nome === 'Ana' && perfis1.perfis[0].avatar === 'coelho', 'perfil criado: coelho "Ana"');
  ok(await cenaAtiva('Trilha'), 'depois de criar, vai direto para a trilha');
  const ana = perfis1.perfis[0].id;
  await foto('03-trilha-ana');

  await abrirFase('fofinho', 0);
  for (let i = 0; i < 30 && !(await st()).cenas.includes('Resultado'); i++) await pular();
  await esperar((s) => s.cenas.includes('Resultado'), 20000); await p.waitForTimeout(2500);
  const chaveAna = `meu-bolinho:trilha:v1@${ana}`;
  ok((await p.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}').fofinho, chaveAna)) >= 1, 'estrelas da fase 1 gravadas no perfil da Ana');
  await p.mouse.click(310, 660); await p.waitForTimeout(1200); // ▶ Trilha

  await p.mouse.click(190, 48); await p.waitForTimeout(800); // avatar → trocar
  ok(await cenaAtiva('Perfis'), 'tocar no avatar da trilha abre "Quem vai jogar?"');
  const novo = await p.evaluate(() => { const o = window.__jogo.scene.getScene('Perfis').children.getByName('perfil:novo'); return { x: o.x, y: o.y }; });
  await p.mouse.click(novo.x, novo.y); await p.waitForTimeout(800);
  await p.mouse.click(525, 250); await p.waitForTimeout(800); // gato
  await p.mouse.click(700, 655); await p.waitForTimeout(1200); // Pronto sem nome
  const perfis2 = await p.evaluate(() => JSON.parse(localStorage.getItem('meu-bolinho:perfis:v1')));
  const gato = perfis2.perfis.find((x) => x.avatar === 'gato');
  ok(perfis2.perfis.length === 2 && gato && perfis2.atual === gato.id, 'segundo jogador (Gatinho) criado e jogando');
  const trancada = await p.evaluate(() => { const t = window.__jogo.scene.getScene('Trilha'); const o = t.children.getByName('chocolate'); return { x: o.x, y: o.y }; });
  await p.mouse.click(trancada.x, trancada.y); await p.waitForTimeout(500);
  ok(!(await p.evaluate(() => !!window.__jogo.scene.getScene('Trilha').popup)), 'Gatinho começa do zero: a fase 2 dele está trancada');
  await foto('04-trilha-gatinho');

  await p.mouse.click(190, 48); await p.waitForTimeout(800);
  await foto('05-quem-vai-jogar');
  const cAna = await p.evaluate((id) => { const o = window.__jogo.scene.getScene('Perfis').children.getByName(`perfil:${id}`); return { x: o.x, y: o.y }; }, ana);
  await p.mouse.click(cAna.x, cAna.y); await p.waitForTimeout(1000);
  const c2 = await p.evaluate(() => { const o = window.__jogo.scene.getScene('Trilha').children.getByName('chocolate'); return { x: o.x, y: o.y }; });
  await p.mouse.click(c2.x, c2.y); await p.waitForTimeout(500);
  ok(await p.evaluate(() => !!window.__jogo.scene.getScene('Trilha').popup), 'de volta à Ana: a fase 2 dela está liberada');

  await p.reload(); await p.waitForTimeout(1500);
  ok((await p.evaluate(() => window.__jogo.scene.getScene('Menu').children.getByName('jogador') !== null)), 'ao reabrir o jogo, o menu mostra quem está jogando');
  await p.mouse.click(530, 570); await p.waitForTimeout(800);
  ok(await cenaAtiva('Trilha'), 'com jogador escolhido, "Jogar" vai direto para a trilha');

  // área dos pais: apagar um perfil exige segurar a lixeira 2 s
  await p.evaluate(() => { const g = window.__jogo.scene; for (const s of g.getScenes(true)) s.scene.stop(); g.start('Perfis', { gerenciar: true }); });
  await p.waitForTimeout(800);
  await foto('06-pais-perfis');
  const lix = await p.evaluate((id) => { const o = window.__jogo.scene.getScene('Perfis').children.getByName(`perfil:${id}`); return { x: o.x + (115 - 20) * o.scaleX, y: o.y - (135 - 20) * o.scaleY }; }, gato.id);
  await p.mouse.move(lix.x, lix.y); await p.mouse.down(); await p.waitForTimeout(600); await p.mouse.up(); await p.waitForTimeout(400);
  ok((await p.evaluate(() => JSON.parse(localStorage.getItem('meu-bolinho:perfis:v1')).perfis.length)) === 2, 'toque rápido na lixeira não apaga');
  await p.mouse.move(lix.x, lix.y); await p.mouse.down(); await p.waitForTimeout(2400); await p.mouse.up(); await p.waitForTimeout(800);
  const restantes = await p.evaluate(() => JSON.parse(localStorage.getItem('meu-bolinho:perfis:v1')).perfis.map((x) => x.nome || x.avatar));
  ok(restantes.length === 1 && restantes[0] === 'Ana', `segurar 2 s apaga o perfil (restou: ${restantes.join(', ')})`);
  ok((await p.evaluate((id) => Object.keys(localStorage).some((k) => k.endsWith('@' + id)), gato.id)) === false, 'os dados do perfil apagado somem junto');

  console.log('Mundo 2: trancado até terminar o mundo 1');
  await abrirFase('fofinho', 0);
  await p.evaluate(() => { const g = window.__jogo.scene; for (const s of g.getScenes(true)) s.scene.stop(); g.start('Trilha'); });
  await p.waitForTimeout(800);
  await p.mouse.click(1230, 400); await p.waitForTimeout(600);
  ok((await p.evaluate(() => window.__jogo.scene.getScene('Trilha').mundo)) === 0, 'seta do mundo 2 com cadeado não abre');
  // área dos pais libera tudo daqui em diante
  await p.evaluate(() => { const pr = JSON.parse(localStorage.getItem('meu-bolinho:preferencias:v1') || '{}'); pr.liberarFases = true; localStorage.setItem('meu-bolinho:preferencias:v1', JSON.stringify(pr)); });
  await p.evaluate(() => window.__jogo.scene.getScene('Trilha').scene.restart());
  await p.waitForTimeout(800);
  await p.mouse.click(1230, 400); await p.waitForTimeout(800);
  ok((await p.evaluate(() => window.__jogo.scene.getScene('Trilha').mundo)) === 1, 'com o mundo liberado, a seta ▶ mostra o mundo 2');
  await foto('07-mundo2');

  console.log('Mecânica nova: peneirar (fase Bolo de Fubá)');
  await abrirFase('fuba', 1);
  await pularAte('peneirar');
  await foto('08-peneirar-inicio');
  // sacudir longe da tigela não derruba nada
  await p.mouse.move(1110, 300); await p.mouse.down(); await p.mouse.move(1100, 250, { steps: 4 }); await p.waitForTimeout(500);
  await rajada(ladoALado(1100, 250, 16, 60));
  ok((await ctrl('sacudidas')) === 0, 'sacudir a peneira longe da tigela: nada cai');
  await p.mouse.move(760, 270, { steps: 12 }); await p.waitForTimeout(1200);
  ok((await ctrl('sacudidas')) === 0, 'levar até a tigela sem sacudir: nada cai');
  await rajada(ladoALado(760, 270, 10, 60));
  const s1 = await ctrl('sacudidas');
  ok(s1 >= 2, `sacudir sobre a tigela peneira (${s1} sacudidas)`);
  await p.waitForTimeout(1500);
  ok((await ctrl('sacudidas')) === s1, 'parou de sacudir: parou de cair');
  await foto('09-peneirar-meio');
  await rajada(ladoALado(760, 270, 30, 60));
  await p.mouse.up(); await p.waitForTimeout(600);
  ok((await esperar((s) => s.tipo !== 'peneirar', 8000)) !== null, 'farinha toda peneirada: etapa concluída');
  const tig = await p.evaluate(() => window.__jogo.scene.getScene('Cozinha').sessao.tigela.quantidadeDe('fuba'));
  ok(Math.abs(tig - 1) < 0.01, `a medida certa caiu na tigela (${tig.toFixed(2)} xíc de fubá)`);

  console.log('Mecânica nova: ralar (fase Bolo de Coco)');
  await abrirFase('coco', 1);
  await pularAte('ralar');
  await foto('10-ralar-inicio');
  await p.mouse.move(1110, 420); await p.mouse.down(); await p.mouse.move(770, 310, { steps: 12 }); await p.waitForTimeout(400);
  await rajada(ladoALado(770, 310, 16, 60));
  ok((await ctrl('raladas')) === 0, 'esfregar de lado no ralador não rala');
  await rajada(sobeDesce(1000, 450, 16, 60));
  ok((await ctrl('raladas')) === 0, 'esfregar longe do ralador não rala');
  await rajada(sobeDesce(770, 310, 8, 60));
  const r1 = await ctrl('raladas');
  ok(r1 >= 3, `passadas para cima e para baixo no ralador ralam (${r1})`);
  await p.waitForTimeout(1500);
  ok((await ctrl('raladas')) === r1, 'parou de esfregar: parou de ralar');
  await foto('11-ralar-meio');
  await rajada(sobeDesce(770, 310, 30, 60));
  await p.mouse.up(); await p.waitForTimeout(600);
  ok((await esperar((s) => s.tipo !== 'ralar', 8000)) !== null, 'coco todo ralado: etapa concluída');

  console.log('Mecânica nova: polvilhar (fase Bolo de Limão)');
  await abrirFase('limao', 1);
  await pularAte('decorar');
  await p.mouse.move(450, 300); await p.mouse.down();
  for (let y = 285, l = 0; y <= 440; y += 12, l ^= 1) await p.mouse.move(l ? 440 : 840, y, { steps: 5 });
  await p.mouse.up(); await p.waitForTimeout(800);
  ok((await ctrl('fase')) === 'polvilhar', 'depois da cobertura vem o polvilho');
  ok(!(await p.evaluate(() => window.__jogo.scene.getScene('Confeitar').botaoPronto.visible)), '"Pronto!" ainda não aparece');
  await foto('12-polvilhar-inicio');
  const pv = await p.evaluate(() => { const o = window.__jogo.scene.getScene('Confeitar').polvilhador; return { x: o.x, y: o.y }; });
  const topo = await p.evaluate(() => window.__jogo.scene.getScene('Confeitar').bolo.topo);
  await p.mouse.move(pv.x, pv.y); await p.mouse.down();
  await p.mouse.move(topo.x - 150, topo.y - 70, { steps: 10 }); await p.mouse.move(topo.x + 150, topo.y - 70, { steps: 20 }); await p.waitForTimeout(300);
  ok((await ctrl('polvilhador.cobertura')) === 0, 'passear com o polvilhador sem sacudir não polvilha');
  await rajada(ladoALado(topo.x + 600, topo.y - 70, 12, 40));
  ok((await ctrl('polvilhador.sacudidas')) === 0, 'sacudir fora do bolo não polvilha');
  await rajada(ladoALado(topo.x, topo.y - 70, 8, 40));
  const pc = await ctrl('polvilhador.cobertura');
  ok(pc > 0, `sacudir em cima do bolo polvilha (${(pc * 100).toFixed(0)}%)`);
  await foto('13-polvilhar-meio');
  for (const dx of [-150, -90, -30, 30, 90, 150]) for (const dy of [-50, -20, 20, 50]) {
    if ((await ctrl('fase')) !== 'polvilhar') break;
    await rajada([[topo.x + dx, topo.y + dy - 70], ...ladoALado(topo.x + dx, topo.y + dy - 70, 5, 30)]);
  }
  await p.mouse.up(); await p.waitForTimeout(800);
  const dep = await p.evaluate(() => { const c = window.__jogo.scene.getScene('Confeitar'); return { fase: c.sessao.runner.controlador.fase, pronto: c.botaoPronto.visible }; });
  ok(dep.fase === 'enfeitar' && dep.pronto, 'bolo polvilhado: libera enfeites e "Pronto!"');
  await foto('14-polvilhado');
  for (const [x, y] of [[560, 340], [700, 360], [630, 395]]) { await p.mouse.move(470, 650); await p.mouse.down(); await p.mouse.move(x, y, { steps: 6 }); await p.mouse.up(); }
  await p.mouse.click(1060, 650);
  await esperar((s) => s.cenas.includes('Resultado'), 20000); await p.waitForTimeout(3000);
  await foto('15-resultado');
  ok((await p.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}').limao, chaveAna)) >= 1, 'estrelas do Bolo de Limão gravadas no perfil da Ana');

  ok(erros.length === 0, 'sem erros de página ' + erros.join(' | '));
  console.log(falhas ? `MUNDO2: ${falhas} falha(s)` : 'MUNDO2: tudo ok');
  await b.close();
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.log('ERRO', e); process.exit(1); });
