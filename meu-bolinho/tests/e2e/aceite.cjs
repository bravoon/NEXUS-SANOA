/**
 * Teste de aceite no navegador (Playwright + Chromium), cobrindo os critérios da especificação.
 *
 * Uso:
 *   npm run build && npx vite preview --port 4173 &
 *   npm i -D playwright && npx playwright install chromium   # uma vez
 *   node tests/e2e/aceite.cjs [pasta-para-capturas]
 *
 * Etapas que não são o alvo de um critério são avançadas pelo núcleo (controladores), para o
 * teste caber em poucos minutos. Swipe e sacudir usam eventos disparados em sequência rápida
 * porque o Chromium sem GPU é lento demais para atingir as velocidades mínimas com mouse.move.
 */
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:4173/?debug';
const PASTA = process.argv[2] || null;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  let falhas = 0;
  const ok = (c, m) => { console.log((c ? '  ok  ' : '  FALHOU  ') + m); if (!c) falhas++; };
  const foto = async (n) => { if (PASTA) await p.screenshot({ path: `${PASTA}/aceite-${n}.png` }); };
  const st = () => p.evaluate(() => {
    const a = window.__jogo.scene.getScenes(true).find((s) => s.sessao);
    const cenas = window.__jogo.scene.getScenes(true).map((s) => s.scene.key).join(',');
    if (!a) return { cenas };
    const r = a.sessao.runner, k = r.controlador || {};
    return { cenas, cena: a.scene.key, sub: r.estado.sub, erro: r.estado.erro, tipo: r.etapa && r.etapa.tipo, item: r.etapa && r.etapa.item,
      desp: k.despejado, tigela: a.sessao.tigela.total, voltas: k.voltas, fase: k.fase, dica: a.dicas && a.dicas.nivel };
  });
  const esperar = async (f, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await st(); if (f(s)) return s; await p.waitForTimeout(80); } return null; };
  /** Completa a etapa atual pelo núcleo (atalho de teste) e espera a próxima. */
  const pular = async () => {
    const antes = await st();
    await p.evaluate(() => {
      const a = window.__jogo.scene.getScenes(true).find((s) => s.sessao);
      const r = a.sessao.runner, k = r.controlador;
      const seg = { segurando: true, anguloGraus: 60, bicoSobreAlvo: true };
      r.inicioDoGesto();
      switch (k.tipo) {
        case 'despejar': while (!k.metaAtingida()) k.tick(seg, 16); a.sessao.tigela.adicionar(k.params.item, k.despejado); break;
        case 'quebrar_ovo': for (let j = 0; j < k.quantidade; j++) { k.apoiarNaBorda(); k.toque(j * 1e4); k.toque(j * 1e4 + 500); } while (k.retirarCasca()); break;
        case 'mexer': for (let t = 0; t < 2000 && !k.metaAtingida(); t++) k.amostra(Math.cos(t * 0.3) * 60, Math.sin(t * 0.3) * 60, t * 50); break;
        case 'untar': k.definirSuperficie({ x: 0, y: 0, largura: 10, altura: 10 }, () => true); for (let y = 0; y <= 10; y++) { k.pintar(0, y); k.pintar(10, y); } break;
        case 'despejar_massa': while (!k.metaAtingida()) { const q = k.tick(seg, 16); a.sessao.tigela.removerProporcional(q); a.sessao.forma.massa += q; } break;
        case 'forno': k.colocarForma(); k.tocarPorta(); for (let t = 0; t < 60; t++) k.girarTimer(Math.cos(t * 0.3) * 60, Math.sin(t * 0.3) * 60, 1e6 + t * 50); k.assar(k.duracaoMs); k.tocarPorta(); k.equiparLuva(); k.pegarForma(); k.soltarForma(true); a.sessao.forma.assado = 1; break;
        case 'desenformar': k.colocarPrato(); k.iniciarSwipe(0, 0, 0); k.terminarSwipe(0, 300, 100); break;
      }
      r.fimDoGesto();
    });
    await esperar((s) => s.sub === 'aguardando' && (s.tipo !== antes.tipo || s.cena !== antes.cena || s.item !== antes.item) && s.cena === s.cenas.split(',').find((c) => ['Cozinha', 'Forno', 'Confeitar'].includes(c)), 20000);
    await p.waitForTimeout(400);
  };
  const pularAte = async (tipo) => {
    for (let i = 0; i < 40 && (await st()).tipo !== tipo; i++) await pular();
    const s = await st();
    if (s.tipo !== tipo) console.log(`  (não chegou em ${tipo}: ${JSON.stringify(s)})`);
    // espera a cena da etapa estar ativa e aceitando input
    await esperar((x) => x.tipo === tipo && x.sub === 'aguardando' && x.cena === x.cenas.split(',').find((c) => ['Cozinha', 'Forno', 'Confeitar'].includes(c)), 20000);
  };

  await p.goto(BASE); await p.waitForTimeout(1500);
  await p.evaluate(() => localStorage.clear());
  await p.reload(); await p.waitForTimeout(1500);

  console.log('Receitas e modo Confeiteiro');
  // a área dos pais libera a trilha toda (o Chocolate no Confeiteiro é a fase 2)
  await p.evaluate(() => { localStorage.setItem('meu-bolinho:preferencias:v1', JSON.stringify({ liberarFases: true })); localStorage.setItem('meu-bolinho:perfis:v1', JSON.stringify({ perfis: [{ id: 'teste', nome: 'Teste', avatar: 'gato', criadoEm: '2026-01-01T00:00:00Z' }], atual: 'teste' })); });
  await p.reload(); await p.waitForTimeout(1500);
  await p.mouse.click(530, 570); await p.waitForTimeout(800); // Jogar → Trilha
  const nReceitas = await p.evaluate(() => window.__jogo.scene.getScene('Trilha').children.list.filter((o) => o.name && o.input).length);
  ok(nReceitas >= 8, `trilha mostra ${nReceitas} fases (receitas adicionadas só com JSON)`);
  await foto('01-trilha');
  const cChocolate = await p.evaluate(() => { const o = window.__jogo.scene.getScene('Trilha').children.getByName('chocolate'); return { x: o.x, y: o.y }; });
  await p.mouse.click(cChocolate.x, cChocolate.y); await p.waitForTimeout(500);
  await p.mouse.click(810, 400); await p.waitForTimeout(1500); // Confeiteiro
  let s = await st();
  const receita = await p.evaluate(() => { const a = window.__jogo.scene.getScene('Cozinha').sessao.receita; return { id: a.id, d: a.dificuldade, n: a.recipientes.length, ing: a.ingredientes.length }; });
  ok(receita.d === 'confeiteiro' && receita.ing === 7, `receita ${receita.id} no Confeiteiro: ${receita.ing} ingredientes, ${receita.n} potes na mesa (2 fileiras)`);
  await foto('02-cozinha-confeiteiro');

  console.log('Dicas progressivas (sem punição; a mão-fantasma não executa a ação)');
  const nivelDica = () => p.evaluate(() => window.__jogo.scene.getScene('Cozinha').dicas.nivel);
  for (let i = 0; i < 200 && (await nivelDica()) < 2; i++) await p.waitForTimeout(200);
  await p.waitForTimeout(1500);
  const h = await p.evaluate(() => { const c = window.__jogo.scene.getScene('Cozinha'); return { mao: c.apresentador.mao.visible, desp: c.sessao.runner.controlador.despejado }; });
  console.log('    ', JSON.stringify({ nivel: await nivelDica(), ...h }));
  ok((await nivelDica()) >= 2 && h.mao && h.desp === 0, 'parada 12 s: brilho + mão-fantasma; nada foi despejado por ela');
  await foto('02b-dica');
  await p.mouse.click(400, 300); await p.waitForTimeout(300);
  ok((await nivelDica()) === 0, 'um toque apaga as dicas');

  console.log('Critério 1 — sem input contínuo nada avança (soltar no meio congela)');
  // farinha: 1º pote da fileira da frente
  await p.mouse.move(100, 540, { steps: 2 }); await p.mouse.down(); await p.mouse.move(650, 250, { steps: 20 }); await p.waitForTimeout(300);
  await p.mouse.move(760, 250, { steps: 6 });
  await esperar((x) => x.desp > 0.3, 30000);
  await p.mouse.up(); await p.waitForTimeout(300);
  const congelado = (await st()).desp;
  await p.waitForTimeout(3000);
  s = await st();
  ok(s.desp === congelado && s.sub === 'aguardando' && s.item === 'farinha', `soltou com ${congelado.toFixed(2)} xíc: 3 s depois continua ${s.desp.toFixed(2)} e a etapa não avançou`);

  console.log('Critério 3 — despejar fora da tigela não altera o nível');
  const nivelAntes = (await st()).tigela;
  await p.mouse.move(100, 540, { steps: 2 }); await p.mouse.down(); await p.mouse.move(300, 250, { steps: 12 });
  for (let x = 300; x <= 420; x += 20) await p.mouse.move(x, 250); // inclina longe da tigela
  await p.waitForTimeout(1500);
  await p.mouse.up(); await p.waitForTimeout(400);
  ok((await st()).tigela === nivelAntes, 'inclinar o pote fora da tigela não muda o nível');

  console.log('Ingrediente fora de ordem é rejeitado');
  await p.mouse.move(225, 540, { steps: 2 }); await p.mouse.down(); await p.mouse.move(650, 250, { steps: 15 }); await p.mouse.move(800, 250, { steps: 6 }); await p.waitForTimeout(800); await p.mouse.up(); await p.waitForTimeout(400);
  ok((await st()).tigela === nivelAntes && (await st()).item === 'farinha', 'pote errado não entra na tigela');

  console.log('Critério 2 — mexer em linha reta ou parado não conta');
  await pularAte('mexer');
  await p.mouse.move(640, 450); await p.mouse.down(); await p.mouse.move(880, 450, { steps: 15 }); await p.mouse.move(640, 450, { steps: 15 }); await p.mouse.up();
  await p.mouse.move(820, 450); await p.mouse.down(); await p.waitForTimeout(2500); await p.mouse.up();
  ok((await st()).voltas === 0, 'linha reta + dedo parado = 0 voltas');
  await p.mouse.move(880, 450); await p.mouse.down();
  for (let k = 0; k <= 24; k++) { const a = (k / 12) * Math.PI * 2; await p.mouse.move(760 + Math.cos(a) * 120, 450 + Math.sin(a) * 75); }
  await p.mouse.up(); await p.waitForTimeout(300);
  ok((await st()).voltas > 0.5, `girar conta voltas (${(await st()).voltas.toFixed(2)})`);

  console.log('Critério 6 — modo debug (tecla D)');
  await p.keyboard.press('d'); await p.waitForTimeout(400);
  const debug = await p.evaluate(() => { const c = window.__jogo.scene.getScene('Cozinha'); return { on: c.debug.ativo, txt: c.debug.texto.text }; });
  ok(debug.on && /voltas/.test(debug.txt) && /FSM/.test(debug.txt), 'D liga o overlay com FSM e voltas acumuladas');
  await foto('03-debug-mexer');
  await p.keyboard.press('d');

  console.log('Critério 4 — forma não sai do forno sem luva');
  await pularAte('forno');
  await p.waitForTimeout(800);
  await p.evaluate(() => { const k = window.__jogo.scene.getScene('Forno').sessao.runner.controlador; k.colocarForma(); k.tocarPorta(); for (let t = 0; t < 60; t++) k.girarTimer(Math.cos(t * 0.3) * 60, Math.sin(t * 0.3) * 60, 1e6 + t * 50); k.assar(k.duracaoMs); k.tocarPorta(); });
  await p.waitForTimeout(500);
  const forma = await p.evaluate(() => { const f = window.__jogo.scene.getScene('Forno').forma; return { x: f.x, y: f.y }; });
  await p.mouse.move(forma.x, forma.y); await p.mouse.down(); await p.mouse.move(forma.x - 200, forma.y - 50, { steps: 10 }); await p.mouse.up(); await p.waitForTimeout(400);
  s = await st();
  ok(s.fase === 'retirar' && s.sub === 'correcao' && s.erro === 'quente', 'sem luva: "Cuidado, está quente!" e a forma fica');
  await foto('04-quente');

  console.log('Galeria e progresso');
  await pularAte('desenformar'); await pular();
  for (let i = 0; i < 40 && (await st()).cena !== 'Confeitar'; i++) await p.waitForTimeout(250);
  await p.waitForTimeout(800);
  await p.mouse.move(450, 300); await p.mouse.down();
  for (let y = 285, l = 0; y <= 440; y += 12, l ^= 1) await p.mouse.move(l ? 440 : 840, y, { steps: 5 });
  await p.mouse.up(); await p.waitForTimeout(600);
  for (const [x, y] of [[560, 340], [700, 360]]) { await p.mouse.move(690, 650); await p.mouse.down(); await p.mouse.move(x, y, { steps: 8 }); await p.mouse.up(); }
  await foto('05-decorado');
  await p.mouse.click(1060, 650);
  await esperar((x) => x.cenas.includes('Resultado'), 20000); await p.waitForTimeout(1500);
  await foto('06-resultado');
  const galeria = await p.evaluate(() => JSON.parse(localStorage.getItem('meu-bolinho:galeria:v1@teste') || '[]'));
  ok(galeria.length === 1 && galeria[0].foto.startsWith('data:image/jpeg') && galeria[0].enfeites >= 2, `bolo guardado na galeria (foto ${Math.round(galeria[0]?.foto.length / 1024)} KB)`);
  const prog = await p.evaluate(() => JSON.parse(localStorage.getItem('meu-bolinho:progresso:v1@teste') || '{}'));
  ok(prog[receita.id]?.confeiteiro === 1, 'progresso registrado (Confeiteiro: 1)');
  await p.mouse.click(640, 640); await p.waitForTimeout(1500); // Galeria
  ok((await st()).cenas.includes('Galeria'), 'botão Galeria abre a galeria');
  await p.mouse.click(640 - 1.5 * 280, 250); await p.waitForTimeout(800);
  await foto('07-galeria-ampliada');
  await p.mouse.click(1000, 110); await p.waitForTimeout(400);
  await foto('08-galeria');
  await p.reload(); await p.waitForTimeout(1500);
  ok((await p.evaluate(() => JSON.parse(localStorage.getItem('meu-bolinho:galeria:v1@teste') || '[]').length)) === 1, 'galeria sobrevive ao recarregar');

  ok(erros.length === 0, 'sem erros de página ' + erros.join(' | '));
  console.log(falhas === 0 ? '\nACEITE: tudo ok' : `\nACEITE: ${falhas} falha(s)`);
  await b.close();
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.log('ERRO', e); process.exit(1); });
