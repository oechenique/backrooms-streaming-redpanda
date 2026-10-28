// Mallas por bloques de CHUNK×CHUNK celdas alrededor del jugador. Cada bloque es una geometría por material,
// así un bloque entero son pocas draw calls.

import * as THREE from 'three';
import { Dir, Edge } from '../world';
import { CELL, CHUNK, DOOR_W, isPortal, WALL_H, WALL_T, type Level } from './level';

/** Bloques cargados a cada lado del que pisa el jugador. Con 1, lo no cargado queda a ≥ 35 m, detrás de la niebla. */
const RADIUS = 1;
/** Bloques nuevos por frame como máximo (el del jugador se arma siempre). */
const BUILDS_PER_FRAME = 2;
const WALLPAPER_W = 1.1; // metros que cubre la textura del empapelado a lo ancho
const CARPET_M = 1.5;
const TILE_M = 1.2; // dos placas de techo de 0,6 m
export const DOOR_H = 2.05;
const LINTEL_Y = 2.15;
const FRAME = 0.07;

export interface Materials {
  wall: THREE.Material;
  floor: THREE.Material;
  ceiling: THREE.Material;
  light: THREE.Material;
  door: THREE.Material;
  void: THREE.Material;
}

// Acumula quads con normales y UV, y arma una BufferGeometry indexada.
class Builder {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];
  private idx: number[] = [];

  quad(corners: number[], normal: [number, number, number], uvs: number[]): void {
    const base = this.pos.length / 3;
    this.pos.push(...corners);
    for (let i = 0; i < 4; i++) this.nor.push(...normal);
    this.uv.push(...uvs);
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Caja alineada a los ejes; UV en metros de mundo divididos por `uw` (ancho) y `vh` (alto, desde el piso). */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, uw: number, vh: number): void {
    const v0 = y0 / vh;
    const v1 = y1 / vh;
    // caras ±x (el ancho de la textura corre por z)
    this.quad([x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1], [1, 0, 0], [z1 / uw, v0, z0 / uw, v0, z0 / uw, v1, z1 / uw, v1]);
    this.quad([x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0], [-1, 0, 0], [z0 / uw, v0, z1 / uw, v0, z1 / uw, v1, z0 / uw, v1]);
    // caras ±z (el ancho corre por x)
    this.quad([x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1], [0, 0, 1], [x0 / uw, v0, x1 / uw, v0, x1 / uw, v1, x0 / uw, v1]);
    this.quad([x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0], [0, 0, -1], [x1 / uw, v0, x0 / uw, v0, x0 / uw, v1, x1 / uw, v1]);
    // cara de abajo (solo se ve en los dinteles)
    if (y0 > 0) this.quad([x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1], [0, -1, 0], [0, 0, 0, 0, 0, 0, 0, 0]);
  }

  /** Plano horizontal a altura y, mirando hacia arriba (`up`) o hacia abajo. UV = metros / `m`. */
  flat(x0: number, x1: number, z0: number, z1: number, y: number, up: boolean, m: number): void {
    const uvs = [x0 / m, z0 / m, x1 / m, z0 / m, x1 / m, z1 / m, x0 / m, z1 / m];
    if (up) this.quad([x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0], [0, 1, 0], [uvs[6], uvs[7], uvs[4], uvs[5], uvs[2], uvs[3], uvs[0], uvs[1]]);
    else this.quad([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], [0, -1, 0], uvs);
  }

  build(): THREE.BufferGeometry | null {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

interface Builders {
  walls: Builder;
  doors: Builder;
  voids: Builder;
}

/**
 * Pared sobre un borde. `alongX`: el borde corre en x (lado S de una celda); si no, corre en z (lado E).
 * (ex, ez) es el punto medio del borde.
 */
function edgeMesh(b: Builders, edge: Edge, ex: number, ez: number, alongX: boolean): void {
  if (edge === Edge.OPEN) return;
  const h = CELL / 2 + WALL_T / 2; // medio largo, con un poco de solape para tapar las esquinas
  const t = WALL_T / 2;
  // Tramo del borde entre a y b (metros desde el punto medio, a lo largo) y entre y0 e y1 de alto.
  const seg = (out: Builder, a: number, c: number, y0: number, y1: number, thick: number, uw: number, vh: number) =>
    alongX
      ? out.box(ex + a, ex + c, y0, y1, ez - thick, ez + thick, uw, vh)
      : out.box(ex - thick, ex + thick, y0, y1, ez + a, ez + c, uw, vh);

  if (edge === Edge.DOOR) {
    seg(b.walls, -h, h, LINTEL_Y, WALL_H, t, WALLPAPER_W, WALL_H); // hueco a lo ancho de la celda con dintel
    return;
  }
  if (!isPortal(edge)) {
    seg(b.walls, -h, h, 0, WALL_H, t, WALLPAPER_W, WALL_H);
    return;
  }
  // Puerta de capa: pared a los costados, dintel, marco y un hueco oscuro que se atraviesa.
  const d = DOOR_W / 2;
  seg(b.walls, -h, -d, 0, WALL_H, t, WALLPAPER_W, WALL_H);
  seg(b.walls, d, h, 0, WALL_H, t, WALLPAPER_W, WALL_H);
  seg(b.walls, -d, d, DOOR_H, WALL_H, t, WALLPAPER_W, WALL_H);
  const k = t + 0.02;
  seg(b.doors, -d - FRAME, -d, 0, DOOR_H + FRAME, k, 1, 1);
  seg(b.doors, d, d + FRAME, 0, DOOR_H + FRAME, k, 1, 1);
  seg(b.doors, -d, d, DOOR_H, DOOR_H + FRAME, k, 1, 1);
  seg(b.voids, -d, d, 0, DOOR_H, 0.01, 1, 1);
}

function buildChunk(level: Level, mats: Materials, cx: number, cy: number): THREE.Group {
  const b: Builders = { walls: new Builder(), doors: new Builder(), voids: new Builder() };
  const floor = new Builder();
  const ceil = new Builder();
  const lights = new Builder();
  const rx0 = cx * CHUNK;
  const ry0 = cy * CHUNK;

  for (let ry = ry0; ry < ry0 + CHUNK; ry++)
    for (let rx = rx0; rx < rx0 + CHUNK; rx++) {
      // Cada celda dibuja solo sus lados E y S: cada borde del mundo tiene un único dueño.
      edgeMesh(b, level.edge(rx, ry, Dir.E), (rx + 1) * CELL, (ry + 0.5) * CELL, false);
      edgeMesh(b, level.edge(rx, ry, Dir.S), (rx + 0.5) * CELL, (ry + 1) * CELL, true);
      // Un tubo fluorescente cada dos celdas, fijo en la grilla global (la paridad de rx es la de gx).
      if (((rx | ry) & 1) === 0) {
        const mx = (rx + 0.5) * CELL;
        const mz = (ry + 0.5) * CELL;
        lights.flat(mx - 0.3, mx + 0.3, mz - 0.6, mz + 0.6, WALL_H - 0.01, false, 1);
      }
    }

  const x0 = rx0 * CELL;
  const z0 = ry0 * CELL;
  const x1 = (rx0 + CHUNK) * CELL;
  const z1 = (ry0 + CHUNK) * CELL;
  floor.flat(x0, x1, z0, z1, 0, true, CARPET_M);
  ceil.flat(x0, x1, z0, z1, WALL_H, false, TILE_M);

  const group = new THREE.Group();
  for (const [builder, mat] of [
    [b.walls, mats.wall],
    [b.doors, mats.door],
    [b.voids, mats.void],
    [floor, mats.floor],
    [ceil, mats.ceiling],
    [lights, mats.light],
  ] as const) {
    const g = builder.build();
    if (g) group.add(new THREE.Mesh(g, mat));
  }
  return group;
}

export class Chunks {
  private readonly loaded = new Map<string, THREE.Group>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly level: Level,
    private readonly mats: Materials,
    /** ¿Están en memoria las zonas que necesita el bloque? Si no, se espera (salvo el del jugador). */
    private readonly ready: (cx: number, cy: number) => boolean,
  ) {}

  /** Bloques cargados, como pares (cx, cy). */
  *keys(): Iterable<[number, number]> {
    for (const k of this.loaded.keys()) yield k.split(',').map(Number) as [number, number];
  }

  /** Carga los bloques alrededor de (x, z) en metros y descarga los que quedaron lejos. */
  update(x: number, z: number): void {
    const pcx = Math.floor(x / CELL / CHUNK);
    const pcy = Math.floor(z / CELL / CHUNK);
    let budget = BUILDS_PER_FRAME;

    const keep = new Set<string>();
    for (let dy = -RADIUS; dy <= RADIUS; dy++)
      for (let dx = -RADIUS; dx <= RADIUS; dx++) {
        const cx = pcx + dx;
        const cy = pcy + dy;
        const k = `${cx},${cy}`;
        keep.add(k);
        if (this.loaded.has(k)) continue;
        const own = dx === 0 && dy === 0;
        if (!own && (budget <= 0 || !this.ready(cx, cy))) continue;
        this.add(cx, cy);
        budget--;
      }
    for (const [k, group] of this.loaded) if (!keep.has(k)) this.remove(k, group);
  }

  /** Vuelve a armar un bloque (cambió su interior). */
  rebuild(cx: number, cy: number): void {
    const k = `${cx},${cy}`;
    const group = this.loaded.get(k);
    if (!group) return;
    this.remove(k, group);
    this.add(cx, cy);
  }

  /** Descarta todo (cambio de capa). */
  reset(): void {
    for (const [k, group] of this.loaded) this.remove(k, group);
  }

  private add(cx: number, cy: number): void {
    const group = buildChunk(this.level, this.mats, cx, cy);
    this.scene.add(group);
    this.loaded.set(`${cx},${cy}`, group);
  }

  private remove(k: string, group: THREE.Group): void {
    this.scene.remove(group);
    group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.loaded.delete(k);
  }
}
