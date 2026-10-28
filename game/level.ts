// Puente entre world/ (coordenadas globales de 40 bits) y la escena (metros relativos a la zona de arranque,
// para que Three.js no pierda precisión en float32).

import { Dir, Edge, wrapCell, ZONE_SIZE, type World } from '../world';

/** Lado de una celda en metros. */
export const CELL = 2.2;
export const WALL_H = 2.7;
export const WALL_T = 0.12;

export class Level {
  /** Celda global que corresponde a la celda relativa (0, 0): la esquina de la zona de arranque. */
  readonly originGx: number;
  readonly originGy: number;

  constructor(
    readonly world: World,
    startGx: number,
    startGy: number,
    readonly z: number,
  ) {
    this.originGx = startGx - (startGx % ZONE_SIZE);
    this.originGy = startGy - (startGy % ZONE_SIZE);
  }

  edge(rx: number, ry: number, dir: Dir): Edge {
    return this.world.edge(this.originGx + rx, this.originGy + ry, this.z, dir);
  }

  /** ¿Hay algo que no se puede cruzar? Las puertas que cambian de capa quedan cerradas hasta F1b. */
  blocked(rx: number, ry: number, dir: Dir): boolean {
    const e = this.edge(rx, ry, dir);
    return e !== Edge.OPEN && e !== Edge.DOOR;
  }

  /** Celda global (la que va a viajar en los eventos) de la celda relativa. */
  global(rx: number, ry: number): { gx: number; gy: number } {
    return { gx: wrapCell(this.originGx + rx), gy: wrapCell(this.originGy + ry) };
  }
}
