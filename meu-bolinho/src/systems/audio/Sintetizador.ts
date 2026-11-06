/**
 * Efeitos sonoros e música gerados por síntese (WebAudio), sem arquivos: 0 bytes no build.
 *
 * Sons CONTÍNUOS (despejar, mexer, pincel, forno) têm intensidade proporcional ao input e
 * precisam ser "alimentados" a cada frame; sem alimentação por ~120 ms eles silenciam sozinhos.
 * Assim o som obedece à mesma regra do jogo: o input parou, o som parou.
 */

export type Efeito =
  | 'pop'
  | 'trinca'
  | 'abre'
  | 'ding'
  | 'sucesso'
  | 'boing'
  | 'apito'
  | 'porta'
  | 'clique'
  | 'whoosh'
  | 'colher'
  | 'chocalho'
  | 'tum'
  | 'festa';

export type Continuo = 'po' | 'liquido' | 'massa' | 'mexer' | 'pincel' | 'forno';

interface CanalContinuo {
  ganho: GainNode;
  ultimoPedido: number;
  base: number;
}

const SILENCIAR_APOS_MS = 120;

export class Sintetizador {
  private readonly ruido: AudioBuffer;
  private readonly canais = new Map<Continuo, CanalContinuo>();

  constructor(
    private readonly ctx: AudioContext,
    private readonly destino: AudioNode,
  ) {
    const n = ctx.sampleRate * 2;
    this.ruido = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = this.ruido.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }

  // ------------------------------------------------------------------ primitivas

  private tom(freq: number, inicio: number, dur: number, tipo: OscillatorType = 'sine', vol = 0.3, freqFim?: number): void {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = tipo;
    o.frequency.setValueAtTime(freq, inicio);
    if (freqFim) o.frequency.exponentialRampToValueAtTime(freqFim, inicio + dur);
    g.gain.setValueAtTime(0.0001, inicio);
    g.gain.exponentialRampToValueAtTime(vol, inicio + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, inicio + dur);
    o.connect(g).connect(this.destino);
    o.start(inicio);
    o.stop(inicio + dur + 0.05);
  }

  private chiado(inicio: number, dur: number, filtro: BiquadFilterType, freq: number, vol = 0.3, freqFim?: number, q = 1): void {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.ruido;
    const f = c.createBiquadFilter();
    f.type = filtro;
    f.frequency.setValueAtTime(freq, inicio);
    if (freqFim) f.frequency.exponentialRampToValueAtTime(freqFim, inicio + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, inicio);
    g.gain.exponentialRampToValueAtTime(vol, inicio + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, inicio + dur);
    s.connect(f).connect(g).connect(this.destino);
    s.start(inicio, Math.random());
    s.stop(inicio + dur + 0.05);
  }

  // ------------------------------------------------------------------ efeitos

  tocar(e: Efeito): void {
    const t = this.ctx.currentTime + 0.005;
    switch (e) {
      case 'pop':
        this.tom(520, t, 0.09, 'sine', 0.25, 1100);
        break;
      case 'trinca':
        this.chiado(t, 0.05, 'highpass', 3000, 0.45);
        this.tom(1800, t, 0.03, 'square', 0.08);
        break;
      case 'abre':
        this.chiado(t, 0.18, 'bandpass', 500, 0.35, 180, 2);
        this.tom(320, t + 0.03, 0.18, 'sine', 0.2, 90);
        break;
      case 'ding':
        this.tom(1320, t, 0.6, 'sine', 0.2);
        this.tom(1980, t, 0.4, 'sine', 0.08);
        break;
      case 'sucesso':
        [523, 659, 784, 1047].forEach((f, i) => this.tom(f, t + i * 0.09, 0.3, 'triangle', 0.22));
        break;
      case 'festa':
        [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tom(f, t + i * 0.11, 0.35, 'triangle', 0.22));
        for (let i = 0; i < 6; i++) this.chiado(t + 0.1 * i, 0.08, 'highpass', 5000, 0.08);
        break;
      case 'boing':
        // reação engraçada (nunca soa como "errado/punição")
        this.tom(260, t, 0.3, 'sine', 0.28, 520);
        this.tom(390, t + 0.12, 0.2, 'triangle', 0.1, 200);
        break;
      case 'apito':
        for (let i = 0; i < 3; i++) this.tom(880, t + i * 0.25, 0.16, 'square', 0.12);
        break;
      case 'porta':
        this.chiado(t, 0.12, 'lowpass', 400, 0.5);
        this.tom(110, t, 0.12, 'sine', 0.3, 60);
        break;
      case 'clique':
        this.tom(2200, t, 0.025, 'square', 0.06);
        break;
      case 'whoosh':
        this.chiado(t, 0.3, 'bandpass', 300, 0.35, 2400, 1.5);
        break;
      case 'colher':
        this.tom(2600, t, 0.18, 'sine', 0.12);
        this.tom(3900, t, 0.12, 'sine', 0.06);
        break;
      case 'chocalho':
        for (let i = 0; i < 5; i++) this.chiado(t + i * 0.025, 0.03, 'highpass', 4000, 0.12);
        break;
      case 'tum':
        this.tom(160, t, 0.15, 'sine', 0.35, 70);
        break;
    }
  }

