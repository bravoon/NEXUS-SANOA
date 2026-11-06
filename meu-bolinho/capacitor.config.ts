import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Apps Android e iOS: o mesmo build web (dist/) dentro de um WebView nativo.
 * appId: troque pelo identificador da sua conta nas lojas antes de publicar.
 */
const config: CapacitorConfig = {
  appId: 'app.meubolinho',
  appName: 'Meu Bolinho',
  webDir: 'dist',
  backgroundColor: '#fff4e6',
  android: {
    backgroundColor: '#fff4e6',
    // o jogo não carrega nada da internet
    allowMixedContent: false,
  },
  ios: {
    backgroundColor: '#fff4e6',
    contentInset: 'never',
  },
};

export default config;
