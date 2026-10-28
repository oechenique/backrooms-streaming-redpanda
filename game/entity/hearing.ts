/*
 * MIT License
 *
 * Copyright (c) 2026 Liminal contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// Portado de yerdaulet-damir/liminal, shared/src/hearing.ts (commit ff9ee5b).
// Cambios: las constantes que usa vienen inline (valores de liminal salvo SPRINT_SPEED, que es nuestra velocidad
// de carrera); `wallsBetween` recorre la grilla de celdas (DDA) en vez de una lista de cajas; sin micrófono.

import { Dir } from '../../world';
import { CELL, type Level } from '../level';
import { RUN } from '../player';

const SPRINT_SPEED = RUN;
/** Más allá de esto no te oye. */
export const HEAR_RANGE = 25;
/** Atenuación por pared entre los dos (tope de 2 paredes). */
const WALL_DAMP = 0.5;

/**
 * Ruido que hace un cuerpo al moverse, 0..1, continuo en la velocidad: sigilo ≈ 0,2 (bajo el umbral, no se oye),
 * caminar 0,4 (se oye de cerca), correr 0,8 (se oye de lejos).
 */
export function footstepNoise(speed: number): number {
  if (speed <= 0.05) return 0;
  return Math.min(0.8, (speed / SPRINT_SPEED) * 0.8);
}

/** Paredes (y puertas de capa) que cruza el segmento a→b, en metros; tope de 2. */
export function wallsBetween(level: Level, a: { x: number; z: number }, b: { x: number; z: number }): number {
  const ax = a.x / CELL;
  const ay = a.z / CELL;
  const dx = b.x / CELL - ax;
  const dy = b.z / CELL - ay;
  let cx = Math.floor(ax);
  let cy = Math.floor(ay);
  const ex = Math.floor(b.x / CELL);
  const ey = Math.floor(b.z / CELL);
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const tdx = dx ? Math.abs(1 / dx) : Infinity;
  const tdy = dy ? Math.abs(1 / dy) : Infinity;
  let tx = dx ? (sx > 0 ? cx + 1 - ax : ax - cx) * tdx : Infinity;
  let ty = dy ? (sy > 0 ? cy + 1 - ay : ay - cy) * tdy : Infinity;
  let hits = 0;
  for (let guard = 0; (cx !== ex || cy !== ey) && guard < 256; guard++) {
    if (tx < ty) {
      if (!level.open(cx, cy, sx > 0 ? Dir.E : Dir.W)) hits++;
      cx += sx;
      tx += tdx;
    } else {
      if (!level.open(cx, cy, sy > 0 ? Dir.S : Dir.N)) hits++;
      cy += sy;
      ty += tdy;
    }
    if (hits >= 2) return 2;
  }
  return hits;
}

/** Cuánto oye el que escucha en `listener` a un cuerpo en `source` que se mueve a `speed` m/s. */
export function heardLoudness(
  level: Level,
  source: { x: number; z: number },
  listener: { x: number; z: number },
  speed: number,
): number {
  const raw = footstepNoise(speed);
  if (raw <= 0) return 0;
  const dist = Math.hypot(source.x - listener.x, source.z - listener.z);
  if (dist >= HEAR_RANGE) return 0;
  const falloff = 1 - dist / HEAR_RANGE;
  return raw * falloff * WALL_DAMP ** wallsBetween(level, source, listener);
}
