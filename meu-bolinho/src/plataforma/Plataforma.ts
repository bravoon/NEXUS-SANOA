/**
 * Camada de plataforma: o MESMO jogo roda no navegador (e como PWA instalado), como app
 * Android/iOS (Capacitor) e como app de desktop (Electron). Só aqui o código sabe onde está.
 *
 * - Android: botão "voltar" pausa a partida (nunca sai sem querer); no menu, fecha o app.
 * - Navegador no celular: no primeiro toque, tela cheia + trava em paisagem (quando suportado).
 * - Desktop: F11 alterna a tela cheia.
 * - Todas: o áudio é suspenso quando o app vai para segundo plano.
 */
import Phaser from 'phaser';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { AudioSystem } from '../systems/audio/AudioSystem';
import { acaoVoltar } from './voltar';

export { acaoVoltar } from './voltar';

export type TipoPlataforma = 'android' | 'ios' | 'desktop' | 'pwa' | 'web';

interface PonteDesktop {
  alternarTelaCheia(): void;
  sair(): void;
}

function ponteDesktop(): PonteDesktop | null {
  return (globalThis as unknown as { meuBolinhoDesktop?: PonteDesktop }).meuBolinhoDesktop ?? null;
}

export function detectarPlataforma(): TipoPlataforma {
  if (Capacitor.isNativePlatform()) return Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
  if (ponteDesktop()) return 'desktop';
  if (globalThis.matchMedia?.('(display-mode: standalone)').matches) return 'pwa';
  return 'web';
}

export function iniciarPlataforma(jogo: Phaser.Game): TipoPlataforma {
  const tipo = detectarPlataforma();
  document.documentElement.dataset['plataforma'] = tipo;

  const voltar = (): void => {
    const ativas = jogo.scene.getScenes(true).map((s) => s.scene.key);
    const pausadas = jogo.scene.getScenes(false).filter((s) => s.scene.isPaused()).map((s) => s.scene.key);
    const acao = acaoVoltar([...ativas, ...pausadas]);
    switch (acao.tipo) {
      case 'pausar':
        jogo.scene.getScene(acao.cena)?.scene.launch('Pausa', { origem: acao.cena });
        jogo.scene.getScene(acao.cena)?.scene.pause();
        break;
      case 'continuar': {
        const pausa = jogo.scene.getScene('Pausa');
        const origem = (pausa as unknown as { origem?: string }).origem;
        if (origem) jogo.scene.resume(origem);
        jogo.scene.stop('Pausa');
        break;
      }
      case 'menu':
        for (const s of jogo.scene.getScenes(true)) s.scene.stop();
        jogo.scene.start('Menu');
        break;
      case 'sair':
        if (tipo === 'android') void App.exitApp();
        else ponteDesktop()?.sair();
        break;
    }
  };

  if (tipo === 'android' || tipo === 'ios') {
    void App.addListener('backButton', voltar);
    void App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) AudioSystem.get()?.suspender();
      else AudioSystem.get()?.retomar();
    });
  } else {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) AudioSystem.get()?.suspender();
      else AudioSystem.get()?.retomar();
    });
  }

  if (tipo === 'desktop') {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F11') {
        e.preventDefault();
        ponteDesktop()?.alternarTelaCheia();
      }
      if (e.key === 'Escape') voltar();
    });
  }

  // Navegador em celular/tablet: tela cheia + paisagem no primeiro toque (gesto exigido pelo navegador)
  const toque = globalThis.matchMedia?.('(pointer: coarse)').matches;
  if ((tipo === 'web' || tipo === 'pwa') && toque) {
    const entrar = (): void => {
      const el = document.documentElement;
      const pedir = el.requestFullscreen?.bind(el);
      if (pedir && !document.fullscreenElement) {
        pedir({ navigationUI: 'hide' })
          .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
          .catch(() => undefined); // iOS Safari não suporta: segue sem tela cheia
      }
    };
    window.addEventListener('pointerup', entrar, { once: true });
  }
  return tipo;
}
