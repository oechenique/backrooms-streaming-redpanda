// Dónde aparece el jugador después de un noclip. Mantiene la posición global, pero el nivel nuevo tiene otras paredes:
// si el punto cae dentro de una pared o un pilar, o en una celda encerrada, se busca la celda caminable más cercana.

import { CELL, type Level } from './level';
import { solidAt } from './player';
import { canLeave } from './shifter';

/** Hasta cuántas celdas de distancia se busca (anillos alrededor de la celda de llegada). */
const SEARCH_RINGS = 12;

/** ¿Se puede estar parado en (x, z) y salir caminando de ahí? */
export function walkable(level: Level, x: number, z: number): boolean {
  return !solidAt(level, x, z) && canLeave(level, x, z);
}

/**
 * Punto de llegada seguro cerca de (x, z), en metros. Si el punto ya es caminable, lo devuelve tal cual. Si no, prueba
 * el centro de la celda y después anillos de celdas cada vez más lejanos; en cada anillo elige el centro caminable más
 * cercano al punto original.
 */
export function safeLanding(level: Level, x: number, z: number): { x: number; z: number } {
  if (walkable(level, x, z)) return { x, z };
  const rx = Math.floor(x / CELL);
  const ry = Math.floor(z / CELL);
  for (let r = 0; r <= SEARCH_RINGS; r++) {
    let best: { x: number; z: number; d: number } | null = null;
    for (let cy = ry - r; cy <= ry + r; cy++)
      for (let cx = rx - r; cx <= rx + r; cx++) {
        if (Math.max(Math.abs(cx - rx), Math.abs(cy - ry)) !== r) continue; // solo el borde del anillo
        const px = (cx + 0.5) * CELL;
        const pz = (cy + 0.5) * CELL;
        const d = Math.hypot(px - x, pz - z);
        if ((!best || d < best.d) && walkable(level, px, pz)) best = { x: px, z: pz, d };
      }
    if (best) return { x: best.x, z: best.z };
  }
  return { x, z };
}
