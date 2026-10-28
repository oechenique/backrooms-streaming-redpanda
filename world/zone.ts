/*
Copyright (c) 2022 Thomas DiModica.
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions
are met:
1. Redistributions of source code must retain the above copyright
   notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright
   notice, this list of conditions and the following disclaimer in the
   documentation and/or other materials provided with the distribution.
3. Neither the name of Thomas DiModica nor the names of other contributors
   may be used to endorse or promote products derived from this software
   without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THOMAS DIMODICA AND CONTRIBUTORS ``AS IS'' AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED.  IN NO EVENT SHALL THOMAS DIMODICA OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS
OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY
OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
SUCH DAMAGE.
*/

// Portado de TediusTimmy/BackRooms, MazeGen8.cpp (`generate` y sus pasos) y Zone.h.
// Cambios:
// - C++ → TypeScript. El tablero es un Uint8Array plano en vez de Cell[256][256].
// - Los RNG se siembran con `mix(seed, tipo, …)`: la seed cambia el mundo entero.
// - Bordes norte/sur: en el original el borde "up" (fila 0) de la zona y comparte RNG con el "down" (fila 255) de la
//   zona y+1, al revés de cómo quedan pegadas. Acá la fila 255 de la zona y comparte RNG con la fila 0 de la y+1.
// - `addOffices` deja de buscar lugar después de OFFICE_TRIES intentos (el original puede quedar en un bucle
//   infinito si no entra una oficina más).
// - Las cantidades y tamaños salen de la tabla de niveles (levels.ts); el Nivel 0 usa los del original.
// - Se quitaron MakeMap.h (el mapa en texto para el raycaster) y los tipos de borde que el generador no usa.

import { mix, RngKind } from './hash';
import { Lcg } from './lcg';
import { levelParams, type GarageParams, type LevelParams } from './levels';

export const ZONE_SIZE = 256;
const MAX = ZONE_SIZE;
const TOP = MAX - 1;
const OFFICE_TRIES = 10_000;

/** Tipo de borde entre dos celdas. Mismos valores que el enum EDGE original. */
export const Edge = {
  WALL: 0,
  OPEN: 1,
  /** Hueco con marco de puerta: se camina igual que OPEN. */
  DOOR: 2,
  /** Puerta que lleva a la capa z + 1 al cruzarla desde este lado. */
  DOOR_UP: 3,
  /** Puerta que lleva a la capa z - 1 al cruzarla desde este lado. */
  DOOR_DOWN: 4,
} as const;
export type Edge = (typeof Edge)[keyof typeof Edge];

/** Lado de la celda: W = x-1, E = x+1, N = y-1, S = y+1 (le, re, ue, de en el original). */
export const Dir = { W: 0, E: 1, N: 2, S: 3 } as const;
export type Dir = (typeof Dir)[keyof typeof Dir];

export interface Zone {
  readonly seed: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Nivel de los Backrooms. */
  readonly level: number;
  /** 4 bordes por celda: edges[(cy * ZONE_SIZE + cx) * 4 + dir]. */
  readonly edges: Uint8Array;
  /** `addOffices` llegó al tope de intentos (en el original, bucle infinito). Solo informativo. */
  readonly officesCapped: boolean;
}

const { WALL, OPEN, DOOR, DOOR_UP, DOOR_DOWN } = Edge;
const { W, E, N, S } = Dir;

class Board {
  readonly e = new Uint8Array(MAX * MAX * 4); // todo WALL
  readonly v = new Uint8Array(MAX * MAX);

  get(x: number, y: number, d: Dir): number {
    return this.e[(y * MAX + x) * 4 + d];
  }
  set(x: number, y: number, d: Dir, t: number): void {
    this.e[(y * MAX + x) * 4 + d] = t;
  }
  seen(x: number, y: number): boolean {
    return this.v[y * MAX + x] === 1;
  }
  mark(x: number, y: number): void {
    this.v[y * MAX + x] = 1;
  }
}

type Step = readonly [dx: number, dy: number, side: Dir, back: Dir];

