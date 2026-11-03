/**
 * AudioSystem: efeitos (Sintetizador), música e narração com fila (sem sobreposição).
 *
 * Narração, em ordem de preferência:
 *   1. arquivo pré-gravado pt-BR  (src/assets/voz/<id>.mp3, carregado na Preload como "voz:<id>")
 *   2. voz do sistema pt-BR (Web Speech API), se existir uma voz em português
 *   3. silencioso: só o balão do mascote; a fila espera o tempo estimado de leitura
 * Enquanto alguém fala, a música abaixa (ducking).
 *
 * Instância única por jogo (as cenas trocam, o áudio continua).
 */
import Phaser from 'phaser';
import falas from '../../data/falas.json';
import { armazenamentoLocal, carregarPreferencias, salvarPreferencias, type Preferencias } from '../save/Preferencias';
import { FilaNarracao, type Prioridade, type ReprodutorFala } from './FilaNarracao';
import { Musica, Sintetizador, type Continuo, type Efeito } from './Sintetizador';

export const FALAS = falas as Record<string, string>;

/** Tempo estimado de uma fala (ms) quando não há áudio: ~14 caracteres por segundo + respiro. */
export function duracaoEstimada(texto: string): number {
  return Math.min(9000, 900 + (texto.length / 14) * 1000);
}

class ReprodutorVoz implements ReprodutorFala {
  private somAtual: Phaser.Sound.BaseSound | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private vozPt: SpeechSynthesisVoice | null = null;

  constructor(
    private readonly jogo: Phaser.Game,
    private readonly volume: () => number,
    private readonly aoFalar: (falando: boolean) => void,
  ) {
    const synth = globalThis.speechSynthesis as SpeechSynthesis | undefined;
    if (synth) {
      const escolher = () => {
        const vozes = synth.getVoices();
        this.vozPt = vozes.find((v) => v.lang === 'pt-BR') ?? vozes.find((v) => v.lang.toLowerCase().startsWith('pt')) ?? null;
      };
      escolher();
      synth.addEventListener?.('voiceschanged', escolher);
    }
  }

  tocar(id: string, fim: () => void): void {
    const texto = FALAS[id] ?? '';
    let terminou = false;
    const acabar = () => {
      if (terminou) return;
      terminou = true;
      if (this.timeout) clearTimeout(this.timeout);
      this.timeout = null;
      this.somAtual = null;
      this.aoFalar(false);
      fim();
    };
    this.aoFalar(true);
    // salvaguarda: nenhuma fala segura a fila para sempre
    this.timeout = setTimeout(acabar, duracaoEstimada(texto) + 4000);

    const chave = `voz:${id}`;
    if (this.jogo.cache.audio.exists(chave)) {
      const som = this.jogo.sound.add(chave, { volume: this.volume() });
      this.somAtual = som;
      som.once('complete', () => {
        som.destroy();
        acabar();
      });
      som.play();
      return;
    }
    const synth = globalThis.speechSynthesis as SpeechSynthesis | undefined;
    if (synth && this.vozPt && texto) {
      const u = new SpeechSynthesisUtterance(texto);
      u.voice = this.vozPt;
      u.lang = this.vozPt.lang;
      u.rate = 0.95;
      u.pitch = 1.25; // voz de personagem, mais aguda
      u.volume = this.volume();
      u.onend = acabar;
      u.onerror = acabar;
      synth.speak(u);
      return;
    }
    // silencioso: o balão mostra o texto; a fila respeita o tempo de leitura
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = setTimeout(acabar, duracaoEstimada(texto));
  }

  parar(): void {
    this.somAtual?.stop();
    this.somAtual?.destroy();
    this.somAtual = null;
    globalThis.speechSynthesis?.cancel();
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = null;
    this.aoFalar(false);
  }

  /** Há narração com som (arquivo ou voz do sistema)? Para a área dos pais. */
  get fonte(): 'voz do sistema' | 'sem voz' {
    return this.vozPt ? 'voz do sistema' : 'sem voz';
  }
}

export class AudioSystem {
  private static unico: AudioSystem | null = null;

  private ctx: AudioContext | null = null;
  private geral: GainNode | null = null;
  private efeitos: GainNode | null = null;
  private trilha: GainNode | null = null;
  private synth: Sintetizador | null = null;
  private musica: Musica | null = null;
  private readonly voz: ReprodutorVoz;
  private readonly fila: FilaNarracao;
  private falando = false;
  private p: Preferencias;

