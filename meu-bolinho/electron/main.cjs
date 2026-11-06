/**
 * App de desktop (Windows, macOS, Linux): o mesmo build web (dist/), servido por um protocolo
 * próprio app:// (origem estável → localStorage da galeria persiste; áudio carrega por fetch).
 * Segurança: sem Node na página (contextIsolation + sandbox), sem navegação nem janelas externas.
 */
const { app, BrowserWindow, ipcMain, net, protocol, Menu } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DIST = path.join(__dirname, '..', 'dist');
const ORIGEM = 'app://bolinho';

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function criarJanela() {
  const janela = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    useContentSize: true,
    backgroundColor: '#fff4e6',
    title: 'Meu Bolinho',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: true,
    },
  });
  janela.once('ready-to-show', () => janela.show());
  // nada sai do app: bloqueia navegação e janelas novas
  janela.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(ORIGEM)) e.preventDefault();
  });
  janela.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // MEU_BOLINHO_DEBUG=1 expõe o jogo para testes automatizados (window.__jogo)
  void janela.loadURL(`${ORIGEM}/index.html${process.env.MEU_BOLINHO_DEBUG ? "?debug" : ""}`);
  return janela;
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url);
    const alvo = path.normalize(path.join(DIST, decodeURIComponent(pathname)));
    if (!alvo.startsWith(DIST)) return new Response('proibido', { status: 403 });
    return net.fetch(pathToFileURL(alvo).toString());
  });
  ipcMain.on('tela-cheia', (e) => {
    const j = BrowserWindow.fromWebContents(e.sender);
    if (j) j.setFullScreen(!j.isFullScreen());
  });
  ipcMain.on('sair', () => app.quit());
  criarJanela();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) criarJanela();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
