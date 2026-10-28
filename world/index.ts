// API pública del generador. Módulo puro: sin DOM, sin Three, sin azar ni reloj.
// El mundo no se guarda: cada zona es una función de (seed, WORLD_V, x, y, z).

import { mix, RngKind } from './hash';
import { Lcg } from './lcg';
import { Dir, Edge, generateZone, ZONE_SIZE, type Zone } from './zone';

export { Dir, Edge, generateZone, ZONE_SIZE, type Zone };

/**
 * Versión del generador. Cambia cada vez que una misma seed pasa a dar otro mundo; los eventos la llevan
 * para que el mapa de los perdidos reconstruya la partida con el algoritmo correcto.
 */
export const WORLD_V = 1;

/** Celdas por lado de una capa: 2^32 zonas × 256. Las coordenadas globales dan la vuelta acá. */
export const LAYER_CELLS = 2 ** 32 * ZONE_SIZE;

/** Coordenada global de celda llevada a [0, LAYER_CELLS). Entero exacto: 2^40 < 2^53. */
export function wrapCell(g: number): number {
  return ((g % LAYER_CELLS) + LAYER_CELLS) % LAYER_CELLS;
}

/** Zona y celda dentro de la zona para una coordenada global. */
export function splitCell(g: number): { zone: number; cell: number } {
  const w = wrapCell(g);
  return { zone: Math.floor(w / ZONE_SIZE), cell: w % ZONE_SIZE };
}

/** Mundo de una seed, con caché LRU de zonas (cada una ocupa 256 KB). */
export class World {
  private readonly cache = new Map<string, Zone>();

  constructor(
    readonly seed: number,
    private readonly cacheSize = 16,
  ) {}

  zone(x: number, y: number, z: number): Zone {
    const key = `${x >>> 0},${y >>> 0},${z >>> 0}`;
    let zone = this.cache.get(key);
    if (zone) {
      this.cache.delete(key);
    } else {
      zone = generateZone(this.seed, x, y, z);
      if (this.cache.size >= this.cacheSize) this.cache.delete(this.cache.keys().next().value!);
    }
    this.cache.set(key, zone);
    return zone;
  }

  /** Borde `dir` de la celda global (gx, gy) en la capa z. */
  edge(gx: number, gy: number, z: number, dir: Dir): Edge {
    const sx = splitCell(gx);
    const sy = splitCell(gy);
    const zone = this.zone(sx.zone, sy.zone, z);
    return zone.edges[(sy.cell * ZONE_SIZE + sx.cell) * 4 + dir] as Edge;
  }
}

export interface Start {
  /** Celda global de arranque. */
  gx: number;
  gy: number;
  /** Capa. */
  z: number;
}

/** Punto de partida de la seed. Como `getStart` del original, lejos de los bordes del espacio de zonas. */
export function getStart(seed: number): Start {
  const rng = new Lcg(mix(seed, RngKind.START, 0, 1, 2, 3));
  const zone = () => Math.floor(rng.next() / 2 ** 17) + 0x40000000;
  const zx = zone();
  const zy = zone();
  const z = zone();
  return { gx: zx * ZONE_SIZE + rng.rand(ZONE_SIZE), gy: zy * ZONE_SIZE + rng.rand(ZONE_SIZE), z };
}
