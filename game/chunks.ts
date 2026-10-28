// Mallas por bloques de CHUNK×CHUNK celdas alrededor del jugador. Cada bloque es una geometría por material,
// así un bloque entero son pocas draw calls.

import * as THREE from 'three';
import { Dir, Edge } from '../world';
import { CELL, CHUNK, DOOR_W, isPortal, WALL_T, type Level } from './level';
import { PILLAR_HALF } from './player';

/** Bloques cargados a cada lado del que pisa el jugador. Con 1, lo no cargado queda a ≥ 35 m, detrás de la niebla. */
const RADIUS = 1;
/** Bloques nuevos por frame como máximo (el del jugador se arma siempre). */
const BUILDS_PER_FRAME = 2;
export const DOOR_H = 2.05;
const LINTEL_Y = 2.15;
const FRAME = 0.1;
/** Cantidad de códigos en el atlas de los pilares (8 × 8). */
export const CODE_COUNT = 64;

export interface Materials {
  wall: THREE.Material;
  floor: THREE.Material;
  ceiling: THREE.Material;
  light: THREE.Material;
  /** Tubos apagados y tubos que titilan (el que llama anima este último). */
  deadLight: THREE.Material;
  flickerLight: THREE.Material;
  door: THREE.Material;
  void: THREE.Material;
  /** Paredes por las que se hace noclip (titilan). */
  noclip: THREE.Material;
  puddle: THREE.Material;
  /** Reflejo falso de los tubos en los charcos (aditivo, sin reflejos en tiempo real). */
  reflection: THREE.Material;
  pipe: THREE.Material;
  tray: THREE.Material;
  pillar: THREE.Material;
  /** Atlas de códigos pintados en los pilares (CODE_COUNT celdas en una grilla de 8 × 8). */
  code: THREE.Material;
  paint: THREE.Material;
  paintYellow: THREE.Material;
}

