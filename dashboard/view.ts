// Cámara del mapa: centro en celdas globales y escala en píxeles por celda. Sin DOM, para poder probarla.

export interface View {
  /** Celda global en el centro de la pantalla (con decimales). */
  cx: number;
  cy: number;
  /** Píxeles por celda. */
  scale: number;
}

export const MIN_SCALE = 1.5;
export const MAX_SCALE = 40;

export const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

export function toScreen(v: View, w: number, h: number, gx: number, gy: number): [number, number] {
  return [(gx - v.cx) * v.scale + w / 2, (gy - v.cy) * v.scale + h / 2];
}

export function toCell(v: View, w: number, h: number, sx: number, sy: number): [number, number] {
  return [v.cx + (sx - w / 2) / v.scale, v.cy + (sy - h / 2) / v.scale];
}

/** Zoom alrededor de un punto de la pantalla: la celda bajo el cursor queda quieta. */
export function zoomAt(v: View, w: number, h: number, sx: number, sy: number, factor: number): View {
  const [gx, gy] = toCell(v, w, h, sx, sy);
  const scale = clampScale(v.scale * factor);
  return { scale, cx: gx - (sx - w / 2) / scale, cy: gy - (sy - h / 2) / scale };
}

/** Encuadra los puntos (celdas) con un margen; con uno solo o ninguno, `fallback` a escala media. */
export function fit(points: [number, number][], w: number, h: number, fallback: [number, number], pad = 24): View {
  if (points.length === 0) return { cx: fallback[0], cy: fallback[1], scale: 10 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of points) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  // +1: una celda ocupa de x a x + 1. Un margen mínimo de 12 celdas para que se vea el laberinto alrededor.
  const spanX = Math.max(x1 - x0 + 1, 12) + (2 * pad) / 10;
  const spanY = Math.max(y1 - y0 + 1, 12) + (2 * pad) / 10;
  const scale = clampScale(Math.min(w / spanX, h / spanY, 24));
  return { cx: (x0 + x1 + 1) / 2, cy: (y0 + y1 + 1) / 2, scale };
}

/** Rango de celdas enteras visibles (inclusive). */
export function visibleCells(v: View, w: number, h: number): { gx0: number; gy0: number; gx1: number; gy1: number } {
  const [ax, ay] = toCell(v, w, h, 0, 0);
  const [bx, by] = toCell(v, w, h, w, h);
  return { gx0: Math.floor(ax), gy0: Math.floor(ay), gx1: Math.floor(bx), gy1: Math.floor(by) };
}
