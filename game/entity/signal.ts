// La señal de La Interferencia: una sola variable de proximidad (threat) y los eventos de falla que salen de ella.
// El grito (scream.ts) y el cuerpo (interferencia.ts) leen este mismo estado en el mismo frame, así el corte del
// audio, el desgarro de la imagen y el salto de posición pasan juntos y se sienten como una sola cosa.

export interface Rng {
  next(): number;
}

/** Cuánto amenaza según humor y distancia, 0..1. Persecución: siempre algo, y crece al acercarse. */
export function threatOf(mood: string, distM: number, present: boolean): number {
  if (!present) return 0;
  const near = (r: number) => Math.max(0, 1 - Math.max(0, distM - 1) / r);
  if (mood === 'hunt') return 0.15 + 0.85 * near(20) ** 1.3;
  if (mood === 'stalk') return 0.35 * near(15);
  return 0;
}

export class Signal {
  /** Proximidad suavizada, 0..1. */
  threat = 0;
  /** Ráfaga de falla, 1 al dispararse y cae en ~150 ms. */
  burst = 0;
  /** Corte abrupto en curso: el grito se calla y la imagen se rompe en bandas. */
  cut = false;
  /** Salto de posición en este frame (solo visual). */
  jump = false;
  private wait = 1;
  private cutLeft = 0;

  constructor(private readonly rng: Rng = { next: Math.random }) {}

  update(dt: number, target: number): void {
    // Sube rápido (el miedo llega de golpe) y baja más lento.
    this.threat += (target - this.threat) * Math.min(1, dt * (target > this.threat ? 6 : 1.5));
    this.burst *= Math.exp(-dt * 7);
    this.jump = false;
    this.cutLeft -= dt;
    this.cut = this.cutLeft > 0;
    if (this.threat < 0.05) return;

    // Las fallas se disparan cada vez más seguido: ~1,6 s lejos, ~0,2 s encima.
    this.wait -= dt;
    if (this.wait > 0) return;
    const r = () => this.rng.next();
    this.wait = (1.6 - 1.4 * this.threat) * (0.5 + r());
    this.burst = 0.5 + 0.5 * r();
    if (r() < 0.25 + 0.5 * this.threat) {
      this.cutLeft = 0.03 + 0.12 * r();
      this.cut = true;
    }
    this.jump = r() < 0.15 + 0.6 * this.threat;
  }
}
