// Ponte mínima e segura entre a página e o app de desktop (sem expor Node).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('meuBolinhoDesktop', {
  alternarTelaCheia: () => ipcRenderer.send('tela-cheia'),
  sair: () => ipcRenderer.send('sair'),
});
