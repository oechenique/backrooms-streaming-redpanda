// Movimiento en primera persona con colisión círculo contra las paredes de las celdas cercanas.

import { Dir, Edge } from '../world';
import type { Input } from './input';
import { CELL, DOOR_W, isOpen, isPortal, WALL_T, type Level } from './level';

const RADIUS = 0.28;
export const SNEAK = 0.85; // m/s: por debajo del umbral de oído de La Interferencia
export const WALK = 1.7;
export const RUN = 3.4;
const EYE = 1.6;
const PITCH_MAX = 1.4;

// Celda vecina y lado cruzado, para detectar el paso por una puerta.
const NEIGHBOR: ReadonlyArray<[number, number, Dir]> = [
  [-1, 0, Dir.W],
  [1, 0, Dir.E],
  [0, -1, Dir.N],
  [0, 1, Dir.S],
];

/** Medio lado de un pilar, en metros. */
export const PILLAR_HALF = 0.3;

/** Puerta de capa (+1 sube, -1 baja) o noclip a otro nivel. */
export type Crossing = { kind: 'door'; dz: 1 | -1 } | { kind: 'noclip' };

export class Player {
  yaw = 0;
  pitch = 0;
  /** Velocidad real del último frame, en m/s (lo que oye La Interferencia). */
  speed = 0;
  /** Se llama en cada paso, con la velocidad a la que se dio. */
  onStep: (speed: number) => void = () => {};
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

  /** Mueve al jugador. Si cruzó una puerta de capa, lo devuelve (el que llama cambia la capa). */
  update(dt: number, input: Input): Crossing | null {
    const look = input.takeLook(dt);
    this.yaw -= look.yaw;
    this.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, this.pitch - look.pitch));

    const base = input.running ? RUN : input.sneaking ? SNEAK : WALK;
    const step = base * dt;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // Con yaw = 0 la cámara mira hacia -z.
    const mx = (-sin * input.forward + cos * input.strafe) * step;
    const mz = (-cos * input.forward - sin * input.strafe) * step;

    const x0 = this.x;
    const z0 = this.z;
    let crossing: Crossing | null = null;
    // Pasos chicos para no atravesar paredes en un frame lento.
    const n = Math.max(1, Math.ceil(Math.hypot(mx, mz) / (RADIUS / 2)));
    for (let i = 0; i < n && !crossing; i++) {
      const before = this.cell;
      this.x += mx / n;
      this.z += mz / n;
      this.collide();
      this.collide();
      crossing = this.crossed(before);
    }

    const moved = Math.hypot(this.x - x0, this.z - z0);
    this.speed = dt > 0 ? moved / dt : 0;
    // Un paso cada ~0,7 m caminando y ~1 m corriendo: medio ciclo del bamboleo.
    const stride = input.running ? 1 : 0.7;
    const prev = Math.floor(this.bob / Math.PI);
    this.bob += (moved / stride) * Math.PI;
    if (Math.floor(this.bob / Math.PI) !== prev) this.onStep(this.speed);
    return crossing;
  }

  // ¿El centro pasó a la celda vecina a través de una puerta de capa o de una pared de noclip?
  private crossed(before: { rx: number; ry: number }): Crossing | null {
    const { rx, ry } = this.cell;
    for (const [dx, dy, dir] of NEIGHBOR) {
      if (rx - before.rx !== dx || ry - before.ry !== dy) continue;
      const edge = this.level.edge(before.rx, before.ry, dir);
      if (isPortal(edge)) return { kind: 'door', dz: edge === Edge.DOOR_UP ? 1 : -1 };
      if (edge === Edge.WALL && this.level.noclip(before.rx, before.ry, dir)) return { kind: 'noclip' };
    }
    return null;
  }

  // Empuja al jugador fuera de cada caja sólida que lo rodea.
  private collide(): void {
    const { rx, ry } = this.cell;
    for (const [x0, x1, z0, z1] of solidBoxes(this.level, rx, ry)) this.pushOut(x0, x1, z0, z1);
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

/** Caja sólida en el plano: [x0, x1, z0, z1] en metros. */
export type Box = [number, number, number, number];

/**
 * Cajas sólidas cerca de la celda (rx, ry): paredes (cajas delgadas sobre los bordes de las 3×3 celdas), jambas de las
 * puertas de capa y pilares. Las paredes de noclip no cuentan: el jugador se mete en ellas.
 * La colisión y `solidAt` usan esta misma lista.
 */
export function* solidBoxes(level: Level, rx: number, ry: number): Generator<Box> {
  const t = WALL_T / 2;
  const d = DOOR_W / 2;
  for (let cy = ry - 1; cy <= ry + 1; cy++)
    for (let cx = rx - 1; cx <= rx + 1; cx++) {
      const x0 = cx * CELL;
      const z0 = cy * CELL;
      const x1 = x0 + CELL;
      const z1 = z0 + CELL;
      const mx = x0 + CELL / 2;
      const mz = z0 + CELL / 2;
      // Lados E y S de cada celda (los W y N son los E y S de la vecina). Se estiran t para cubrir las esquinas.
      const e = level.edge(cx, cy, Dir.E);
      if (isPortal(e)) {
        yield [x1 - t, x1 + t, z0 - t, mz - d];
        yield [x1 - t, x1 + t, mz + d, z1 + t];
      } else if (!isOpen(e) && !level.noclip(cx, cy, Dir.E)) yield [x1 - t, x1 + t, z0 - t, z1 + t];
      const s = level.edge(cx, cy, Dir.S);
      if (isPortal(s)) {
        yield [x0 - t, mx - d, z1 - t, z1 + t];
        yield [mx + d, x1 + t, z1 - t, z1 + t];
      } else if (!isOpen(s) && !level.noclip(cx, cy, Dir.S)) yield [x0 - t, x1 + t, z1 - t, z1 + t];
    }
  // Pilares en las esquinas (la esquina superior izquierda de cada celda), incluida la fila y columna siguiente.
  const p = PILLAR_HALF;
  for (let cy = ry - 1; cy <= ry + 2; cy++)
    for (let cx = rx - 1; cx <= rx + 2; cx++)
      if (level.pillar(cx, cy)) yield [cx * CELL - p, cx * CELL + p, cy * CELL - p, cy * CELL + p];
}

/** ¿Un cuerpo de radio `radius` parado en (x, z) se superpone con algo sólido? */
export function solidAt(level: Level, x: number, z: number, radius = RADIUS): boolean {
  for (const [x0, x1, z0, z1] of solidBoxes(level, Math.floor(x / CELL), Math.floor(z / CELL))) {
    const dx = x - Math.max(x0, Math.min(x, x1));
    const dz = z - Math.max(z0, Math.min(z, z1));
    if (dx * dx + dz * dz < radius * radius) return true;
  }
  return false;
}