// Las cuatro direcciones en el orden del switch original (0 = izq., 1 = der., 2 = arriba, 3 = abajo).
const STEPS: readonly Step[] = [
  [-1, 0, W, E],
  [1, 0, E, W],
  [0, -1, N, S],
  [0, 1, S, N],
];

const isPortal = (t: number) => t === DOOR_UP || t === DOOR_DOWN;
const isPassable = (t: number) => t === OPEN || t === DOOR;
const inside = (x: number, y: number) => x > -1 && x < MAX && y > -1 && y < MAX;

function addDoors(rng: Lcg, b: Board, p: NonNullable<LevelParams['doors']>): void {
  let n = rng.rand(p.span) + p.base;
  while (--n) {
    for (;;) {
      const x = rng.rand(MAX - 2) + 1;
      const y = rng.rand(MAX - 2) + 1;
      const [dx, dy, side, back] = STEPS[rng.rand(4)];
      if (b.get(x, y, side) === WALL) {
        const type = rng.rand(4);
        b.set(x, y, side, type & 1 ? DOOR_UP : DOOR_DOWN);
        b.set(x + dx, y + dy, back, type & 2 ? DOOR_UP : DOOR_DOWN);
        break;
      }
    }
  }
}

// ¿Se pueden abrir todas las paredes interiores del rectángulo? Solo se revisan bordes E y S: hay simetría.
function checkOffice(b: Board, x: number, y: number, w: number, h: number): boolean {
  for (let cx = x; cx < x + w; ++cx)
    for (let cy = y; cy < y + h; ++cy) {
      if (cx + 1 !== x + w && isPortal(b.get(cx, cy, E))) return false;
      if (cy + 1 !== y + h && isPortal(b.get(cx, cy, S))) return false;
      if (b.seen(cx, cy)) return false;
    }
  return true;
}

function setOffice(b: Board, x: number, y: number, w: number, h: number): void {
  for (let cx = x; cx < x + w; ++cx)
    for (let cy = y; cy < y + h; ++cy) {
      if (cx !== x) b.set(cx, cy, W, OPEN);
      if (cx + 1 !== x + w) b.set(cx, cy, E, OPEN);
      if (cy !== y) b.set(cx, cy, N, OPEN);
      if (cy + 1 !== y + h) b.set(cx, cy, S, OPEN);
      b.mark(cx, cy);
    }
}

// Abre la pared (x, y, side) si es WALL: hueco (7/8) o marco de puerta (1/8). Solo consume RNG si la abre.
function openWall(rng: Lcg, b: Board, x: number, y: number, [dx, dy, side, back]: Step): boolean {
  if (b.get(x, y, side) !== WALL) return false;
  const type = rng.rand(8) ? OPEN : DOOR;
  b.set(x, y, side, type);
  b.set(x + dx, y + dy, back, type);
  return true;
}

// Devuelve true si abandonó por llegar al tope de intentos.
function addOffices(rng: Lcg, b: Board, p: LevelParams['offices']): boolean {
  let n = rng.rand(p.span) + p.base;
  while (--n) {
    let found = false;
    for (let tries = 0; !found && tries < OFFICE_TRIES; ++tries) {
      const x = rng.rand(MAX - (p.min + 1)) + 1;
      const y = rng.rand(MAX - (p.min + 1)) + 1;
      let w = rng.rand(p.sizeSpan) + p.min;
      let h = rng.rand(p.sizeSpan) + p.min;
      if (x + w > TOP - 1) w = TOP - 1 - x;
      if (y + h > TOP - 1) h = TOP - 1 - y;
      if (checkOffice(b, x, y, w, h)) {
        setOffice(b, x, y, w, h);
        found = true;
        // Una salida por lado, en el orden del original: arriba, derecha, abajo, izquierda.
        openWall(rng, b, x + rng.rand(w), y, STEPS[2]);
        openWall(rng, b, x + w - 1, y + rng.rand(h), STEPS[1]);
        openWall(rng, b, x + rng.rand(w), y + h - 1, STEPS[3]);
        openWall(rng, b, x, y + rng.rand(h), STEPS[0]);
      }
    }
    if (!found) return true;
  }
  return false;
}

