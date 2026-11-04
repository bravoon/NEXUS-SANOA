/**
 * Resultado: a foto do bolo decorado pela criança, com festa. O bolo é guardado na galeria
 * automaticamente (a criança não perde o bolo por esquecer de salvar) e o progresso é contado.
 */
import Phaser from 'phaser';
import { ALTURA, CORES, LARGURA } from '../config/layout';
import type { Sessao } from '../systems/recipe/Sessao';
import { botaoGrande } from './ui';
import { AudioSystem } from '../systems/audio/AudioSystem';
import { registrarConclusao, salvarBolo } from '../systems/save/Galeria';
import { carregarPreferencias } from '../systems/save/Preferencias';
import { armazenamentoJogador } from '../systems/save/Perfis';
import { avaliar } from '../systems/progresso/Avaliacao';
import { carregarEstrelas, montarTrilha, registrarEstrelas } from '../systems/progresso/Trilha';
import { RECEITAS } from '../data/registry';
import { MUNDOS, ordemDaTrilhaJson } from '../data/trilhaDados';

export class ResultadoScene extends Phaser.Scene {
  private sessao!: Sessao;

  constructor() {
    super('Resultado');
  }

  init(dados: { sessao: Sessao }): void {
    this.sessao = dados.sessao;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0xfce4ec);
    this.cameras.main.fadeIn(300, 255, 244, 230);
    const raios = this.add.graphics();
    for (let i = 0; i < 16; i++) {
      raios.fillStyle(i % 2 ? 0xffffff : CORES.destaque, 0.35);
      const a = (i / 16) * Math.PI * 2;
      const b = ((i + 1) / 16) * Math.PI * 2;
      raios.fillTriangle(0, 0, Math.cos(a) * 900, Math.sin(a) * 900, Math.cos(b) * 900, Math.sin(b) * 900);
    }
    raios.setPosition(LARGURA / 2, 330);
    this.tweens.add({ targets: raios, angle: 360, duration: 30000, repeat: -1 });

    const foto = this.sessao.fotoBolo;
    if (foto && this.textures.exists(foto)) {
      const img = this.add.image(LARGURA / 2, 320, foto);
      const k = Math.min(1.1, 560 / img.width, 330 / img.height);
      img.setScale(k * 0.6);
      this.tweens.add({ targets: img, scale: k, duration: 600, ease: 'Back.Out' });
    }

    this.add
      .text(LARGURA / 2, 70, `${this.sessao.receita.nome} pronto!`, {
        fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
        fontSize: '56px',
        color: '#3b2a20',
        fontStyle: 'bold',
        stroke: '#ffffff',
        strokeThickness: 8,
      })
      .setOrigin(0.5);

    const e = this.add.particles(LARGURA / 2, 100, 'estrela', {
      speed: { min: 200, max: 420 },
      angle: { min: 0, max: 360 },
      gravityY: 400,
      lifespan: 1600,
      scale: { start: 1.4, end: 0.4 },
      tint: [CORES.destaque, 0xe69f00, 0x56b4e9, 0xcc79a7],
      emitting: false,
    });
    e.explode(40);

