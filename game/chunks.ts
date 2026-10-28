// Mallas por bloques de CHUNK×CHUNK celdas alrededor del jugador. Cada bloque es una geometría por material,
// así un bloque entero son pocas draw calls.

import * as THREE from 'three';
import { Dir, Edge } from '../world';
import { CELL, CHUNK, DOOR_W, isPortal, WALL_H, WALL_T, type Level } from './level';
import { PILLAR_HALF } from './player';

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
  /** Paredes por las que se hace noclip (titilan). */
  noclip: THREE.Material;
  puddle: THREE.Material;
  pipe: THREE.Material;
}

/** Lo que cambia entre niveles al armar los bloques. */
export interface Style {
  mats: Materials;
  /** Un tubo de luz cada tantas celdas, y su tamaño (ancho, largo) en metros. */
  lightEvery: number;
  lightSize: [number, number];
  puddles: boolean;
  pipes: boolean;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

// Hash entero chico para detalles que son solo decorado (charcos): estable por celda, no es parte del mundo.
function decor(gx: number, gy: number): number {
  let h = Math.imul((gx % 0x100000) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(gy % 0x100000, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
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

  /** Disco horizontal (elipse de radios rx, rz) a altura y, mirando hacia arriba. */
  disc(cx: number, y: number, cz: number, rx: number, rz: number, segments = 10): void {
    const base = this.pos.length / 3;
    this.pos.push(cx, y, cz);
    this.nor.push(0, 1, 0);
    this.uv.push(0.5, 0.5);
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      this.pos.push(cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz);
      this.nor.push(0, 1, 0);
      this.uv.push(0.5 + Math.cos(a) / 2, 0.5 + Math.sin(a) / 2);
    }
    for (let i = 0; i < segments; i++) this.idx.push(base, base + 1 + ((i + 1) % segments), base + 1 + i);
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
  noclip: Builder;
  doors: Builder;
  voids: Builder;
}

/**
 * Pared sobre un borde. `alongX`: el borde corre en x (lado S de una celda); si no, corre en z (lado E).
 * (ex, ez) es el punto medio del borde.
 */
function edgeMesh(b: Builders, edge: Edge, ex: number, ez: number, alongX: boolean, noclip: boolean): void {
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
    seg(noclip ? b.noclip : b.walls, -h, h, 0, WALL_H, t, WALLPAPER_W, WALL_H);
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

function buildChunk(level: Level, style: Style, cx: number, cy: number): THREE.Group {
  const b: Builders = { walls: new Builder(), noclip: new Builder(), doors: new Builder(), voids: new Builder() };
  const floor = new Builder();
  const ceil = new Builder();
  const lights = new Builder();
  const puddles = new Builder();
  const pipes = new Builder();
  const rx0 = cx * CHUNK;
  const ry0 = cy * CHUNK;
  const [lw, ll] = style.lightSize;
  const p = PILLAR_HALF;

  for (let ry = ry0; ry < ry0 + CHUNK; ry++)
    for (let rx = rx0; rx < rx0 + CHUNK; rx++) {
      // Cada celda dibuja solo sus lados E y S: cada borde del mundo tiene un único dueño.
      const e = level.edge(rx, ry, Dir.E);
      const s = level.edge(rx, ry, Dir.S);
      const ne = e === Edge.WALL && level.noclip(rx, ry, Dir.E);
      const ns = s === Edge.WALL && level.noclip(rx, ry, Dir.S);
      edgeMesh(b, e, (rx + 1) * CELL, (ry + 0.5) * CELL, false, ne);
      edgeMesh(b, s, (rx + 0.5) * CELL, (ry + 1) * CELL, true, ns);
      // Pilar en la esquina superior izquierda de la celda.
      if (level.pillar(rx, ry)) b.walls.box(rx * CELL - p, rx * CELL + p, 0, WALL_H, ry * CELL - p, ry * CELL + p, WALLPAPER_W, WALL_H);
      // Tubos de luz fijos en la grilla global (rx y gx difieren en un múltiplo de 256).
      if (mod(rx, style.lightEvery) === 0 && mod(ry, style.lightEvery) === 0) {
        const mx = (rx + 0.5) * CELL;
        const mz = (ry + 0.5) * CELL;
        lights.flat(mx - lw / 2, mx + lw / 2, mz - ll / 2, mz + ll / 2, WALL_H - 0.01, false, 1);
      }
      if (style.puddles) {
        const { gx, gy } = level.global(rx, ry);
        const h = decor(gx, gy);
        if (h < 0.07) {
          const r = 0.35 + (h / 0.07) * 0.6;
          puddles.disc((rx + 0.5) * CELL, 0.004, (ry + 0.5) * CELL, r, r * (0.55 + decor(gy, gx) * 0.4), 18);
        }
      }
    }

  const x0 = rx0 * CELL;
  const z0 = ry0 * CELL;
  const x1 = (rx0 + CHUNK) * CELL;
  const z1 = (ry0 + CHUNK) * CELL;
  floor.flat(x0, x1, z0, z1, 0, true, CARPET_M);
  ceil.flat(x0, x1, z0, z1, WALL_H, false, TILE_M);
  // Caños a lo largo de x, uno cada cuatro filas, colgados del techo; atraviesan las paredes.
  if (style.pipes)
    for (let ry = ry0; ry < ry0 + CHUNK; ry++)
      if (mod(ry, 4) === 1) {
        const z = (ry + 0.25) * CELL;
        pipes.box(x0, x1, WALL_H - 0.24, WALL_H - 0.1, z - 0.07, z + 0.07, 1, 1);
        pipes.box(x0, x1, WALL_H - 0.16, WALL_H - 0.08, z + 0.18, z + 0.26, 1, 1);
      }

  const m = style.mats;
  const group = new THREE.Group();
  for (const [builder, mat] of [
    [b.walls, m.wall],
    [b.noclip, m.noclip],
    [b.doors, m.door],
    [b.voids, m.void],
    [floor, m.floor],
    [ceil, m.ceiling],
    [lights, m.light],
    [puddles, m.puddle],
    [pipes, m.pipe],
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
    private style: Style,
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

  /** Descarta todo (cambio de capa o de nivel). Con `style`, los bloques nuevos se arman con ese estilo. */
  reset(style?: Style): void {
    if (style) this.style = style;
    for (const [k, group] of this.loaded) this.remove(k, group);
  }

  private add(cx: number, cy: number): void {
    const group = buildChunk(this.level, this.style, cx, cy);
    this.scene.add(group);
    this.loaded.set(`${cx},${cy}`, group);
  }

  private remove(k: string, group: THREE.Group): void {
    this.scene.remove(group);
    group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.loaded.delete(k);
  }
}
