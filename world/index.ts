// API pública del generador. Módulo puro: sin DOM, sin Three, sin azar ni reloj.
// El mundo no se guarda: cada zona es una función de (seed, WORLD_V, x, y, z).

import { mix, RngKind } from './hash';
import { Lcg } from './lcg';
import { levelParams, LEVELS, type LevelParams } from './levels';
import { Dir, Edge, generateZone, ZONE_SIZE, type Zone } from './zone';

export { Dir, Edge, generateZone, levelParams, LEVELS, ZONE_SIZE, type LevelParams, type Zone };

/**
 * Versión del generador. Cambia cada vez que una misma seed pasa a dar otro mundo; los eventos la llevan
 * para que el mapa de los perdidos reconstruya la partida con el algoritmo correcto.
 * - 1: port de TediusTimmy con seed (F1a); Nivel 1 y noclip a 1/1500 (F1c).
 * - 2: noclip a 1/300 paredes. La geometría de los niveles 0 y 1 no cambia; cambian las paredes de noclip.
 * - 3: el Nivel 1 pasa a ser un estacionamiento (layout 'garage', pilares cada 4 celdas). El Nivel 0 no cambia.
 */
export const WORLD_V = 3;

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

  has(x: number, y: number, z: number, level = 0): boolean {
    return this.cache.has(key(x, y, z, level));
  }

  /** Guarda una zona generada en otro lado (por ejemplo, en un Web Worker). */
  put(zone: Zone): void {
    if (zone.seed !== this.seed >>> 0) throw new Error(`zona de otra seed: ${zone.seed}`);
    const k = key(zone.x, zone.y, zone.z, zone.level);
    this.cache.delete(k);
    if (this.cache.size >= this.cacheSize) {
      const oldest = this.cache.keys().next().value!;
      if (this.cache.get(oldest) === this.last) this.last = null;
      this.cache.delete(oldest);
    }
    this.cache.set(k, zone);
  }

  /** La zona pedida; si no está en caché, se genera acá mismo (sincrónico). */
  zone(x: number, y: number, z: number, level = 0): Zone {
    const l = this.last;
    if (l && l.x === x >>> 0 && l.y === y >>> 0 && l.z === z >>> 0 && l.level === level) return l;
    const k = key(x, y, z, level);
    let zone = this.cache.get(k);
    if (zone) {
      this.cache.delete(k);
      this.cache.set(k, zone);
    } else {
      zone = generateZone(this.seed, x, y, z, level);
      this.put(zone);
    }
    this.last = zone;
    return zone;
  }

  /** Borde `dir` de la celda global (gx, gy) en la capa z del nivel. */
  edge(gx: number, gy: number, z: number, dir: Dir, level = 0): Edge {
    const sx = splitCell(gx);
    const sy = splitCell(gy);
    const zone = this.zone(sx.zone, sy.zone, z, level);
    return zone.edges[(sy.cell * ZONE_SIZE + sx.cell) * 4 + dir] as Edge;
  }

  /**
   * ¿Esta pared deja hacer noclip? Pocas paredes, elegidas por hash del borde: es la misma vista desde las dos
   * celdas, y depende de la seed, el nivel y la capa. Solo en niveles con `noclipRate` > 0.
   */
  noclip(gx: number, gy: number, z: number, dir: Dir, level = 0): boolean {
    const { noclipRate } = levelParams(level);
    if (!noclipRate || this.edge(gx, gy, z, dir, level) !== Edge.WALL) return false;
    // El dueño del borde es la celda de la que es lado E o S.
    const vertical = dir === Dir.W || dir === Dir.E;
    const sx = splitCell(dir === Dir.W ? gx - 1 : gx);
    const sy = splitCell(dir === Dir.N ? gy - 1 : gy);
    const id = (sy.cell * ZONE_SIZE + sx.cell) * 2 + (vertical ? 0 : 1);
    return unit(mix(this.seed, RngKind.NOCLIP, sx.zone, sy.zone, z, id, level)) < noclipRate;
  }

  /**
   * ¿Hay un pilar en la esquina superior izquierda de la celda (gx, gy)? Solo sobre la grilla del nivel y donde
   * los cuatro bordes que llegan a la esquina están abiertos (no pegado a una pared).
   */
  pillar(gx: number, gy: number, z: number, level = 0): boolean {
    const { pillarRate, pillarEvery } = levelParams(level);
    if (!pillarRate || wrapCell(gx) % pillarEvery || wrapCell(gy) % pillarEvery) return false;
    const open = (x: number, y: number, d: Dir) => this.edge(x, y, z, d, level) === Edge.OPEN;
    if (!open(gx - 1, gy - 1, Dir.E) || !open(gx - 1, gy, Dir.E)) return false;
    if (!open(gx - 1, gy - 1, Dir.S) || !open(gx, gy - 1, Dir.S)) return false;
    const sx = splitCell(gx);
    const sy = splitCell(gy);
    return unit(mix(this.seed, RngKind.PILLAR, sx.zone, sy.zone, z, sy.cell * ZONE_SIZE + sx.cell, level)) < pillarRate;
  }
}

const key = (x: number, y: number, z: number, level: number) => `${level}:${x >>> 0},${y >>> 0},${z >>> 0}`;
// 53 bits altos del hash como número en [0, 1).
const unit = (h: bigint) => Number(h >> 11n) / 2 ** 53;

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
