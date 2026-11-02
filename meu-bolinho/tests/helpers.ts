/** Geradores de trajetórias sintéticas de dedo para os testes. */
export interface Amostra {
  x: number;
  y: number;
  t: number;
}

/** Círculo em torno de (0,0). `voltas` pode ser negativo (anti-horário). */
export function circulo(opts: {
  raio: number;
  voltas: number;
  duracaoMs: number;
  t0?: number;
  anguloInicial?: number;
  hz?: number;
}): Amostra[] {
  const hz = opts.hz ?? 60;
  const n = Math.max(1, Math.round((opts.duracaoMs / 1000) * hz));
  const t0 = opts.t0 ?? 0;
  const a0 = opts.anguloInicial ?? 0;
  const out: Amostra[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (i / n) * opts.voltas * Math.PI * 2;
    out.push({ x: Math.cos(a) * opts.raio, y: Math.sin(a) * opts.raio, t: t0 + (i / n) * opts.duracaoMs });
  }
  return out;
}

export function reta(de: { x: number; y: number }, ate: { x: number; y: number }, duracaoMs: number, t0 = 0, hz = 60): Amostra[] {
  const n = Math.max(1, Math.round((duracaoMs / 1000) * hz));
  const out: Amostra[] = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    out.push({ x: de.x + (ate.x - de.x) * k, y: de.y + (ate.y - de.y) * k, t: t0 + k * duracaoMs });
  }
  return out;
}

/** Gerador pseudoaleatório determinístico (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
