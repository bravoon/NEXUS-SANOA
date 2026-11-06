/**
 * Gera os ícones do app (PWA, Android, iOS, desktop) a partir da arte do próprio jogo.
 * Uso: npm run build && npx vite preview --port 4173 &  node scripts/icones.cjs
 * (requer Playwright; os PNGs gerados ficam versionados em public/icons e build/)
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto(process.env.BASE_URL || 'http://localhost:4173/?debug');
  await p.waitForFunction(() => window.__jogo && window.__jogo.textures.exists('menu:bolinho'), null, { timeout: 30000 });
  const gerar = (tam, margem, fundoRedondo) => p.evaluate(({ tam, margem, fundoRedondo }) => {
    const src = window.__jogo.textures.get('menu:bolinho').getSourceImage();
    const c = document.createElement('canvas'); c.width = c.height = tam;
    const x = c.getContext('2d');
    const grad = x.createRadialGradient(tam / 2, tam * 0.42, tam * 0.05, tam / 2, tam / 2, tam * 0.72);
    grad.addColorStop(0, '#fff4e6'); grad.addColorStop(1, '#ffb8cc');
    x.fillStyle = grad;
    if (fundoRedondo) { const r = tam * 0.22; x.beginPath(); x.roundRect(0, 0, tam, tam, r); x.fill(); } else x.fillRect(0, 0, tam, tam);
    const area = tam * (1 - margem * 2);
    const k = Math.min(area / src.width, area / src.height);
    x.drawImage(src, (tam - src.width * k) / 2, (tam - src.height * k) / 2 + tam * 0.02, src.width * k, src.height * k);
    return c.toDataURL('image/png');
  }, { tam, margem, fundoRedondo });
  const salvar = (arq, dataUrl) => { fs.writeFileSync(path.join(raiz, arq), Buffer.from(dataUrl.split(',')[1], 'base64')); console.log(arq); };
  salvar('public/icons/icon-192.png', await gerar(192, 0.1, false));
  salvar('public/icons/icon-512.png', await gerar(512, 0.1, false));
  salvar('public/icons/icon-maskable-512.png', await gerar(512, 0.2, false)); // zona segura de 80%
  salvar('public/icons/apple-touch-icon.png', await gerar(180, 0.1, false));
  salvar('public/icons/favicon-64.png', await gerar(64, 0.04, true));
  salvar('build/icon.png', await gerar(1024, 0.1, true)); // desktop (electron-builder converte para .ico/.icns)
  await b.close();
})();
