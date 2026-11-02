/**
 * Modo debug (tecla D): colisores, voltas acumuladas, vazão, estado da FSM etc.
 * A cena fornece um callback que desenha formas e devolve linhas de texto.
 */
import Phaser from 'phaser';

export type ProvedorDebug = (g: Phaser.GameObjects.Graphics) => string[];

export class DebugOverlay {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly texto: Phaser.GameObjects.Text;
  private ligado = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly provedor: ProvedorDebug,
  ) {
    this.g = scene.add.graphics().setDepth(1000);
    this.texto = scene.add
      .text(12, 140, '', { fontFamily: 'monospace', fontSize: '15px', color: '#00ff88', backgroundColor: '#000000cc', padding: { x: 8, y: 6 } })
      .setDepth(1001);
    scene.input.keyboard?.on('keydown-D', () => this.alternar());
    // Em desenvolvimento, 3 toques rápidos no canto superior esquerdo também alternam (útil no celular).
    if (import.meta.env.DEV) {
      let toques: number[] = [];
      scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (p.x > 60 || p.y > 60) return;
        const agora = performance.now();
        toques = [...toques.filter((t) => agora - t < 800), agora];
        if (toques.length >= 3) {
          toques = [];
          this.alternar();
        }
      });
    }
    this.aplicar();
  }

  alternar(): void {
    this.ligado = !this.ligado;
    this.aplicar();
  }

  get ativo(): boolean {
    return this.ligado;
  }

  private aplicar(): void {
    this.g.setVisible(this.ligado);
    this.texto.setVisible(this.ligado);
    if (!this.ligado) this.g.clear();
  }

  atualizar(): void {
    if (!this.ligado) return;
    this.g.clear();
    const linhas = this.provedor(this.g);
    linhas.unshift(`FPS ${this.scene.game.loop.actualFps.toFixed(0)}`);
    this.texto.setText(linhas.join('\n'));
  }
}