    const audio = AudioSystem.get();
    audio?.efeito('festa');
    audio?.falar('resultado');
    this.guardar();
    this.mostrarEstrelas();
    botaoGrande(this, LARGURA / 2 - 330, ALTURA - 60, '▶ Trilha', CORES.sucesso, () => this.scene.start('Trilha'), 280, 84);
    botaoGrande(this, LARGURA / 2, ALTURA - 60, '▦ Galeria', 0xcc79a7, () => this.scene.start('Galeria'), 280, 84);
    botaoGrande(this, LARGURA / 2 + 330, ALTURA - 60, '⌂ Início', 0x0072b2, () => this.scene.start('Menu'), 280, 84);
  }

  /**
   * Estrelas da fase (sem punição: terminar já vale 1 e libera a próxima). Mostra só os
   * bônus conquistados e avisa quando uma fase nova foi liberada.
   */
  private mostrarEstrelas(): void {
    const s = this.sessao;
    const arm = armazenamentoJogador();
    const liberar = carregarPreferencias(arm).liberarFases;
    const antes = montarTrilha(ordemDaTrilhaJson(), RECEITAS, carregarEstrelas(arm), liberar);
    const av = avaliar({ excessos: s.excessos, coberturaFinal: s.coberturaFinal, enfeites: s.enfeites });
    const depois = montarTrilha(ordemDaTrilhaJson(), RECEITAS, registrarEstrelas(arm, s.receita.id, av.estrelas), liberar);
    s.estrelasGanhas = av.estrelas;
    const novaFase = depois.find((f, i) => f.liberada && !antes[i]?.liberada) ?? null;

    const audio = AudioSystem.get();
    const y = 535;
    const rotulos = ['Bolo pronto!', av.medidasCertinhas ? 'Medidas certinhas' : '', av.boloCaprichado ? 'Bolo caprichado' : ''];
    const ganhas = [true, av.medidasCertinhas, av.boloCaprichado];
    // as ganhas primeiro (da esquerda para a direita)
    const ordem = [0, 1, 2].sort((a, b) => Number(ganhas[b]) - Number(ganhas[a]));
    ordem.forEach((qual, k) => {
      const x = LARGURA / 2 + (k - 1) * 150;
      const vazia = this.add.image(x, y, 'estrela').setScale(3.4).setTint(0xd8cfc6);
      if (!ganhas[qual]) return;
      const cheia = this.add.image(x, y, 'estrela').setScale(0).setTint(CORES.destaque);
      this.tweens.add({
        targets: cheia,
        scale: 3.4,
        angle: 360,
        duration: 500,
        delay: 500 + k * 450,
        ease: 'Back.Out',
        onStart: () => audio?.efeito('ding'),
      });
      const r = rotulos[qual];
      if (r) this.add.text(x, y + 48, r, { fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif', fontSize: '18px', color: '#3b2a20' }).setOrigin(0.5).setAlpha(0);
      void vazia;
    });
    this.children.list.filter((o): o is Phaser.GameObjects.Text => o instanceof Phaser.GameObjects.Text && o.alpha === 0).forEach((t, i) => this.tweens.add({ targets: t, alpha: 1, delay: 700 + i * 450, duration: 300 }));
    if (av.medidasCertinhas) audio?.falar('estrela.medidas');
    if (av.boloCaprichado) audio?.falar('estrela.capricho');

    if (novaFase) {
      const mundoNovo = MUNDOS.find((m) => m.fases[0] === novaFase.id) ?? null;
      const selo = this.add
        .text(LARGURA - 190, 150, mundoNovo ? `🌍 Mundo ${MUNDOS.indexOf(mundoNovo) + 1} liberado!\n${mundoNovo.nome}` : `🔓 Fase ${novaFase.numero} liberada!\n${novaFase.nome}`, {
          fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
          fontSize: '24px',
          color: '#ffffff',
          align: 'center',
          backgroundColor: '#009e73',
          padding: { x: 16, y: 10 },
        })
        .setOrigin(0.5)
        .setAngle(6)
        .setScale(0);
      this.tweens.add({ targets: selo, scale: 1, duration: 500, delay: 1800, ease: 'Back.Out', onStart: () => audio?.efeito('sucesso') });
      audio?.falar('fase.liberada', 'alta');
    }
  }

  private guardar(): void {
    const s = this.sessao;
    if (s.guardado) return;
    s.guardado = true;
    const arm = armazenamentoJogador();
    registrarConclusao(arm, s.receita.id, s.receita.dificuldade);
    if (!s.fotoUrl) return;
    const r = salvarBolo(arm, {
      id: `${s.receita.id}-${Date.now()}`,
      receitaId: s.receita.id,
      nomeReceita: s.receita.nome,
      dificuldade: s.receita.dificuldade,
      criadoEm: new Date().toISOString(),
      foto: s.fotoUrl,
      enfeites: s.enfeites,
    });
    if (!r.ok) return;
    const selo = this.add
      .text(190, 150, '⭐ Guardado na galeria!', { fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif', fontSize: '24px', color: '#ffffff', backgroundColor: '#cc79a7', padding: { x: 14, y: 8 } })
      .setOrigin(0.5)
      .setAngle(-6)
      .setScale(0);
    this.tweens.add({ targets: selo, scale: 1, duration: 400, delay: 700, ease: 'Back.Out' });
  }
}
