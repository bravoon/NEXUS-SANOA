/**
 * Preload: carrega as vozes gravadas que existirem em src/assets/voz/<id>.mp3.
 * A lista é descoberta em tempo de build (import.meta.glob): adicionar um arquivo basta.
 * Arquivo que falhar ao carregar é ignorado (a fala usa a voz do sistema ou só o balão).
 */
import Phaser from 'phaser';
import { ALTURA, CORES, LARGURA } from '../config/layout';

const VOZES = import.meta.glob<string>('../assets/voz/*.mp3', { eager: true, query: '?url', import: 'default' });

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload(): void {
    this.cameras.main.setBackgroundColor(CORES.fundo);
    const larg = 520;
    const x = (LARGURA - larg) / 2;
    const y = ALTURA / 2;
    const fundo = this.add.graphics();
    fundo.fillStyle(CORES.barraFundo, 1);
    fundo.fillRoundedRect(x, y - 18, larg, 36, 18);
    const barra = this.add.graphics();
    this.add.image(LARGURA / 2, y - 80, 'estrela').setScale(3).setTint(CORES.destaque);
    this.load.on('progress', (p: number) => {
      barra.clear();
      barra.fillStyle(CORES.sucesso, 1);
      barra.fillRoundedRect(x, y - 18, Math.max(36, larg * p), 36, 18);
    });
    this.load.on('loaderror', (arq: Phaser.Loader.File) => console.warn('[voz] não carregou:', arq.key));
    for (const [caminho, url] of Object.entries(VOZES)) {
      const id = caminho.split('/').pop()!.replace(/\.mp3$/, '');
      this.load.audio(`voz:${id}`, url);
    }
  }

  create(): void {
    this.scene.start('Menu');
  }
}
