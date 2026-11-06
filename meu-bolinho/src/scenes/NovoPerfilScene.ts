/**
 * Novo jogador, em dois passos que não exigem saber ler:
 *   1. escolher um bichinho (avatar) — basta tocar;
 *   2. o nome (opcional), num teclado de letras grandes; "Pronto" sem nome usa o do bichinho.
 * Nada sai do aparelho: sem e-mail, sem senha.
 */
import Phaser from 'phaser';
import { TEXTURAS } from '../art/ArteProcedural';
import { ALTURA, CORES, LARGURA } from '../config/layout';
import { AudioSystem } from '../systems/audio/AudioSystem';
import { armazenamentoLocal } from '../systems/save/Preferencias';
import { AVATARES, carregarPerfis, criarPerfil, limparNome, MAX_NOME, NOME_AVATAR, type Avatar } from '../systems/save/Perfis';
import { desenharAvatar } from '../utils/avatar';
import { imagemVetorial } from '../utils/CacheGrafico';
import { aoSoltarNoObjeto, botaoGrande } from './ui';

const FONTE = 'Arial Rounded MT Bold, Arial, sans-serif';
const LINHAS_TECLADO = ['ABCDEFGHIJ', 'KLMNOPQRST', 'UVWXYZÇÃÉ'];

export class NovoPerfilScene extends Phaser.Scene {
  /** Estado lido pelos testes. */
  avatar: Avatar | null = null;
  nome = '';
  private camada: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('NovoPerfil');
  }

  create(): void {
    this.avatar = null;
    this.nome = '';
    this.camada = null;
    this.add.image(0, 0, TEXTURAS.fundoMenu).setOrigin(0);
    this.passoAvatar();
  }

  private limpar(): Phaser.GameObjects.Container {
    this.camada?.destroy(true);
    this.camada = this.add.container(0, 0);
    return this.camada;
  }

  private voltar(): void {
    const temPerfis = carregarPerfis(armazenamentoLocal()).perfis.length > 0;
    this.scene.start(temPerfis ? 'Perfis' : 'Menu');
  }

  private passoAvatar(): void {
    const c = this.limpar();
    c.add(this.add.text(LARGURA / 2, 70, 'Escolha o seu bichinho', { fontFamily: FONTE, fontSize: '48px', color: '#3b2a20', fontStyle: 'bold', stroke: '#ffffff', strokeThickness: 8 }).setOrigin(0.5));
    AVATARES.forEach((a, i) => {
      const x = LARGURA / 2 + ((i % 4) - 1.5) * 230;
      const y = 250 + Math.floor(i / 4) * 230;
      const img = imagemVetorial(this, `avatar:${a}:80`, { x: -86, y: -86, largura: 172, altura: 172 }, (g) => desenharAvatar(g, a, 0, 0, 80), x, y).setName(`avatar:${a}`);
      img.setInteractive({ useHandCursor: true });
      c.add(img);
      aoSoltarNoObjeto(img, () => {
        const audio = AudioSystem.get();
        audio?.desbloquear();
        audio?.efeito('pop');
        this.avatar = a;
        this.tweens.add({ targets: img, scale: 1.15, duration: 120, yoyo: true, onComplete: () => this.passoNome() });
      });
    });
    c.add(botaoGrande(this, 120, ALTURA - 56, '◀', 0x0072b2, () => this.voltar(), 140, 80));
    AudioSystem.get()?.falar('perfil.avatar');
  }

  private passoNome(): void {
    const a = this.avatar;
    if (!a) return;
    const c = this.limpar();
    c.add(this.add.text(LARGURA / 2, 50, 'Qual é o seu nome?', { fontFamily: FONTE, fontSize: '42px', color: '#3b2a20', fontStyle: 'bold', stroke: '#ffffff', strokeThickness: 8 }).setOrigin(0.5));
    c.add(imagemVetorial(this, `avatar:${a}:60`, { x: -66, y: -66, largura: 132, altura: 132 }, (g) => desenharAvatar(g, a, 0, 0, 60), 300, 160));
    const caixa = this.add.graphics();
    caixa.fillStyle(0xffffff, 1);
    caixa.fillRoundedRect(390, 120, 560, 84, 20);
    caixa.lineStyle(4, 0xe6c9a8, 1);
    caixa.strokeRoundedRect(390, 120, 560, 84, 20);
    c.add(caixa);
    const texto = this.add.text(670, 162, '', { fontFamily: FONTE, fontSize: '44px', color: '#3b2a20', fontStyle: 'bold' }).setOrigin(0.5).setName('nome');
    c.add(texto);
    const mostrar = () => {
      texto.setText(this.nome || NOME_AVATAR[a]).setColor(this.nome ? '#3b2a20' : '#b0a49a');
    };
    mostrar();

    const TECLA = 92;
    LINHAS_TECLADO.forEach((linha, l) => {
      [...linha].forEach((letra, i) => {
        const x = LARGURA / 2 + (i - (linha.length - 1) / 2) * (TECLA + 8);
        const y = 290 + l * (TECLA + 8);
        const t = this.add.container(x, y).setName(`tecla:${letra}`);
        const g = this.add.graphics();
        g.fillStyle(0xffffff, 1);
        g.fillRoundedRect(-TECLA / 2, -TECLA / 2, TECLA, TECLA, 18);
        g.lineStyle(4, 0xcc79a7, 1);
        g.strokeRoundedRect(-TECLA / 2, -TECLA / 2, TECLA, TECLA, 18);
        t.add(g);
        t.add(this.add.text(0, 0, letra, { fontFamily: FONTE, fontSize: '42px', color: '#3b2a20', fontStyle: 'bold' }).setOrigin(0.5));
        t.setSize(TECLA, TECLA).setInteractive({ useHandCursor: true });
        c.add(t);
        aoSoltarNoObjeto(t, () => {
          if (this.nome.length >= MAX_NOME) return;
          AudioSystem.get()?.efeito('ding');
          // primeira letra maiúscula, o resto minúsculo
          this.nome = limparNome(this.nome + (this.nome.length === 0 ? letra : letra.toLowerCase()));
          mostrar();
        });
      });
    });
    c.add(botaoGrande(this, LARGURA / 2 + 380, 590, '⌫', 0xd55e00, () => {
      this.nome = this.nome.slice(0, -1);
      mostrar();
    }, 140, 84));
    c.add(botaoGrande(this, 120, ALTURA - 56, '◀', 0x0072b2, () => this.passoAvatar(), 140, 80));
    c.add(botaoGrande(this, LARGURA / 2 + 60, 655, '✔ Pronto', CORES.sucesso, () => this.concluir(), 320, 100).setName('pronto'));
    AudioSystem.get()?.falar('perfil.nome');
  }

  private concluir(): void {
    if (!this.avatar) return;
    const r = criarPerfil(armazenamentoLocal(), this.avatar, this.nome);
    const audio = AudioSystem.get();
    if (!r.ok) {
      audio?.efeito('boing');
      this.voltar();
      return;
    }
    audio?.efeito('festa');
    audio?.falar('perfil.ola');
    this.scene.start('Trilha');
  }
}
