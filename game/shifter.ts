// El laberinto cambia cuando no lo mirás: cada tanto, un bloque fuera de cámara toma su interior de una capa
// vecina. Los bordes del bloque no cambian, así que las aberturas hacia los vecinos siguen en su lugar.
// Idea de pablostanley/vackrooms (secciones fuera de vista que se regeneran con bordes fijos); implementación propia.

import * as THREE from 'three';
import { Dir } from '../world';
import type { Chunks } from './chunks';
import { CELL, CHUNK, isPortal, WALL_H, type Level } from './level';
import type { ZoneLoader } from './zones';

const MIN_WAIT_S = 15;
const MAX_WAIT_S = 30;
/** Distancia mínima del jugador al bloque, en metros: lo que está a la espalda tampoco cambia. */
const MIN_DIST = 5;
/** Capas de donde salen los interiores (relativas a la actual). También se precargan. */
export const SHIFT_LAYERS = [1, -1, 2, -2];

export interface Shift {
  cx: number;
  cy: number;
  from: number;
  to: number;
}

export class Shifter {
  private wait = MIN_WAIT_S;
  private busy = false;
  private readonly frustum = new THREE.Frustum();
  private readonly box = new THREE.Box3();
  private readonly m = new THREE.Matrix4();

  constructor(
    private readonly level: Level,
    private readonly chunks: Chunks,
    private readonly loader: ZoneLoader,
    private readonly camera: THREE.Camera,
    private readonly onShift: (s: Shift) => void,
  ) {}

  update(dt: number, px: number, pz: number): void {
    if (this.busy) return;
    this.wait -= dt;
    if (this.wait > 0) return;
    this.wait = MIN_WAIT_S + Math.random() * (MAX_WAIT_S - MIN_WAIT_S);

    const candidates = [...this.chunks.keys()].filter(([cx, cy]) => this.hidden(cx, cy, px, pz));
    if (!candidates.length) return;
    const [cx, cy] = candidates[Math.floor(Math.random() * candidates.length)];
    const from = this.level.layerOf(cx, cy);
    const options = [0, ...SHIFT_LAYERS].map((d) => (this.level.z + d) >>> 0).filter((l) => l !== from);
    const to = options[Math.floor(Math.random() * options.length)];
    const z = this.level.z;

    // La zona de la otra capa puede no estar cargada: se pide al worker y se aplica al llegar,
    // si para entonces el bloque sigue fuera de vista y no cambiamos de capa.
    this.busy = true;
    const [[zx, zy]] = this.level.chunkZones(cx, cy);
    void this.loader.load(zx, zy, to).then(() => {
      this.busy = false;
      if (this.level.z !== z || this.level.layerOf(cx, cy) !== from) return;
      this.camera.updateMatrixWorld();
      if (!this.hidden(cx, cy, this.camera.position.x, this.camera.position.z)) return;
      this.level.setLayer(cx, cy, to);
      if (!canLeave(this.level, this.camera.position.x, this.camera.position.z)) {
        this.level.setLayer(cx, cy, from);
        return;
      }
      this.chunks.rebuild(cx, cy);
      this.onShift({ cx, cy, from, to });
    });
  }

  // Fuera del frustum de la cámara, lejos del jugador y sin el jugador adentro.
  private hidden(cx: number, cy: number, px: number, pz: number): boolean {
    const x0 = cx * CHUNK * CELL;
    const z0 = cy * CHUNK * CELL;
    const x1 = x0 + CHUNK * CELL;
    const z1 = z0 + CHUNK * CELL;
    const dx = Math.max(x0 - px, 0, px - x1);
    const dz = Math.max(z0 - pz, 0, pz - z1);
    if (Math.hypot(dx, dz) < MIN_DIST) return false;
    this.m.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.m);
    this.box.min.set(x0, 0, z0);
    this.box.max.set(x1, WALL_H, z1);
    return !this.frustum.intersectsBox(this.box);
  }
}

/**
 * ¿Puede el jugador salir de donde está? Flood fill desde su celda dentro de los 3×3 bloques cargados: alcanza con
 * llegar al borde de esa ventana o a una puerta de capa. Evita que un cambio lo deje encerrado.
 */
export function canLeave(level: Level, px: number, pz: number): boolean {
  const rx = Math.floor(px / CELL);
  const ry = Math.floor(pz / CELL);
  const minX = (Math.floor(rx / CHUNK) - 1) * CHUNK;
  const minY = (Math.floor(ry / CHUNK) - 1) * CHUNK;
  const size = 3 * CHUNK;
  const seen = new Uint8Array(size * size);
  const stack = [rx, ry];
  seen[(ry - minY) * size + (rx - minX)] = 1;
  const steps: ReadonlyArray<[number, number, Dir]> = [
    [-1, 0, Dir.W],
    [1, 0, Dir.E],
    [0, -1, Dir.N],
    [0, 1, Dir.S],
  ];
  while (stack.length) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    if (x === minX || y === minY || x === minX + size - 1 || y === minY + size - 1) return true;
    for (const [dx, dy, dir] of steps) {
      const e = level.edge(x, y, dir);
      if (isPortal(e)) return true;
      if (!level.open(x, y, dir)) continue;
      const i = (y + dy - minY) * size + (x + dx - minX);
      if (seen[i]) continue;
      seen[i] = 1;
      stack.push(x + dx, y + dy);
    }
  }
  return false;
}
