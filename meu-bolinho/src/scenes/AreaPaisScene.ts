/**
 * Área dos pais (entrada protegida: segurar o cadeado 2 s no menu).
 * Volume geral, música e efeitos; liga/desliga narração e música. Salvo só neste aparelho.
 */
import Phaser from 'phaser';
import { ALTURA, CORES, LARGURA } from '../config/layout';
import { AudioSystem } from '../systems/audio/AudioSystem';
import { PREFERENCIAS_PADRAO, type Preferencias } from '../systems/save/Preferencias';
import { aoSoltarNoObjeto, botaoGrande } from './ui';

const FONTE = 'Arial Rounded MT Bold, Arial, sans-serif';

export class AreaPaisScene extends Phaser.Scene {
  constructor() {
    super('AreaPais');
  }

  create(): void {
    const audio = AudioSystem.get();
    this.cameras.main.setBackgroundColor(0xf4efe9);
    this.add.text(LARGURA / 2, 50, 'Área dos pais', { fontFamily: FONTE, fontSize: '44px', color: '#3b2a20', fontStyle: 'bold' }).setOrigin(0.5);

    const prefs = (): Readonly<Preferencias> => audio?.preferencias ?? PREFERENCIAS_PADRAO;
    const mudar = (m: Partial<Preferencias>) => {
      audio?.atualizarPreferencias(m);
      audio?.efeito('pop');
    };

    this.controleDeslizante(130, 'Volume geral', () => prefs().volumeGeral, (v) => mudar({ volumeGeral: v }));
    this.controleDeslizante(205, 'Música', () => prefs().volumeMusica, (v) => mudar({ volumeMusica: v }));
    this.controleDeslizante(280, 'Efeitos sonoros', () => prefs().volumeEfeitos, (v) => mudar({ volumeEfeitos: v }));
    this.interruptor(360, 'Narração (voz do mascote)', () => prefs().narracao, (v) => mudar({ narracao: v }));
    this.interruptor(430, 'Música de fundo', () => prefs().musica, (v) => mudar({ musica: v }));
    this.interruptor(500, 'Liberar todas as fases da trilha', () => prefs().liberarFases, (v) => mudar({ liberarFases: v }));

    this.add
      .text(LARGURA / 2, 548, `Voz: ${audio?.fonteVoz ?? 'indisponível'}\nSem anúncios, sem compras e sem coleta de dados. Os perfis, as estrelas, as preferências e a galeria ficam só neste aparelho.`, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '17px',
        color: '#6b5a4e',
        align: 'center',
        wordWrap: { width: 900 },
      })
      .setOrigin(0.5, 0);

    botaoGrande(this, 170, ALTURA - 55, '⌂ Voltar', 0x0072b2, () => this.scene.start('Menu'), 240, 72);
    botaoGrande(this, LARGURA / 2, ALTURA - 55, '👤 Perfis', 0xcc79a7, () => this.scene.start('Perfis', { gerenciar: true }), 260, 72);
    botaoGrande(this, LARGURA - 190, ALTURA - 55, '▶ Testar voz', CORES.sucesso, () => audio?.falar('boas_vindas', 'alta'), 280, 72);
  }

  private controleDeslizante(y: number, rotulo: string, ler: () => number, escrever: (v: number) => void): void {
    const x0 = 520, larg = 520;
    this.add.text(120, y, rotulo, { fontFamily: FONTE, fontSize: '28px', color: '#3b2a20' }).setOrigin(0, 0.5);
    const trilho = this.add.graphics();
    const botao = this.add.circle(0, y, 24, CORES.sucesso).setStrokeStyle(4, 0x006b4f);
    const valor = this.add.text(x0 + larg + 40, y, '', { fontFamily: FONTE, fontSize: '24px', color: '#3b2a20' }).setOrigin(0, 0.5);
    const desenhar = () => {
      const v = ler();
      trilho.clear();
      trilho.fillStyle(CORES.barraFundo, 1);
      trilho.fillRoundedRect(x0, y - 10, larg, 20, 10);
      trilho.fillStyle(CORES.sucesso, 1);
      trilho.fillRoundedRect(x0, y - 10, Math.max(20, larg * v), 20, 10);
      botao.setX(x0 + larg * v);
      valor.setText(`${Math.round(v * 100)}%`);
    };
    desenhar();
    const zona = this.add.zone(x0 + larg / 2, y, larg + 60, 70).setInteractive({ useHandCursor: true });
    const aplicar = (p: Phaser.Input.Pointer) => {
      escrever(Phaser.Math.Clamp((p.x - x0) / larg, 0, 1));
      desenhar();
    };
    zona.on('pointerdown', aplicar);
    zona.on('pointermove', (p: Phaser.Input.Pointer) => p.isDown && aplicar(p));
  }

  private interruptor(y: number, rotulo: string, ler: () => boolean, escrever: (v: boolean) => void): void {
    this.add.text(120, y, rotulo, { fontFamily: FONTE, fontSize: '28px', color: '#3b2a20' }).setOrigin(0, 0.5);
    const g = this.add.graphics();
    const t = this.add.text(0, y, '', { fontFamily: FONTE, fontSize: '22px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    const x = 900;
    const desenhar = () => {
      const v = ler();
      g.clear();
      g.fillStyle(v ? CORES.sucesso : 0xb0a49a, 1);
      g.fillRoundedRect(x - 60, y - 28, 120, 56, 28);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(v ? x + 32 : x - 32, y, 22);
      t.setText(v ? 'SIM' : 'NÃO').setX(v ? x - 18 : x + 18);
    };
    desenhar();
    aoSoltarNoObjeto(this.add.zone(x, y, 160, 72).setInteractive({ useHandCursor: true }), () => {
      escrever(!ler());
      desenhar();
    });
  }
}