// ¿Se puede tallar desde (x, y) hacia `step`? Vecino dentro del tablero, sin visitar y con pared en medio.
function canCarve(b: Board, x: number, y: number, [dx, dy, side]: Step): boolean {
  return inside(x + dx, y + dy) && !b.seen(x + dx, y + dy) && b.get(x, y, side) === WALL;
}

// Laberinto perfecto por DFS sobre las celdas que no quedaron dentro de una oficina.
function spaceFill(rng: Lcg, b: Board, x: number, y: number, fillAll: boolean): void {
  if (fillAll) {
    do {
      x = rng.rand(MAX);
      y = rng.rand(MAX);
    } while (b.seen(x, y));
  }
  b.mark(x, y);

  const stack: number[] = [x, y];
  while (stack.length) {
    let n = 0;
    for (const step of STEPS) if (canCarve(b, x, y, step)) ++n;

    while (n) {
      for (;;) {
        const step = STEPS[rng.rand(4)];
        if (canCarve(b, x, y, step)) {
          openWall(rng, b, x, y, step);
          b.mark(x + step[0], y + step[1]);
          stack.push(x, y);
          x += step[0];
          y += step[1];
          break;
        }
      }
      n = 0;
      for (const step of STEPS) if (canCarve(b, x, y, step)) ++n;
    }

    y = stack.pop()!;
    x = stack.pop()!;
  }

  if (fillAll)
    for (y = 0; y < MAX; ++y)
      for (x = 0; x < MAX; ++x) if (!b.seen(x, y)) spaceFill(rng, b, x, y, false);
}

// En el original, la reparación prueba en orden izquierda, arriba, derecha, abajo.
const REPAIR_ORDER: readonly Step[] = [STEPS[0], STEPS[2], STEPS[1], STEPS[3]];

// Flood fill desde (0, 0); cada celda que quedó aislada se une a una vecina alcanzada abriendo una pared.
function ensureConnectedness(rng: Lcg, b: Board, x: number, y: number, fillAll: boolean): void {
  if (fillAll) {
    b.v.fill(0);
    x = 0;
    y = 0;
  }
  b.mark(x, y);

  const stack: number[] = [x, y];
  while (stack.length) {
    for (const [dx, dy, side] of STEPS) {
      if (inside(x + dx, y + dy) && !b.seen(x + dx, y + dy) && isPassable(b.get(x, y, side))) {
        b.mark(x + dx, y + dy);
        stack.push(x + dx, y + dy);
      }
    }
    y = stack.pop()!;
    x = stack.pop()!;
  }

  if (fillAll)
    for (y = 0; y < MAX; ++y)
      for (x = 0; x < MAX; ++x)
        if (!b.seen(x, y)) {
          let found = false;
          let d = rng.rand(4);
          for (let c = 0; !found && c < 4; ++c, d = (d + 1) & 3) {
            const step = REPAIR_ORDER[d];
            if (inside(x + step[0], y + step[1]) && b.seen(x + step[0], y + step[1])) found = openWall(rng, b, x, y, step);
          }
          if (found) ensureConnectedness(rng, b, x, y, false);
        }
}

// z = 0: un salón infinito sin paredes (solo quedan las puertas).
function removeEverything(b: Board): void {
  for (let i = 0; i < b.e.length; ++i) if (b.e[i] === WALL) b.e[i] = OPEN;
  b.v.fill(1);
}

// Aberturas en un borde de la zona. La zona vecina usa el mismo RNG, así que abre los mismos huecos.
function connectEdge(rng: Lcg, b: Board, side: Dir): void {
  let n = rng.rand(8) + 8;
  while (--n) {
    const i = rng.rand(MAX);
    const type = rng.rand(8) ? OPEN : DOOR;
    if (side === W) b.set(0, i, W, type);
    else if (side === E) b.set(TOP, i, E, type);
    else if (side === N) b.set(i, 0, N, type);
    else b.set(i, TOP, S, type);
  }
}

