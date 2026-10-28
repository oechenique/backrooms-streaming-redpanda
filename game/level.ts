// Puente entre world/ (coordenadas globales de 40 bits) y la escena (metros relativos a la zona de arranque,
// para que Three.js no pierda precisión en float32).
//
// También guarda los bloques que cambiaron: un bloque de CHUNK×CHUNK celdas puede tomar su interior de otra capa
// del mundo. Sus bordes siempre salen de la capa actual, así que las aberturas hacia los vecinos no se mueven.

import { Dir, Edge, wrapCell, ZONE_SIZE, type World } from '../world';

/** Lado de una celda en metros. */
export const CELL = 2.2;
export const WALL_H = 2.7;
export const WALL_T = 0.12;
/** Lado de un bloque (unidad de render y de cambio del laberinto), en celdas. Divide a ZONE_SIZE. */
export const CHUNK = 16;
/** Ancho del hueco de una puerta de capa, en metros. */
export const DOOR_W = 0.95;

const mod = (a: number, n: number) => ((a % n) + n) % n;
const chunkKey = (cx: number, cy: number) => `${cx},${cy}`;

export const isPortal = (e: Edge) => e === Edge.DOOR_UP || e === Edge.DOOR_DOWN;
export const isOpen = (e: Edge) => e === Edge.OPEN || e === Edge.DOOR;

export class Level {
  /** Celda global que corresponde a la celda relativa (0, 0): la esquina de la zona de arranque. */
  readonly originGx: number;
  readonly originGy: number;
  private readonly shifted = new Map<string, number>();

  constructor(
    readonly world: World,
    startGx: number,
    startGy: number,
    /** Capa actual. Cambia al cruzar una puerta. */
    public z: number,
  ) {
    this.originGx = startGx - (startGx % ZONE_SIZE);
    this.originGy = startGy - (startGy % ZONE_SIZE);
  }

  edge(rx: number, ry: number, dir: Dir): Edge {
    // El dueño de un borde es la celda de la que es lado E o S.
    const ox = dir === Dir.W ? rx - 1 : rx;
    const oy = dir === Dir.N ? ry - 1 : ry;
    const vertical = dir === Dir.W || dir === Dir.E;
    const onBorder = vertical ? mod(ox, CHUNK) === CHUNK - 1 : mod(oy, CHUNK) === CHUNK - 1;
    const layer = onBorder ? this.z : this.layerOf(Math.floor(ox / CHUNK), Math.floor(oy / CHUNK));
    return this.world.edge(this.originGx + rx, this.originGy + ry, layer, dir);
  }

  /** ¿Se puede caminar de la celda al vecino sin cruzar una puerta de capa? */
  open(rx: number, ry: number, dir: Dir): boolean {
    return isOpen(this.edge(rx, ry, dir));
  }

  /** Capa de la que sale el interior del bloque (cx, cy). */
  layerOf(cx: number, cy: number): number {
    return this.shifted.get(chunkKey(cx, cy)) ?? this.z;
  }

  /** Cambia el interior del bloque a otra capa (o lo devuelve a la actual). */
  setLayer(cx: number, cy: number, layer: number): void {
    if (layer >>> 0 === this.z >>> 0) this.shifted.delete(chunkKey(cx, cy));
    else this.shifted.set(chunkKey(cx, cy), layer >>> 0);
  }

  /** Pasa a otra capa: los bloques cambiados se olvidan. */
  enterLayer(z: number): void {
    this.z = z >>> 0;
    this.shifted.clear();
  }

  /** Zona y capas que hacen falta para dibujar el bloque (cx, cy). */
  chunkZones(cx: number, cy: number): Array<[number, number, number]> {
    const zx = Math.floor((this.originGx + cx * CHUNK) / ZONE_SIZE);
    const zy = Math.floor((this.originGy + cy * CHUNK) / ZONE_SIZE);
    const layer = this.layerOf(cx, cy);
    return layer === this.z ? [[zx, zy, this.z]] : [[zx, zy, this.z], [zx, zy, layer]];
  }

  /** Celda global (la que viaja en los eventos) de la celda relativa. */
  global(rx: number, ry: number): { gx: number; gy: number } {
    return { gx: wrapCell(this.originGx + rx), gy: wrapCell(this.originGy + ry) };
  }

  /** Posición global en celdas, con decimales, de un punto en metros. */
  globalPos(x: number, z: number): { x: number; y: number } {
    const round = (v: number) => Math.round(v * 100) / 100;
    return { x: round(wrapCell(this.originGx + x / CELL)), y: round(wrapCell(this.originGy + z / CELL)) };
  }
}
