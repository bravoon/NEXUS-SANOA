/**
 * Teste do app de desktop (Electron) com Playwright.
 * Uso (Linux sem tela): npm run build && xvfb-run -a node tests/e2e/desktop.cjs
 */
const { _electron: electron } = require('playwright');
const path = require('path');

(async () => {
  const raiz = path.join(__dirname, '..', '..');
  const executavel = require(path.join(raiz, 'node_modules', 'electron')); // o pacote npm exporta o caminho do binário
  const abrir = () => electron.launch({ executablePath: executavel, args: [raiz, '--no-sandbox'], env: { ...process.env, MEU_BOLINHO_DEBUG: '1' } });
  let falhas = 0;
  const ok = (c, m) => { console.log((c ? '  ok  ' : '  FALHOU  ') + m); if (!c) falhas++; };

  let app = await abrir();
  let w = await app.firstWindow();
  await w.waitForFunction(() => window.__jogo && window.__jogo.scene.getScenes(true).some((s) => s.scene.key === 'Menu'), null, { timeout: 30000 });
  const info = await w.evaluate(() => ({ plataforma: document.documentElement.dataset.plataforma, url: location.href, tam: [innerWidth, innerHeight] }));
  ok(info.plataforma === 'desktop', `plataforma detectada: ${info.plataforma} (${info.url})`);
  ok(info.tam[0] >= 1280 && info.tam[1] >= 720, `janela ${info.tam.join('×')}`);
  const audio = await w.evaluate(() => window.__audio && window.__audio.temSintese);
  ok(audio === true, 'áudio WebAudio disponível');
  // persistência: grava e reabre o app
  await w.evaluate(() => localStorage.setItem('meu-bolinho:teste-persistencia', 'sim'));
  await w.screenshot({ path: process.argv[2] ? `${process.argv[2]}/desktop-menu.png` : 'desktop-menu.png' });
  // jogar um pouco: entra numa receita
  await w.mouse.click(530, 570); await w.waitForTimeout(800);
  const x = await w.evaluate(() => window.__jogo.scene.getScene('SelecaoReceita').children.getByName('fofinho').x);
  await w.mouse.click(x, 300); await w.waitForTimeout(2000);
  const cena = await w.evaluate(() => window.__jogo.scene.getScenes(true).map((s) => s.scene.key).join(','));
  ok(cena.includes('Cozinha'), `cozinha abriu (${cena})`);
  const render = await w.evaluate(() => new Promise((res) => { const g = window.__jogo; let n = 0, t = 0, i = 0; const a = () => (i = performance.now()), z = () => { t += performance.now() - i; n++; };
    g.events.on('prerender', a); g.events.on('postrender', z); setTimeout(() => res((t / n).toFixed(2)), 3000); }));
  console.log(`  render JS na cozinha: ${render} ms/quadro`);
  // Esc = voltar → pausa
  await w.keyboard.press('Escape'); await w.waitForTimeout(500);
  ok(await w.evaluate(() => window.__jogo.scene.isPaused('Cozinha') && window.__jogo.scene.isActive('Pausa')), 'Esc pausa a partida');
  await app.close();

  app = await abrir();
  w = await app.firstWindow();
  await w.waitForFunction(() => window.__jogo, null, { timeout: 30000 });
  ok((await w.evaluate(() => localStorage.getItem('meu-bolinho:teste-persistencia'))) === 'sim', 'dados (galeria/preferências) persistem entre aberturas do app');
  await w.evaluate(() => localStorage.removeItem('meu-bolinho:teste-persistencia'));
  await app.close();
  console.log(falhas ? `DESKTOP: ${falhas} falha(s)` : 'DESKTOP: tudo ok');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.log('ERRO', e); process.exit(1); });
