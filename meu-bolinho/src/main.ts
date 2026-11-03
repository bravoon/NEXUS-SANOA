/** Ponto de entrada: Phaser com Scale Manager FIT em 1280×720 lógicos, paisagem. */
import Phaser from 'phaser';
import { ALTURA, CORES, LARGURA } from './config/layout';
import { AudioSystem } from './systems/audio/AudioSystem';
import { iniciarPlataforma } from './plataforma/Plataforma';
import { AreaPaisScene } from './scenes/AreaPaisScene';
import { BootScene } from './scenes/BootScene';
import { GaleriaScene } from './scenes/GaleriaScene';
import { PreloadScene } from './scenes/PreloadScene';
import { ConfeitarScene } from './scenes/ConfeitarScene';
import { CozinhaScene } from './scenes/CozinhaScene';
import { FornoScene } from './scenes/FornoScene';
import { MenuScene } from './scenes/MenuScene';
import { PausaScene } from './scenes/PausaScene';
import { ResultadoScene } from './scenes/ResultadoScene';
import { TrilhaScene } from './scenes/TrilhaScene';

const jogo = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'jogo',
  backgroundColor: CORES.fundo,
  width: LARGURA,
  height: ALTURA,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 1 },
  // celular: sem menu de contexto no toque longo (segurar o cadeado/pausa)
  disableContextMenu: true,
  scene: [BootScene, PreloadScene, MenuScene, AreaPaisScene, TrilhaScene, CozinhaScene, FornoScene, ConfeitarScene, ResultadoScene, GaleriaScene, PausaScene],
  render: { antialias: true, roundPixels: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' },
});

// Modo retrato em telas pequenas: o CSS mostra "gire o celular" e o jogo dorme.
const retrato = window.matchMedia('(orientation: portrait) and (max-width: 900px)');
const aplicarOrientacao = (): void => {
  if (retrato.matches) jogo.loop.sleep();
  else jogo.loop.wake();
};
retrato.addEventListener('change', aplicarOrientacao);
jogo.events.once(Phaser.Core.Events.READY, aplicarOrientacao);
const plataforma = iniciarPlataforma(jogo);

// PWA: service worker só no navegador (offline + instalação). Apps nativos já carregam local.
if ((plataforma === 'web' || plataforma === 'pwa') && 'serviceWorker' in navigator && import.meta.env.PROD) {
  void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}

// Acesso para testes de ponta a ponta e inspeção manual (somente com ?debug na URL).
if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __jogo: Phaser.Game }).__jogo = jogo;
  Object.defineProperty(window, '__audio', { get: () => AudioSystem.get() });
}