  private constructor(private readonly jogo: Phaser.Game) {
    this.p = carregarPreferencias(armazenamentoLocal());
    const sm = jogo.sound;
    if (sm instanceof Phaser.Sound.WebAudioSoundManager) {
      const ctx = sm.context;
      this.ctx = ctx;
      this.geral = ctx.createGain();
      this.geral.connect(ctx.destination);
      this.efeitos = ctx.createGain();
      this.efeitos.connect(this.geral);
      this.trilha = ctx.createGain();
      this.trilha.connect(this.geral);
      this.synth = new Sintetizador(ctx, this.efeitos);
      this.musica = new Musica(ctx, this.trilha);
    }
    this.voz = new ReprodutorVoz(jogo, () => this.p.volumeGeral, (f) => {
      this.falando = f;
      this.aplicarVolumes();
    });
    this.fila = new FilaNarracao(this.voz);
    this.aplicarVolumes();
    jogo.events.on(Phaser.Core.Events.BLUR, () => this.synth?.silenciarContinuos());
  }

  static iniciar(jogo: Phaser.Game): AudioSystem {
    AudioSystem.unico ??= new AudioSystem(jogo);
    return AudioSystem.unico;
  }

  /** Instância atual (ou um "nulo" seguro antes de iniciar, p.ex. em testes). */
  static get(): AudioSystem | null {
    return AudioSystem.unico;
  }

  get preferencias(): Readonly<Preferencias> {
    return this.p;
  }

  get temSintese(): boolean {
    return this.synth !== null;
  }

  /** Descrição da fonte da narração (área dos pais). */
  get fonteVoz(): string {
    const gravadas = this.jogo.cache.audio.getKeys().filter((k) => k.startsWith('voz:')).length;
    const total = Object.keys(FALAS).length;
    const resto = this.voz.fonte === 'voz do sistema' ? 'voz do sistema' : 'só balão de texto';
    return gravadas > 0 ? `${gravadas}/${total} falas gravadas · demais: ${resto}` : `sem gravações · ${resto}`;
  }

  atualizarPreferencias(mudanca: Partial<Preferencias>): void {
    this.p = { ...this.p, ...mudanca };
    salvarPreferencias(armazenamentoLocal(), this.p);
    if (!this.p.narracao) this.fila.parar();
    this.aplicarVolumes();
    if (this.p.musica) this.iniciarMusica();
    else this.musica?.parar();
  }

  private aplicarVolumes(): void {
    if (!this.ctx || !this.geral || !this.efeitos || !this.trilha) return;
    const t = this.ctx.currentTime;
    this.geral.gain.setTargetAtTime(this.p.volumeGeral, t, 0.05);
    this.efeitos.gain.setTargetAtTime(this.p.volumeEfeitos, t, 0.05);
    const musica = this.p.musica ? this.p.volumeMusica * (this.falando ? 0.35 : 1) : 0;
    this.trilha.gain.setTargetAtTime(musica, t, 0.15);
  }

  efeito(e: Efeito): void {
    this.synth?.tocar(e);
  }

  continuo(tipo: Continuo, intensidade: number): void {
    this.synth?.continuo(tipo, intensidade, performance.now());
  }

  /** Chamado a cada frame pela cena ativa. */
  atualizar(): void {
    this.synth?.atualizar(performance.now());
  }

  falar(id: string, prioridade: Prioridade = 'normal'): void {
    if (!this.p.narracao || !(id in FALAS)) return;
    this.fila.falar(id, prioridade);
  }

  /** Troca de cena: descarta falas pendentes (ficaram velhas), mas deixa terminar a atual. */
  limparFalas(): void {
    this.fila.limpar();
  }

  iniciarMusica(): void {
    if (this.p.musica && this.ctx?.state === 'running') this.musica?.iniciar();
  }

  /** App em segundo plano: silencia tudo (música, contínuos, fala). */
  suspender(): void {
    this.synth?.silenciarContinuos();
    this.musica?.parar();
    this.fila.parar();
    if (this.ctx?.state === 'running') void this.ctx.suspend();
  }

  /** App de volta ao primeiro plano. */
  retomar(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume().then(() => this.iniciarMusica());
  }

  /** O navegador libera o áudio só depois de um toque: chamar no primeiro input. */
  desbloquear(): void {
    if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume().then(() => this.iniciarMusica());
    else this.iniciarMusica();
  }
}
