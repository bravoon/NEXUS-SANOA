/**
 * Galeria: os bolos que a criança fez (fotos salvas neste aparelho).
 * Toque numa foto para ampliar. Apagar exige segurar a lixeira 2 s (evita apagar sem querer).
 */
import Phaser from 'phaser';
import { TEXTURAS } from '../art/ArteProcedural';
import { ALTURA, CORES, LARGURA } from '../config/layout';
import { PauseButton } from '../entities/PauseButton';
import { AudioSystem } from '../systems/audio/AudioSystem';
import { carregarGaleria, removerBolo, type BoloSalvo } from '../systems/save/Galeria';
import { armazenamentoLocal } from '../systems/save/Preferencias';
import { aoSoltarNoObjeto, botaoGrande } from './ui';

const FONTE = 'Arial Rounded MT Bold, Arial, sans-serif';
const COLUNAS = 4;
const LINHAS = 2;
const POR_PAGINA = COLUNAS * LINHAS;
const MINI = { largura: 250, altura: 190 } as const;

export class GaleriaScene extends Phaser.Scene {
  private bolos: BoloSalvo[] = [];
  private pagina = 0;
  private grade!: Phaser.GameObjects.Container;
  private ampliado: Phaser.GameObjects.Container | null = null;
  private setas: Phaser.GameObjects.Container[] = [];

  constructor() {
    super('Galeria');
  }

  create(): void {
    this.add.image(0, 0, TEXTURAS.fundoMenu).setOrigin(0);
    this.add.text(LARGURA / 2, 52, 'Meus bolos', { fontFamily: FONTE, fontSize: '50px', color: '#3b2a20', fontStyle: 'bold', stroke: '#ffffff', strokeThickness: 8 }).setOrigin(0.5);
    botaoGrande(this, 90, 52, '⌂', 0x0072b2, () => this.scene.start('Menu'), 120, 80);
    this.grade = this.add.container(0, 0);
    this.ampliado = null;
    this.pagina = 0;
    this.bolos = carregarGaleria(armazenamentoLocal());
    this.setas = [
      botaoGrande(this, 60, 390, '◀', 0xe69f00, () => this.mudarPagina(-1), 90, 90),
      botaoGrande(this, LARGURA - 60, 390, '▶', 0xe69f00, () => this.mudarPagina(1), 90, 90),
    ];
    this.desenharPagina();
  }

  private get paginas(): number {
    return Math.max(1, Math.ceil(this.bolos.length / POR_PAGINA));
  }

  private mudarPagina(d: number): void {
    const nova = Phaser.Math.Clamp(this.pagina + d, 0, this.paginas - 1);
    if (nova === this.pagina) return;
    this.pagina = nova;
    AudioSystem.get()?.efeito('clique');
    this.desenharPagina();
  }

