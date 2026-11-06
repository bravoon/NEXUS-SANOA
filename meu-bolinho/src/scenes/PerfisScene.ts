/**
 * "Quem vai jogar?": um cartão por criança (avatar, nome e estrelas da trilha) e um cartão
 * "+" para um jogador novo. Tocar num cartão escolhe o perfil e abre a trilha dele.
 * Sem senha: é só para separar a progressão de cada criança neste aparelho.
 *
 * Modo "gerenciar" (vem da área dos pais): cada cartão ganha uma lixeira (segurar 2 s apaga
 * o perfil e tudo dele).
 */
import Phaser from 'phaser';
import { TEXTURAS } from '../art/ArteProcedural';
import { ALTURA, CORES, LARGURA } from '../config/layout';
import { RECEITAS } from '../data/registry';
import { PauseButton } from '../entities/PauseButton';
import { AudioSystem } from '../systems/audio/AudioSystem';
import { carregarEstrelas, montarTrilha, placar } from '../systems/progresso/Trilha';
import { armazenamentoLocal } from '../systems/save/Preferencias';
import { apagarPerfil, armazenamentoDoPerfil, carregarPerfis, escolherPerfil, MAX_PERFIS, nomeExibido, type Perfil } from '../systems/save/Perfis';
import { desenharAvatar } from '../utils/avatar';
import { imagemVetorial } from '../utils/CacheGrafico';
import { ordemDaTrilhaJson } from '../data/trilhaDados';
import { aoSoltarNoObjeto, botaoGrande } from './ui';

const FONTE = 'Arial Rounded MT Bold, Arial, sans-serif';
const LARG = 230, ALT = 270;

export interface DadosPerfisScene {
  gerenciar?: boolean;
}

export class PerfisScene extends Phaser.Scene {
  private gerenciar = false;

  constructor() {
    super('Perfis');
  }

  init(dados: DadosPerfisScene): void {
    this.gerenciar = dados?.gerenciar === true;
  }

  create(): void {
    const audio = AudioSystem.get();
    const base = armazenamentoLocal();
    const { perfis, atual } = carregarPerfis(base);
    if (!this.gerenciar && perfis.length === 0) {
      this.scene.start('NovoPerfil');
      return;
    }
    if (this.gerenciar) this.cameras.main.setBackgroundColor(0xf4efe9);
    else this.add.image(0, 0, TEXTURAS.fundoMenu).setOrigin(0);
    this.add
      .text(LARGURA / 2, 60, this.gerenciar ? 'Perfis dos jogadores' : 'Quem vai jogar?', { fontFamily: FONTE, fontSize: '50px', color: '#3b2a20', fontStyle: 'bold', stroke: '#ffffff', strokeThickness: 8 })
      .setOrigin(0.5);
    if (this.gerenciar)
      this.add.text(LARGURA / 2, 112, 'Segure a lixeira 2 s para apagar um perfil (as estrelas e a galeria dele também).', { fontFamily: 'Arial, sans-serif', fontSize: '19px', color: '#6b5a4e' }).setOrigin(0.5);

    const itens: ({ tipo: 'perfil'; p: Perfil } | { tipo: 'novo' })[] = perfis.map((p) => ({ tipo: 'perfil' as const, p }));
    if (perfis.length < MAX_PERFIS && !this.gerenciar) itens.push({ tipo: 'novo' });
    const porLinha = itens.length <= 4 ? itens.length : Math.ceil(itens.length / 2);
    itens.forEach((it, i) => {
      const lin = Math.floor(i / porLinha);
      const naLinha = Math.min(porLinha, itens.length - lin * porLinha);
      const col = i % porLinha;
      const x = LARGURA / 2 + (col - (naLinha - 1) / 2) * (LARG + 30);
      const linhas = Math.ceil(itens.length / porLinha);
      const y = linhas === 1 ? 370 : 270 + lin * (ALT + 20);
      if (it.tipo === 'novo') this.cartaoNovo(x, y, linhas > 1);
      else this.cartaoPerfil(it.p, x, y, it.p.id === atual, linhas > 1);
    });

    botaoGrande(this, 120, ALTURA - 56, '⌂', 0x0072b2, () => this.scene.start(this.gerenciar ? 'AreaPais' : 'Menu'), 140, 80);
    if (!this.gerenciar) audio?.falar('perfil.quem');
  }

