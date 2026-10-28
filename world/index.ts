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
  // Atajo: casi todas las consultas seguidas caen en la misma zona.
  private last: Zone | null = null;

  constructor(
    readonly seed: number,
    private readonly cacheSize = 16,
  ) {}

  has(x: number, y: number, z: number): boolean {
    return this.cache.has(key(x, y, z));
  }

  /** Guarda una zona generada en otro lado (por ejemplo, en un Web Worker). */
  put(zone: Zone): void {
    if (zone.seed !== this.seed >>> 0) throw new Error(`zona de otra seed: ${zone.seed}`);
    const k = key(zone.x, zone.y, zone.z);
    this.cache.delete(k);
    if (this.cache.size >= this.cacheSize) {
      const oldest = this.cache.keys().next().value!;
      if (this.cache.get(oldest) === this.last) this.last = null;
      this.cache.delete(oldest);
    }
    this.cache.set(k, zone);
  }

  /** La zona pedida; si no está en caché, se genera acá mismo (sincrónico). */
  zone(x: number, y: number, z: number): Zone {
    const l = this.last;
    if (l && l.x === x >>> 0 && l.y === y >>> 0 && l.z === z >>> 0) return l;
    const k = key(x, y, z);
    let zone = this.cache.get(k);
    if (zone) {
      this.cache.delete(k);
      this.cache.set(k, zone);
    } else {
      zone = generateZone(this.seed, x, y, z);
      this.put(zone);
    }
    this.last = zone;
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

const key = (x: number, y: number, z: number) => `${x >>> 0},${y >>> 0},${z >>> 0}`;

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