  // ------------------------------------------------------------------ contínuos

  private criarCanal(tipo: Continuo): CanalContinuo {
    const c = this.ctx;
    const ganho = c.createGain();
    ganho.gain.value = 0;
    ganho.connect(this.destino);
    const fonte = c.createBufferSource();
    fonte.buffer = this.ruido;
    fonte.loop = true;
    const f = c.createBiquadFilter();
    let base = 0.25;
    switch (tipo) {
      case 'po':
        f.type = 'lowpass';
        f.frequency.value = 1400;
        base = 0.22;
        break;
      case 'liquido': {
        f.type = 'bandpass';
        f.frequency.value = 650;
        f.Q.value = 3;
        // "glub-glub": LFO na frequência do filtro
        const lfo = c.createOscillator();
        const prof = c.createGain();
        lfo.frequency.value = 7;
        prof.gain.value = 280;
        lfo.connect(prof).connect(f.frequency);
        lfo.start();
        base = 0.4;
        break;
      }
      case 'massa':
        f.type = 'lowpass';
        f.frequency.value = 320;
        base = 0.5;
        break;
      case 'mexer':
        f.type = 'bandpass';
        f.frequency.value = 900;
        f.Q.value = 1.2;
        base = 0.25;
        break;
      case 'pincel':
        f.type = 'highpass';
        f.frequency.value = 2200;
        base = 0.1;
        break;
      case 'forno': {
        f.type = 'lowpass';
        f.frequency.value = 220;
        const zumbido = c.createOscillator();
        const gz = c.createGain();
        zumbido.frequency.value = 96;
        gz.gain.value = 0.15;
        zumbido.connect(gz).connect(ganho);
        zumbido.start();
        base = 0.35;
        break;
      }
    }
    fonte.connect(f).connect(ganho);
    fonte.start();
    const canal = { ganho, ultimoPedido: 0, base };
    this.canais.set(tipo, canal);
    return canal;
  }

  /** Mantém um som contínuo com intensidade 0..1. Precisa ser chamado a cada frame. */
  continuo(tipo: Continuo, intensidade: number, agoraMs: number): void {
    const canal = this.canais.get(tipo) ?? this.criarCanal(tipo);
    canal.ultimoPedido = agoraMs;
    const alvo = Math.max(0, Math.min(1, intensidade)) * canal.base;
    canal.ganho.gain.setTargetAtTime(alvo, this.ctx.currentTime, 0.04);
  }

  /** Silencia os contínuos que não foram alimentados recentemente. */
  atualizar(agoraMs: number): void {
    for (const canal of this.canais.values()) {
      if (agoraMs - canal.ultimoPedido > SILENCIAR_APOS_MS) canal.ganho.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
  }

  silenciarContinuos(): void {
    for (const canal of this.canais.values()) canal.ganho.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
  }
}

/**
 * Música de fundo gerada: melodia pentatônica suave em loop (marimba), agendada com
 * antecedência no relógio do AudioContext.
 */
export class Musica {
  private timer: ReturnType<typeof setInterval> | null = null;
  private passo = 0;
  private proximoTempo = 0;
  private static readonly BPM = 96;
  private static readonly MELODIA = [0, 2, 4, 7, 4, 2, 4, -1, 7, 9, 7, 4, 2, 4, 0, -1];
  private static readonly BAIXO = [0, -1, -1, -1, 5, -1, -1, -1, 3, -1, -1, -1, 4, -1, -1, -1];
  private static readonly ESCALA = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16];

  constructor(
    private readonly ctx: AudioContext,
    private readonly destino: AudioNode,
  ) {}

  private nota(grau: number, oitava: number, t: number, vol: number): void {
    const semitom = Musica.ESCALA[grau] ?? 0;
    const f = 261.63 * 2 ** (oitava + semitom / 12);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g).connect(this.destino);
    o.start(t);
    o.stop(t + 0.5);
  }

  iniciar(): void {
    if (this.timer) return;
    this.proximoTempo = this.ctx.currentTime + 0.1;
    const passoSeg = 60 / Musica.BPM / 2;
    this.timer = setInterval(() => {
      while (this.proximoTempo < this.ctx.currentTime + 0.3) {
        const i = this.passo % 16;
        const m = Musica.MELODIA[i] ?? -1;
        const b = Musica.BAIXO[i] ?? -1;
        if (m >= 0) this.nota(m, 0, this.proximoTempo, 0.12);
        if (b >= 0) this.nota(b, -1, this.proximoTempo, 0.1);
        this.passo++;
        this.proximoTempo += passoSeg;
      }
    }, 100);
  }

  parar(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  get tocando(): boolean {
    return this.timer !== null;
  }
}
