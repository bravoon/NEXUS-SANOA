/**
 * Polvilhar (parte do "decorar", pura): sacudir o polvilhador SOBRE o bolo carimba um
 * círculo de polvilho logo abaixo dele, numa grade de cobertura do topo do bolo.
 * Mover sem sacudir, sacudir fora do bolo ou ficar parado não polvilha nada.
 *
 * REGRA: este arquivo não usa tweens nem timers (verificado por teste).
 */
import { CONFIG_COBERTURA, CONFIG_POLVILHAR } from '../../config/gameplay';
import { CoverageGrid, type Mascara, type Retangulo } from '../coverage/CoverageGrid';
import { ShakeRecognizer } from '../gesture/recognizers/ShakeRecognizer';
import type { Ponto } from '../../utils/math';

export class SprinkleStep {
  private readonly sacudir = new ShakeRecognizer(CONFIG_POLVILHAR);
  private grade: CoverageGrid | null = null;
  private mascara: Mascara = () => false;
  private n = 0;

  constructor(readonly meta: number) {
    if (!(meta > 0 && meta <= 1)) throw new Error('meta de polvilho deve estar em (0, 1]');
  }

  definirSuperficie(area: Retangulo, mascara: Mascara): void {
    this.mascara = mascara;
    this.grade = new CoverageGrid(area, CONFIG_COBERTURA.colunas, CONFIG_COBERTURA.linhas, mascara);
  }

  get definido(): boolean {
    return this.grade !== null;
  }

  /**
   * Amostra do polvilhador em (x, y). Retorna o centro onde o polvilho caiu (para o visual)
   * ou null se nada caiu.
   */
  amostra(x: number, y: number, tMs: number): Ponto | null {
    const g = this.grade;
    if (!g) return null;
    const alvo = { x, y: y + CONFIG_POLVILHAR.quedaPx };
    if (!this.mascara(alvo.x, alvo.y)) {
      this.sacudir.parar();
      return null;
    }
    if (this.sacudir.amostra(x, tMs) === 0) return null;
    this.n++;
    g.pintarPonto(alvo.x, alvo.y, CONFIG_POLVILHAR.raioPx);
    return alvo;
  }

  fimDoGesto(): void {
    this.sacudir.parar();
  }

  get sacudidas(): number {
    return this.n;
  }

  get cobertura(): number {
    return this.grade?.razao ?? 0;
  }

  get progresso(): number {
    return Math.min(1, this.cobertura / this.meta);
  }

  metaAtingida(): boolean {
    return this.cobertura >= this.meta - 1e-9;
  }
}