// Paredes extra abiertas al final, para que no sea un laberinto perfecto (bucles).
function addMoreDoors(rng: Lcg, b: Board, p: LevelParams['extraOpenings']): void {
  let n = rng.rand(p.span) + p.base;
  while (--n) {
    for (;;) {
      const x = rng.rand(MAX - 2) + 1;
      const y = rng.rand(MAX - 2) + 1;
      const [dx, dy, side, back] = STEPS[rng.rand(4)];
      if (b.get(x, y, side) === WALL) {
        b.set(x, y, side, OPEN);
        b.set(x + dx, y + dy, back, OPEN);
        break;
      }
    }
  }
}

// Estacionamiento (propio, no es del original): todo abierto y unas pocas líneas de pared con huecos. Las líneas del
// borde de la zona usan el RNG de esa costura, el mismo que la zona vecina: coinciden sin conocerse.
function garage(b: Board, p: GarageParams, rng: Lcg, left: Lcg, right: Lcg, up: Lcg, down: Lcg): void {
  b.e.fill(OPEN);
  b.v.fill(1);
  // Recorre una línea de MAX celdas alternando tramos de pared y huecos; `put(i, tipo)` pone el borde de la celda i.
  const line = (r: Lcg, put: (i: number, t: number) => void) => {
    if (r.rand(1000) >= p.lineChance * 1000) return;
    let wall = r.rand(2) === 0;
    for (let i = 0; i < MAX; wall = !wall) {
      const run = wall ? r.rand(p.wall.span) + p.wall.min : r.rand(p.gap.span) + p.gap.min;
      for (let k = 0; k < run && i < MAX; k++, i++) put(i, wall ? WALL : OPEN);
    }
  };
  for (let c = p.lineEvery - 1; c < MAX; c += p.lineEvery) {
    if (c === TOP) {
      line(right, (i, t) => b.set(TOP, i, E, t));
      line(down, (i, t) => b.set(i, TOP, S, t));
    } else {
      line(rng, (i, t) => (b.set(c, i, E, t), b.set(c + 1, i, W, t)));
      line(rng, (i, t) => (b.set(i, c, S, t), b.set(i, c + 1, N, t)));
    }
  }
  line(left, (i, t) => b.set(0, i, W, t));
  line(up, (i, t) => b.set(i, 0, N, t));
}

/**
 * Genera la zona (x, y, z) del nivel `level` del mundo `seed`. Puro y determinístico.
 * Coordenadas: enteros de 32 bits sin signo.
 */
export function generateZone(seed: number, x: number, y: number, z: number, level = 0): Zone {
  seed >>>= 0;
  x >>>= 0;
  y >>>= 0;
  z >>>= 0;
  const p = levelParams(level);
  const m = (kind: RngKind, a: number, b: number, c: number, d: number) => new Lcg(mix(seed, kind, a, b, c, d, level));
  const left = m(RngKind.SEAM_X, x - 1, x, y, z);
  const right = m(RngKind.SEAM_X, x, x + 1, y, z);
  const up = m(RngKind.SEAM_Y, y - 1, y, x, z);
  const down = m(RngKind.SEAM_Y, y, y + 1, x, z);
  // Las puertas no dependen de z: la misma puerta existe en todas las capas, así se puede volver por ella.
  const door = m(RngKind.DOORS, 0, x, y, 1);
  const rng = m(RngKind.INTERIOR, 0, x, y, z);

  const b = new Board();
  let officesCapped = false;
  if (p.layout === 'garage') {
    garage(b, p.garage!, rng, left, right, up, down);
    return { seed, x, y, z, level, edges: b.e, officesCapped };
  }
  if (p.doors) addDoors(door, b, p.doors);
  if (z !== 0) {
    officesCapped = addOffices(rng, b, p.offices);
    spaceFill(rng, b, -1, -1, true);
    ensureConnectedness(rng, b, -1, -1, true);
    connectEdge(left, b, W);
    connectEdge(right, b, E);
    connectEdge(up, b, N);
    connectEdge(down, b, S);
    addMoreDoors(rng, b, p.extraOpenings);
  } else {
    removeEverything(b);
  }
  return { seed, x, y, z, level, edges: b.e, officesCapped };
}