  private cartaoPerfil(p: Perfil, x: number, y: number, atual: boolean, compacto: boolean): void {
    const base = armazenamentoLocal();
    const c = this.add.container(x, y).setName(`perfil:${p.id}`);
    const escala = compacto ? 0.86 : 1;
    c.setScale(escala);
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.95);
    g.fillRoundedRect(-LARG / 2, -ALT / 2, LARG, ALT, 28);
    g.lineStyle(6, atual ? CORES.sucesso : 0xe6c9a8, 1);
    g.strokeRoundedRect(-LARG / 2, -ALT / 2, LARG, ALT, 28);
    c.add(g);
    c.add(imagemVetorial(this, `avatar:${p.avatar}:70`, { x: -76, y: -76, largura: 152, altura: 152 }, (ga) => desenharAvatar(ga, p.avatar, 0, 0, 70), 0, -40));
    c.add(this.add.text(0, 62, nomeExibido(p), { fontFamily: FONTE, fontSize: '30px', color: '#3b2a20', fontStyle: 'bold' }).setOrigin(0.5));
    if (base) {
      const fases = montarTrilha(ordemDaTrilhaJson(), RECEITAS, carregarEstrelas(armazenamentoDoPerfil(base, p.id)));
      const { estrelas, maximo } = placar(fases);
      c.add(this.add.image(-34, 104, 'estrela').setScale(1.4).setTint(CORES.destaque));
      c.add(this.add.text(-14, 104, `${estrelas}/${maximo}`, { fontFamily: FONTE, fontSize: '24px', color: '#3b2a20' }).setOrigin(0, 0.5));
    }
    if (this.gerenciar) {
      const lixeira = new PauseButton(
        this,
        () => {
          apagarPerfil(armazenamentoLocal(), p.id);
          AudioSystem.get()?.efeito('pop');
          this.scene.restart({ gerenciar: true });
        },
        { x: x + (LARG / 2 - 20) * escala, y: y - (ALT / 2 - 20) * escala, icone: 'lixeira' },
      );
      lixeira.setDepth(110);
      return;
    }
    c.setSize(LARG, ALT).setInteractive({ useHandCursor: true });
    aoSoltarNoObjeto(c, () => {
      const audio = AudioSystem.get();
      audio?.desbloquear();
      audio?.efeito('pop');
      escolherPerfil(armazenamentoLocal(), p.id);
      this.scene.start('Trilha');
    });
  }

  private cartaoNovo(x: number, y: number, compacto: boolean): void {
    const c = this.add.container(x, y).setName('perfil:novo').setScale(compacto ? 0.86 : 1);
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.6);
    g.fillRoundedRect(-LARG / 2, -ALT / 2, LARG, ALT, 28);
    g.lineStyle(5, 0xb0a49a, 1);
    g.strokeRoundedRect(-LARG / 2, -ALT / 2, LARG, ALT, 28);
    g.fillStyle(CORES.sucesso, 1);
    g.fillCircle(0, -30, 62);
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(-9, -70, 18, 80, 8);
    g.fillRoundedRect(-40, -39, 80, 18, 8);
    c.add(g);
    c.add(this.add.text(0, 72, 'Novo jogador', { fontFamily: FONTE, fontSize: '26px', color: '#3b2a20' }).setOrigin(0.5));
    c.setSize(LARG, ALT).setInteractive({ useHandCursor: true });
    aoSoltarNoObjeto(c, () => {
      AudioSystem.get()?.efeito('pop');
      this.scene.start('NovoPerfil');
    });
  }
}