  private desenharPagina(): void {
    this.grade.removeAll(true);
    this.setas[0]?.setVisible(this.pagina > 0);
    this.setas[1]?.setVisible(this.pagina < this.paginas - 1);

    if (this.bolos.length === 0) {
      this.grade.add(this.add.text(LARGURA / 2, 330, 'Ainda não tem bolo aqui.\nVamos fazer um?', { fontFamily: FONTE, fontSize: '38px', color: '#3b2a20', align: 'center' }).setOrigin(0.5));
      this.grade.add(botaoGrande(this, LARGURA / 2, 500, '▶  Jogar', CORES.sucesso, () => this.scene.start('Trilha'), 320, 100));
      return;
    }

    const inicio = this.pagina * POR_PAGINA;
    this.bolos.slice(inicio, inicio + POR_PAGINA).forEach((b, i) => {
      const col = i % COLUNAS;
      const lin = Math.floor(i / COLUNAS);
      const x = LARGURA / 2 + (col - (COLUNAS - 1) / 2) * (MINI.largura + 30);
      const y = 250 + lin * (MINI.altura + 50);
      const c = this.add.container(x, y);
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 1);
      g.fillRoundedRect(-MINI.largura / 2, -MINI.altura / 2, MINI.largura, MINI.altura + 30, 16);
      g.lineStyle(4, b.dificuldade === 'confeiteiro' ? 0xe69f00 : 0x56b4e9, 1);
      g.strokeRoundedRect(-MINI.largura / 2, -MINI.altura / 2, MINI.largura, MINI.altura + 30, 16);
      c.add(g);
      c.add(this.add.text(0, MINI.altura / 2 + 2, `${b.nomeReceita} · ${dataCurta(b.criadoEm)}`, { fontFamily: 'Arial, sans-serif', fontSize: '16px', color: '#3b2a20' }).setOrigin(0.5));
      this.carregarFoto(b, (chave) => {
        if (!c.active) return;
        const img = this.add.image(0, -8, chave);
        img.setScale(Math.min((MINI.largura - 16) / img.width, (MINI.altura - 16) / img.height));
        c.add(img);
      });
      c.setSize(MINI.largura, MINI.altura + 30).setInteractive({ useHandCursor: true });
      aoSoltarNoObjeto(c, () => this.ampliar(b));
      this.grade.add(c);
    });
    if (this.paginas > 1) this.grade.add(this.add.text(LARGURA / 2, ALTURA - 30, `${this.pagina + 1} / ${this.paginas}`, { fontFamily: FONTE, fontSize: '22px', color: '#6b5a4e' }).setOrigin(0.5));
  }

  /** Converte a foto (data URL) em textura, uma vez por bolo. */
  private carregarFoto(b: BoloSalvo, pronto: (chave: string) => void): void {
    const chave = `galeria:${b.id}`;
    if (this.textures.exists(chave)) {
      pronto(chave);
      return;
    }
    this.textures.once(`${Phaser.Textures.Events.ADD_KEY}${chave}`, () => pronto(chave));
    this.textures.addBase64(chave, b.foto);
  }

  private ampliar(b: BoloSalvo): void {
    if (this.ampliado) return;
    AudioSystem.get()?.efeito('pop');
    const c = this.add.container(0, 0).setDepth(100);
    const fundo = this.add.rectangle(0, 0, LARGURA, ALTURA, 0x3b2a20, 0.7).setOrigin(0).setInteractive();
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(LARGURA / 2 - 420, 70, 840, 580, 30);
    c.add([fundo, g]);
    this.carregarFoto(b, (chave) => {
      if (!c.active) return;
      const img = this.add.image(LARGURA / 2, 330, chave);
      img.setScale(Math.min(760 / img.width, 440 / img.height));
      c.add(img);
    });
    const estrelas = b.dificuldade === 'confeiteiro' ? '★★' : '★';
    c.add(this.add.text(LARGURA / 2, 590, `${b.nomeReceita}  ${estrelas}  ·  ${dataCurta(b.criadoEm)}  ·  ${b.enfeites} enfeites`, { fontFamily: FONTE, fontSize: '26px', color: '#3b2a20' }).setOrigin(0.5));
    c.add(botaoGrande(this, LARGURA / 2 + 360, 110, '✕', 0xd55e00, () => this.fecharAmpliado(), 90, 80));
    const lixeira = new PauseButton(this, () => {
      removerBolo(armazenamentoLocal(), b.id);
      AudioSystem.get()?.efeito('whoosh');
      this.bolos = carregarGaleria(armazenamentoLocal());
      this.pagina = Math.min(this.pagina, this.paginas - 1);
      this.fecharAmpliado();
      this.desenharPagina();
    }, { x: LARGURA / 2 - 370, y: 110, icone: 'lixeira' });
    lixeira.setDepth(101);
    c.add(lixeira);
    this.ampliado = c;
  }

  private fecharAmpliado(): void {
    this.ampliado?.destroy(true);
    this.ampliado = null;
  }
}

function dataCurta(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}