/** Lo que cambia entre niveles al armar los bloques. */
export interface Style {
  mats: Materials;
  /** Alto del techo en metros. */
  height: number;
  /** Metros que cubre a lo ancho la textura de pared, la del piso y la del techo. */
  tex: { wall: number; floor: number; ceiling: number };
  /**
   * Tubos: uno en cada celda con rx múltiplo de `everyX` y ry ≡ `rowY` (mód. `everyY`), centrado en x y a `zAt` del
   * alto de la celda en z (0,5 = centro, 1 = borde S). `size` = [largo en x, largo en z]. Una fracción `dead` está
   * apagada y otra `flicker` titila.
   */
  lights: { everyX: number; everyY: number; rowY: number; zAt: number; size: [number, number]; dead: number; flicker: number };
  /** Fracción de celdas de las filas de tubos con charco (0 = sin charcos): quedan debajo de la luz y la reflejan. */
  puddles: number;
  pipes: boolean;
  /** Bandejas de cables a lo largo de z. */
  trays: boolean;
  /** Estacionamiento: líneas pintadas en el piso y códigos en los pilares (filas de pilares cada 4 celdas). */
  parking: boolean;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

// Hash entero chico para detalles que son solo decorado (charcos, tubos muertos, códigos): estable por celda, no es
// parte del mundo.
export function decor(gx: number, gy: number): number {
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

  /** Quad vertical sobre la cara de un pilar (dir: +x, -x, +z, -z), centrado en (x, z), con UV del atlas. */
  decal(face: '+x' | '-x' | '+z' | '-z', x: number, z: number, w: number, y0: number, y1: number, uv: [number, number, number, number]): void {
    const [u0, v0, u1, v1] = uv;
    const uvs = [u0, v0, u1, v0, u1, v1, u0, v1];
    if (face === '+x') this.quad([x, y0, z + w, x, y0, z - w, x, y1, z - w, x, y1, z + w], [1, 0, 0], uvs);
    else if (face === '-x') this.quad([x, y0, z - w, x, y0, z + w, x, y1, z + w, x, y1, z - w], [-1, 0, 0], uvs);
    else if (face === '+z') this.quad([x - w, y0, z, x + w, y0, z, x + w, y1, z, x - w, y1, z], [0, 0, 1], uvs);
    else this.quad([x + w, y0, z, x - w, y0, z, x - w, y1, z, x + w, y1, z], [0, 0, -1], uvs);
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
 * (ex, ez) es el punto medio del borde; `H` el alto del techo y `uw` el ancho de la textura de pared.
 */
function edgeMesh(b: Builders, edge: Edge, ex: number, ez: number, alongX: boolean, noclip: boolean, H: number, uw: number): void {
  if (edge === Edge.OPEN) return;
  const h = CELL / 2 + WALL_T / 2; // medio largo, con un poco de solape para tapar las esquinas
  const t = WALL_T / 2;
  // Tramo del borde entre a y c (metros desde el punto medio, a lo largo) y entre y0 e y1 de alto.
  const seg = (out: Builder, a: number, c: number, y0: number, y1: number, thick: number, tw: number, vh: number) =>
    alongX
      ? out.box(ex + a, ex + c, y0, y1, ez - thick, ez + thick, tw, vh)
      : out.box(ex - thick, ex + thick, y0, y1, ez + a, ez + c, tw, vh);

  if (edge === Edge.DOOR) {
    seg(b.walls, -h, h, LINTEL_Y, H, t, uw, H); // hueco a lo ancho de la celda con dintel
    return;
  }
  if (!isPortal(edge)) {
    // Una pared de noclip es el paño entero, con otra textura: no se confunde con una puerta.
    seg(noclip ? b.noclip : b.walls, -h, h, 0, H, t, uw, H);
    return;
  }
  // Puerta de capa: hueco angosto y oscuro con marco de madera y dintel; el resto del borde es pared común.
  const d = DOOR_W / 2;
  seg(b.walls, -h, -d, 0, H, t, uw, H);
  seg(b.walls, d, h, 0, H, t, uw, H);
  seg(b.walls, -d, d, DOOR_H, H, t, uw, H);
  const k = t + 0.03;
  seg(b.doors, -d - FRAME, -d, 0, DOOR_H + FRAME, k, 1, 1);
  seg(b.doors, d, d + FRAME, 0, DOOR_H + FRAME, k, 1, 1);
  seg(b.doors, -d - FRAME, d + FRAME, DOOR_H, DOOR_H + FRAME, k, 1, 1);
  seg(b.voids, -d, d, 0, DOOR_H, 0.01, 1, 1);
}

function buildChunk(level: Level, style: Style, cx: number, cy: number): THREE.Group {
  const b: Builders = { walls: new Builder(), noclip: new Builder(), doors: new Builder(), voids: new Builder() };
  const out = {
    floor: new Builder(),
    ceiling: new Builder(),
    light: new Builder(),
    deadLight: new Builder(),
    flickerLight: new Builder(),
    puddle: new Builder(),
    reflection: new Builder(),
    pipe: new Builder(),
    tray: new Builder(),
    pillar: new Builder(),
    code: new Builder(),
    paint: new Builder(),
    paintYellow: new Builder(),
  };
  const H = style.height;
  const L = style.lights;
  const rx0 = cx * CHUNK;
  const ry0 = cy * CHUNK;
  const p = PILLAR_HALF;
  const PAINT_Y = 0.003;
  const LINE = 0.05; // medio ancho de una línea pintada

  // ¿Hay un tubo encendido en la celda? (para los reflejos)
  const lightAt = (rx: number, ry: number): 'none' | 'on' | 'dead' | 'flicker' => {
    if (mod(rx, L.everyX) !== 0 || mod(ry, L.everyY) !== L.rowY) return 'none';
    const { gx, gy } = level.global(rx, ry);
    const h = decor(gx + 7, gy + 3);
    return h < L.dead ? 'dead' : h < L.dead + L.flicker ? 'flicker' : 'on';
  };

  for (let ry = ry0; ry < ry0 + CHUNK; ry++)
    for (let rx = rx0; rx < rx0 + CHUNK; rx++) {
      // Cada celda dibuja solo sus lados E y S: cada borde del mundo tiene un único dueño.
      const e = level.edge(rx, ry, Dir.E);
      const s = level.edge(rx, ry, Dir.S);
      const ne = e === Edge.WALL && level.noclip(rx, ry, Dir.E);
      const ns = s === Edge.WALL && level.noclip(rx, ry, Dir.S);
      edgeMesh(b, e, (rx + 1) * CELL, (ry + 0.5) * CELL, false, ne, H, style.tex.wall);
      edgeMesh(b, s, (rx + 0.5) * CELL, (ry + 1) * CELL, true, ns, H, style.tex.wall);
      const { gx, gy } = level.global(rx, ry);

      // Pilar en la esquina superior izquierda de la celda, con su código pintado en las cuatro caras.
      if (level.pillar(rx, ry)) {
        const px = rx * CELL;
        const pz = ry * CELL;
        out.pillar.box(px - p, px + p, 0, H, pz - p, pz + p, 2 * p, H);
        if (style.parking) {
          const i = Math.floor(decor(gx * 3 + 1, gy * 5 + 2) * CODE_COUNT);
          const uv: [number, number, number, number] = [(i % 8) / 8, 1 - (Math.floor(i / 8) + 1) / 8, (i % 8 + 1) / 8, 1 - Math.floor(i / 8) / 8];
          const o = p + 0.004;
          for (const [face, x, z] of [
            ['+x', px + o, pz],
            ['-x', px - o, pz],
            ['+z', px, pz + o],
            ['-z', px, pz - o],
          ] as const)
            out.code.decal(face, x, z, 0.24, 1.25, 1.49, uv);
        }
      }

      // Tubos de luz fijos en la grilla global (rx y gx difieren en un múltiplo de 256).
      const light = lightAt(rx, ry);
      if (light !== 'none') {
        const [lx, lz] = L.size;
        const mx = (rx + 0.5) * CELL;
        const mz = (ry + L.zAt) * CELL;
        const target = light === 'on' ? out.light : light === 'dead' ? out.deadLight : out.flickerLight;
        target.flat(mx - lx / 2, mx + lx / 2, mz - lz / 2, mz + lz / 2, H - 0.02, false, 1);
      }

      // Charcos en las filas de tubos; si el tubo de arriba está encendido, con su reflejo (una franja clara, no un
      // reflejo en tiempo real: no cuesta nada en el celu).
      if (style.puddles && mod(ry, L.everyY) === L.rowY && decor(gx, gy) < style.puddles) {
        const r = 0.45 + decor(gy, gx) * 0.6;
        const mx = (rx + 0.5) * CELL;
        const mz = (ry + L.zAt) * CELL;
        out.puddle.disc(mx, 0.004, mz, r * 1.3, r, 18);
        if (lightAt(rx, ry) === 'on') {
          const half = Math.min(L.size[0] / 2, r * 1.1);
          out.reflection.flat(mx - half, mx + half, mz - 0.05, mz + 0.05, 0.006, true, 1);
        }
      }

      // Estacionamiento: filas de pilares cada 4 celdas (borde N de las celdas con ry ≡ 0). A cada lado de la fila,
      // cajones de una celda de ancho; en el medio del pasillo, una línea amarilla punteada.
      if (style.parking) {
        const band = mod(ry, 4);
        const z0 = ry * CELL;
        const z1 = (ry + 1) * CELL;
        if (band === 0 || band === 3) {
          out.paint.flat(rx * CELL - LINE, rx * CELL + LINE, z0, z1, PAINT_Y, true, 1);
          const zEnd = band === 0 ? z1 : z0; // fondo del cajón, del lado del pasillo
          out.paint.flat(rx * CELL, (rx + 1) * CELL, zEnd - LINE, zEnd + LINE, PAINT_Y, true, 1);
        }
        if (band === 1) out.paintYellow.flat(rx * CELL + 0.6, rx * CELL + 1.6, z1 - LINE, z1 + LINE, PAINT_Y, true, 1);
      }
    }

  const x0 = rx0 * CELL;
  const z0 = ry0 * CELL;
  const x1 = (rx0 + CHUNK) * CELL;
  const z1 = (ry0 + CHUNK) * CELL;
  out.floor.flat(x0, x1, z0, z1, 0, true, style.tex.floor);
  out.ceiling.flat(x0, x1, z0, z1, H, false, style.tex.ceiling);
  // Caños a lo largo de x, uno cada cuatro filas, colgados del techo; atraviesan las paredes.
  if (style.pipes)
    for (let ry = ry0; ry < ry0 + CHUNK; ry++)
      if (mod(ry, 4) === 2) {
        const z = (ry + 0.3) * CELL;
        out.pipe.box(x0, x1, H - 0.2, H - 0.08, z - 0.06, z + 0.06, 1, 1);
        out.pipe.box(x0, x1, H - 0.14, H - 0.07, z + 0.16, z + 0.23, 1, 1);
      }
  // Bandejas de cables a lo largo de z, una cada ocho columnas.
  if (style.trays)
    for (let rx = rx0; rx < rx0 + CHUNK; rx++)
      if (mod(rx, 8) === 5) {
        const x = (rx + 0.5) * CELL;
        out.tray.box(x - 0.22, x + 0.22, H - 0.3, H - 0.26, z0, z1, 1, 1);
        out.tray.box(x - 0.22, x - 0.2, H - 0.3, H - 0.22, z0, z1, 1, 1);
        out.tray.box(x + 0.2, x + 0.22, H - 0.3, H - 0.22, z0, z1, 1, 1);
      }

  const m = style.mats;
  const group = new THREE.Group();
  const parts: Array<[Builder, THREE.Material]> = [
    [b.walls, m.wall],
    [b.noclip, m.noclip],
    [b.doors, m.door],
    [b.voids, m.void],
  ];
  for (const k of Object.keys(out) as Array<keyof typeof out>) parts.push([out[k], m[k]]);
  for (const [builder, mat] of parts) {
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
