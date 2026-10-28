// Movimiento en primera persona con colisión círculo contra las paredes de las celdas cercanas.

import { Dir } from '../world';
import type { Input } from './input';
import { CELL, WALL_T, type Level } from './level';

const RADIUS = 0.28;
const WALK = 1.7; // m/s
const RUN = 3.4;
const EYE = 1.6;
const PITCH_MAX = 1.4;

export class Player {
  yaw = 0;
  pitch = 0;
  private bob = 0;

  constructor(
    private readonly level: Level,
    /** Posición en metros, relativa a la zona de arranque. */
    public x: number,
    public z: number,
  ) {}

  /** Celda relativa que pisa el jugador. */
  get cell(): { rx: number; ry: number } {
    return { rx: Math.floor(this.x / CELL), ry: Math.floor(this.z / CELL) };
  }

  get eyeY(): number {
    return EYE + Math.sin(this.bob) * 0.025;
  }

  update(dt: number, input: Input): void {
    const look = input.takeLook(dt);
    this.yaw -= look.yaw;
    this.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, this.pitch - look.pitch));

    const speed = (input.running ? RUN : WALK) * dt;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // Con yaw = 0 la cámara mira hacia -z.
    const mx = (-sin * input.forward + cos * input.strafe) * speed;
    const mz = (-cos * input.forward - sin * input.strafe) * speed;
    const dist = Math.hypot(mx, mz);
    if (dist > 0) this.bob += dist * (input.running ? 4.5 : 5.5);

    // Pasos chicos para no atravesar paredes en un frame lento.
    const steps = Math.max(1, Math.ceil(dist / (RADIUS / 2)));
    for (let i = 0; i < steps; i++) {
      this.x += mx / steps;
      this.z += mz / steps;
      this.collide();
      this.collide();
    }
  }

  // Empuja al jugador fuera de cada pared (caja delgada sobre el borde) de las 3×3 celdas que lo rodean.
  private collide(): void {
    const { rx, ry } = this.cell;
    const t = WALL_T / 2;
    for (let cy = ry - 1; cy <= ry + 1; cy++)
      for (let cx = rx - 1; cx <= rx + 1; cx++) {
        const x0 = cx * CELL;
        const z0 = cy * CELL;
        const x1 = x0 + CELL;
        const z1 = z0 + CELL;
        // Lados E y S de cada celda (los W y N son los E y S de la vecina). Se estiran t para cubrir las esquinas.
        if (this.level.blocked(cx, cy, Dir.E)) this.pushOut(x1 - t, x1 + t, z0 - t, z1 + t);
        if (this.level.blocked(cx, cy, Dir.S)) this.pushOut(x0 - t, x1 + t, z1 - t, z1 + t);
      }
  }

  private pushOut(x0: number, x1: number, z0: number, z1: number): void {
    const px = Math.max(x0, Math.min(this.x, x1));
    const pz = Math.max(z0, Math.min(this.z, z1));
    const dx = this.x - px;
    const dz = this.z - pz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= RADIUS * RADIUS) return;
    if (d2 > 1e-12) {
      const d = Math.sqrt(d2);
      this.x = px + (dx / d) * RADIUS;
      this.z = pz + (dz / d) * RADIUS;
    } else {
      // El centro quedó dentro de la caja: salir por el lado más cercano.
      const exits = [this.x - x0, x1 - this.x, this.z - z0, z1 - this.z];
      const i = exits.indexOf(Math.min(...exits));
      if (i === 0) this.x = x0 - RADIUS;
      else if (i === 1) this.x = x1 + RADIUS;
      else if (i === 2) this.z = z0 - RADIUS;
      else this.z = z1 + RADIUS;
    }
  }
}
