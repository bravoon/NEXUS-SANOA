/**
 * Etapa "forno" (pura), em fases. Cada fase avança SÓ por input, exceto "assando":
 * a exceção aprovada na especificação — depois que a criança fechou a porta e girou o
 * timer, o bolo cresce por tempo (15–25 s).
 *
 *   colocar → fechar → timer → assando → apitou → (abrir) → retirar → concluido
 *
 * - Timer: rotação do botão com o mesmo acumulador do mexer, limitada a 1 volta.
 * - Retirar: sem luva a forma não pode ser pega (`pegarForma` devolve 'quente').
 *
 * REGRA: este arquivo não usa tweens nem timers (o tempo de forno vem de `assar(dt)`).
 */
import { CONFIG_FORNO } from '../../config/gameplay';
import { TAU, clamp } from '../../utils/math';
import { AngularAccumulator } from '../gesture/recognizers/AngularAccumulator';

export type FaseForno = 'colocar' | 'fechar' | 'timer' | 'assando' | 'apitou' | 'retirar' | 'concluido';

export class OvenStep {
  readonly tipo = 'forno' as const;
  readonly duracaoMs: number;
  readonly botao: AngularAccumulator;
  private f: FaseForno = 'colocar';
  private assado = 0;
  private luva = false;
  private segurandoForma = false;

  constructor(tempoSegundos: number, private readonly cfg = CONFIG_FORNO) {
    this.duracaoMs = clamp(tempoSegundos, cfg.tempoMinSeg, cfg.tempoMaxSeg) * 1000;
    // espaço normalizado do botão: centro (0,0), raio 100 (a cena converte)
    this.botao = new AngularAccumulator({ x: 0, y: 0 }, 100);
  }

  get fase(): FaseForno {
    return this.f;
  }

  colocarForma(): boolean {
    if (this.f !== 'colocar') return false;
    this.f = 'fechar';
    return true;
  }

  /** Toque na porta: fecha (antes de assar) ou abre (depois do apito). */
  tocarPorta(): 'fechou' | 'abriu' | 'nada' {
    if (this.f === 'fechar') {
      this.f = 'timer';
      return 'fechou';
    }
    if (this.f === 'apitou') {
      this.f = 'retirar';
      return 'abriu';
    }
    return 'nada';
  }

  /** Amostra do dedo no botão do timer (coordenadas normalizadas). */
  girarTimer(nx: number, ny: number, tMs: number): void {
    if (this.f !== 'timer') return;
    this.botao.addSample(nx, ny, tMs);
    if (this.voltasTimer >= this.cfg.voltaTimer) {
      this.f = 'assando';
      this.botao.endGesture();
    }
  }

  soltarTimer(): void {
    this.botao.endGesture();
  }

  /** Volta do botão (0..1), limitada a 1 volta. */
  get voltasTimer(): number {
    // Depois de ligado (≥ voltaTimer, tolerância para dedos pequenos) o botão mostra a volta completa.
    if (this.f !== 'colocar' && this.f !== 'fechar' && this.f !== 'timer') return 1;
    return Math.min(1, this.botao.totalRad / TAU);
  }

  /** Avança o cozimento. Só tem efeito na fase "assando". */
  assar(dtMs: number): void {
    if (this.f !== 'assando' || !(dtMs > 0)) return;
    this.assado = Math.min(this.duracaoMs, this.assado + dtMs);
    if (this.assado >= this.duracaoMs) this.f = 'apitou';
  }

  get progressoAssar(): number {
    return this.assado / this.duracaoMs;
  }

  equiparLuva(): boolean {
    if (this.f !== 'apitou' && this.f !== 'retirar') return false;
    this.luva = true;
    return true;
  }

  get comLuva(): boolean {
    return this.luva;
  }

  /** Tentar pegar a forma de dentro do forno. */
  pegarForma(): 'ok' | 'quente' | 'fechado' | 'cedo' {
    if (this.f === 'apitou') return 'fechado';
    if (this.f !== 'retirar') return 'cedo';
    if (!this.luva) return 'quente';
    this.segurandoForma = true;
    return 'ok';
  }

  /** Soltou a forma: se foi na bancada, a etapa termina. */
  soltarForma(naBancada: boolean): void {
    if (!this.segurandoForma) return;
    this.segurandoForma = false;
    if (naBancada && this.f === 'retirar') this.f = 'concluido';
  }

  get segurando(): boolean {
    return this.segurandoForma;
  }

  get progresso(): number {
    const ordem: FaseForno[] = ['colocar', 'fechar', 'timer', 'assando', 'apitou', 'retirar', 'concluido'];
    return ordem.indexOf(this.f) / (ordem.length - 1);
  }

  /** Erro "quente": tentou pegar a forma sem luva e ainda não pegou a luva. */
  erroPendente(): boolean {
    return !this.luva && (this.f === 'apitou' || this.f === 'retirar');
  }

  metaAtingida(): boolean {
    return this.f === 'concluido';
  }
}
