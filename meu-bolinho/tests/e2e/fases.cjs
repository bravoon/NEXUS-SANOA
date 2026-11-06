/**
 * Teste no navegador da trilha de fases e das mecânicas novas (bater, rechear, glacê).
 * Uso: npm run build && npx vite preview --port 4173 &  node tests/e2e/fases.cjs [pasta-capturas]
 * Etapas fora do foco são avançadas pelo núcleo; as mecânicas novas usam input real.
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
  const foto = async (n) => { if (PASTA) await p.screenshot({ path: `${PASTA}/fases-${n}.png` }); };
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
        case 'rechear': pintar(k.recheio); k.soltarCamada(0, 0); break;
        case 'decorar':
          pintar(k.cobertura);
          if (k.glace) { k.definirGlace([{ x: 0, y: 0 }, { x: 100, y: 0 }]); for (let x = 0; x <= 100; x += 2) k.tracoGlace.tracar(x, 0); }
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
  const abrirFase = async (id, modo = 'facil') => {
    await p.evaluate(() => {
      // sempre reabre: fecha janelas abertas e relê o progresso/preferências
      const g = window.__jogo.scene;
      if (g.isActive('Trilha')) { g.getScene('Trilha').scene.restart({ mundo: 0 }); return; }
      for (const s of g.getScenes(true)) s.scene.stop();
      g.start('Trilha', { mundo: 0 });
    });
    await p.waitForFunction((id) => { const t = window.__jogo.scene.getScene('Trilha'); return t.scene.isActive() && t.children.getByName(id); }, id, { timeout: 20000 });
    await p.waitForTimeout(400);
    const c = await p.evaluate((id) => { const o = window.__jogo.scene.getScene('Trilha').children.getByName(id); return { x: o.x, y: o.y }; }, id);
    await p.mouse.click(c.x, c.y); await p.waitForTimeout(500);
    await p.mouse.click(modo === 'facil' ? 470 : 810, 400); await p.waitForTimeout(1500);
  };
  /** Vai e vem rápido (eventos no mesmo turno: o headless é lento demais para a velocidade mínima). */
  const vaiEVem = (x, y, n, amplitude) => p.evaluate(({ x, y, n, amplitude }) => {
    const cv = document.querySelector('canvas'); const r = cv.getBoundingClientRect();
    for (let k = 0; k < n; k++) {
      const t0 = performance.now(); while (performance.now() - t0 < 130) {} // ~8 traços/s: criança batendo rápido
      cv.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.left + x + (k % 2 ? amplitude : -amplitude), clientY: r.top + y, buttons: 1 }));
    }
  }, { x, y, n, amplitude });

  await p.goto(BASE); await p.waitForTimeout(1500);
  await p.evaluate(() => {
    localStorage.clear();
    // jogador de teste (a criação de perfil é coberta por tests/e2e/mundo2.cjs)
    localStorage.setItem('meu-bolinho:perfis:v1', JSON.stringify({ perfis: [{ id: 'f', nome: 'Teste', avatar: 'urso', criadoEm: '2026-01-01T00:00:00Z' }], atual: 'f' }));
  });
  await p.reload(); await p.waitForTimeout(1500);

  console.log('Trilha: desbloqueio ao terminar');
  await p.mouse.click(530, 570); await p.waitForTimeout(1200);
  const trancada = await p.evaluate(() => { const t = window.__jogo.scene.getScene('Trilha'); return t.children.getByName('chocolate') !== null; });
  ok(trancada, 'trilha aberta com as fases');
  await abrirFase('fofinho');
  for (let i = 0; i < 30 && !(await st()).cenas.includes('Resultado'); i++) await pular();
  await esperar((s) => s.cenas.includes('Resultado'), 20000); await p.waitForTimeout(2800);
  await foto('01-resultado-fase1');
  const estrelas = await p.evaluate(() => JSON.parse(localStorage.getItem('meu-bolinho:trilha:v1@f') || '{}'));
  ok(estrelas.fofinho >= 1, `estrelas da fase 1 registradas: ${estrelas.fofinho}`);
  await p.mouse.click(310, 660); await p.waitForTimeout(1500); // ▶ Trilha
  ok((await st()).cenas.includes('Trilha'), 'botão Trilha volta para a trilha');
  await foto('02-trilha-fase2-liberada');
  // a fase 2 abre (liberada); a 3 ainda não
  const c3 = await p.evaluate(() => { const o = window.__jogo.scene.getScene('Trilha').children.getByName('laranja'); return { x: o.x, y: o.y }; });
  await p.mouse.click(c3.x, c3.y); await p.waitForTimeout(500);
  ok(!(await p.evaluate(() => !!window.__jogo.scene.getScene('Trilha').popup)), 'fase 3 continua trancada');
  const c2 = await p.evaluate(() => { const o = window.__jogo.scene.getScene('Trilha').children.getByName('chocolate'); return { x: o.x, y: o.y }; });
  await p.mouse.click(c2.x, c2.y); await p.waitForTimeout(500);
  ok(await p.evaluate(() => !!window.__jogo.scene.getScene('Trilha').popup), 'fase 2 liberada: abre a escolha de modo');

  // daqui em diante: área dos pais libera tudo (para ir direto às fases novas)
  await p.evaluate(() => { const pr = JSON.parse(localStorage.getItem('meu-bolinho:preferencias:v1') || '{}'); pr.liberarFases = true; localStorage.setItem('meu-bolinho:preferencias:v1', JSON.stringify(pr)); });

  console.log('Mecânica nova: bater claras (fase Pão de Ló Nuvem)');
  await abrirFase('nuvem');
  await pularAte('bater');
  // arrastar reto dentro da tigela não bate
  await p.mouse.move(640, 450); await p.mouse.down(); await p.mouse.move(880, 450, { steps: 12 }); await p.mouse.up();
  ok((await st()).batidas === 0, 'arrastar reto não conta batida');
  await p.mouse.move(760, 450); await p.mouse.down();
  await vaiEVem(760, 450, 8, 70);
  const meio = (await st()).batidas;
  ok(meio >= 4, `vai e vem rápido conta batidas (${meio})`);
  await p.waitForTimeout(2000);
  ok((await st()).batidas === meio, 'parou de bater: a espuma para de crescer');
  await foto('03-bater-meio');
  await vaiEVem(760, 450, 24, 70);
  await p.mouse.up(); await p.waitForTimeout(600);
  await foto('04-bater-fim');
  ok((await esperar((s) => s.tipo !== 'bater', 8000)) !== null, 'claras batidas: etapa concluída');

  console.log('Mecânica nova: rechear (fase Bolo de Morango)');
  await abrirFase('morango');
  await pularAte('rechear');
  await foto('05-rechear-inicio');
  await p.mouse.move(440, 360); await p.mouse.down();
  for (let y = 335, l = 0; y <= 495; y += 12, l ^= 1) await p.mouse.move(l ? 430 : 850, y, { steps: 5 });
  await p.mouse.up(); await p.waitForTimeout(500);
  const recheio = await p.evaluate(() => window.__jogo.scene.getScene('Confeitar').sessao.runner.controlador.recheioOk);
  ok(recheio, 'recheio espalhado na camada de baixo');
  // soltar longe: a camada volta
  await p.mouse.move(1060, 480); await p.mouse.down(); await p.mouse.move(300, 220, { steps: 10 }); await p.waitForTimeout(400); await p.mouse.up(); await p.waitForTimeout(700);
  ok((await st()).tipo === 'rechear', 'camada solta longe do bolo volta (não assenta sozinha)');
  await p.mouse.move(1060, 480); await p.mouse.down(); await p.mouse.move(655, 375, { steps: 14 });
  await p.waitForTimeout(900); await p.mouse.up(); await p.waitForTimeout(500);
  const topo = await p.evaluate(() => window.__jogo.scene.getScene('Confeitar').bolo.topo);
  ok(Math.abs(topo.x - 640) > 0.5 || Math.abs(topo.y - 360) > 0.5, `camada assentou onde a criança soltou (topo em ${topo.x.toFixed(0)},${topo.y.toFixed(0)}; sem encaixe automático)`);
  await foto('06-rechear-montado');
  ok((await esperar((s) => s.tipo === 'decorar', 8000)) !== null, 'bolo recheado: segue para decorar');

  console.log('Mecânica nova: escrever com glacê (fase Bolo de Aniversário)');
  await abrirFase('aniversario');
  await pularAte('decorar');
  await p.mouse.move(450, 300); await p.mouse.down();
  for (let y = 285, l = 0; y <= 440; y += 12, l ^= 1) await p.mouse.move(l ? 440 : 840, y, { steps: 5 });
  await p.mouse.up(); await p.waitForTimeout(800);
  const fase = await p.evaluate(() => window.__jogo.scene.getScene('Confeitar').sessao.runner.controlador.fase);
  ok(fase === 'glace', `depois da cobertura vem o glacê (fase: ${fase})`);
  ok(!(await p.evaluate(() => window.__jogo.scene.getScene('Confeitar').botaoPronto.visible)), '"Pronto!" ainda não aparece');
  await foto('07-glace-guia');
  // rabisco fora do desenho não conta
  await p.mouse.move(470, 420); await p.mouse.down(); await p.mouse.move(520, 440, { steps: 6 }); await p.mouse.up();
  const fora = await p.evaluate(() => window.__jogo.scene.getScene('Confeitar').sessao.runner.controlador.tracoGlace.fracao);
  ok(fora < 0.05, `rabisco fora do desenho quase não conta (${(fora * 100).toFixed(0)}%)`);
  const pts = await p.evaluate(() => window.__jogo.scene.getScene('Confeitar').sessao.runner.controlador.tracoGlace.pontos.filter((_, i) => i % 3 === 0));
  await p.mouse.move(pts[0].x, pts[0].y); await p.mouse.down();
  for (const q of pts) await p.mouse.move(q.x, q.y);
  await p.mouse.move(pts[0].x, pts[0].y);
  await p.mouse.up(); await p.waitForTimeout(800);
  await foto('08-glace-feito');
  const depois = await p.evaluate(() => { const c = window.__jogo.scene.getScene('Confeitar'); return { fase: c.sessao.runner.controlador.fase, pronto: c.botaoPronto.visible }; });
  ok(depois.fase === 'enfeitar' && depois.pronto, 'seguir o desenho conclui o glacê e libera enfeites e "Pronto!"');
  for (const [x, y] of [[560, 340], [700, 360], [630, 395]]) { await p.mouse.move(470, 650); await p.mouse.down(); await p.mouse.move(x, y, { steps: 6 }); await p.mouse.up(); }
  await p.mouse.click(1060, 650);
  await esperar((s) => s.cenas.includes('Resultado'), 20000); await p.waitForTimeout(3000);
  await foto('09-resultado-estrelas');
  const est = await p.evaluate(() => JSON.parse(localStorage.getItem('meu-bolinho:trilha:v1@f') || '{}').aniversario);
  ok(est >= 2, `bolo caprichado e medidas certinhas: ${est} estrelas`);

  ok(erros.length === 0, 'sem erros de página ' + erros.join(' | '));
  console.log(falhas ? `FASES: ${falhas} falha(s)` : 'FASES: tudo ok');
  await b.close();
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.log('ERRO', e); process.exit(1); });
