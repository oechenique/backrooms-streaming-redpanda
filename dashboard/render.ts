// Dibujo del mapa en canvas 2D: el laberinto reconstruido con world/, el heatmap de rastros y las marcas.

import { Dir, Edge, type World } from '../world';
import type { Capa, Marca, Tipo } from './gold';
import { toScreen, visibleCells, type View } from './view';

export const SURFACE = '#1a170c';
const WALL = 'rgb(176 156 84 / 0.55)';
const DOOR = '#c8a46a';
const PILLAR = 'rgb(176 156 84 / 0.7)';
const NOCLIP_WALL = 'rgb(162 122 230 / 0.75)';

/** Colores de marca (validados contra el fondo, modo oscuro) y forma: la identidad nunca va solo por color. */
export const MARK: Record<Tipo, { color: string; label: string; shape: 'x' | 'tri' | 'diamond' }> = {
  captura: { color: '#e0574a', label: 'Captura', shape: 'x' },
  escape: { color: '#2fa898', label: 'Escape', shape: 'tri' },
  noclip: { color: '#a27ae6', label: 'Noclip', shape: 'diamond' },
};

/** Más celdas que esto en pantalla: no se dibuja el laberinto (hay que acercarse). */
export const MAX_WALL_CELLS = 450_000;

/** Rampa del heatmap: un solo tono, de casi el fondo a amarillo pálido (más rastro = más claro). */
const RAMP = ['#3a3214', '#7d6a26', '#c8ad48', '#f3e6a2'];
export const RAMP_CSS = `linear-gradient(90deg, ${RAMP.join(', ')})`;

const palette: Uint8ClampedArray = (() => {
  const rgb = RAMP.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  const out = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * (rgb.length - 1);
    const k = Math.min(rgb.length - 2, Math.floor(t));
    const f = t - k;
    for (let c = 0; c < 3; c++) out[i * 3 + c] = rgb[k][c] + (rgb[k + 1][c] - rgb[k][c]) * f;
  }
  return out;
})();

export interface Scene {
  world: World | null;
  level: number;
  z: number;
  capa: Capa | null;
}

export function drawMap(ctx: CanvasRenderingContext2D, v: View, scene: Scene): { walls: boolean } {
  const { width: w, height: h } = ctx.canvas;
  ctx.fillStyle = SURFACE;
  ctx.fillRect(0, 0, w, h);
  const r = visibleCells(v, w, h);
  const cells = (r.gx1 - r.gx0 + 1) * (r.gy1 - r.gy0 + 1);
  const walls = scene.world !== null && cells <= MAX_WALL_CELLS;
  if (walls) drawWalls(ctx, v, scene.world!, scene.level, scene.z, r);
  if (scene.capa) {
    drawHeat(ctx, v, scene.capa.rastros);
    for (const m of scene.capa.marcas) drawMark(ctx, v, m);
  }
  return { walls };
}

function drawWalls(
  ctx: CanvasRenderingContext2D,
  v: View,
  world: World,
  level: number,
  z: number,
  r: ReturnType<typeof visibleCells>,
): void {
  const { width: w, height: h } = ctx.canvas;
  const s = v.scale;
  const [ox, oy] = toScreen(v, w, h, r.gx0, r.gy0);
  const walls = new Path2D();
  const doors = new Path2D();
  const noclips = new Path2D();
  const pillars = new Path2D();
  const detail = s >= 8;
  // Cada borde se dibuja una vez: el E y el S de cada celda (más el W y el N de la primera fila y columna).
  for (let gy = r.gy0 - 1; gy <= r.gy1; gy++) {
    const y = oy + (gy - r.gy0) * s;
    for (let gx = r.gx0 - 1; gx <= r.gx1; gx++) {
      const x = ox + (gx - r.gx0) * s;
      const e = world.edge(gx, gy, z, Dir.E, level);
      const so = world.edge(gx, gy, z, Dir.S, level);
      if (e === Edge.WALL) {
        const path = detail && world.noclip(gx, gy, z, Dir.E, level) ? noclips : walls;
        path.moveTo(x + s, y);
        path.lineTo(x + s, y + s);
      } else if (e === Edge.DOOR_UP || e === Edge.DOOR_DOWN) {
        doors.moveTo(x + s, y + s * 0.2);
        doors.lineTo(x + s, y + s * 0.8);
      }
      if (so === Edge.WALL) {
        const path = detail && world.noclip(gx, gy, z, Dir.S, level) ? noclips : walls;
        path.moveTo(x, y + s);
        path.lineTo(x + s, y + s);
      } else if (so === Edge.DOOR_UP || so === Edge.DOOR_DOWN) {
        doors.moveTo(x + s * 0.2, y + s);
        doors.lineTo(x + s * 0.8, y + s);
      }
      if (s >= 5 && world.pillar(gx, gy, z, level)) {
        const p = Math.max(2, s * 0.3);
        pillars.rect(x - p / 2, y - p / 2, p, p);
      }
    }
  }
  ctx.lineCap = 'square';
  ctx.lineWidth = s >= 6 ? 1.5 : 1;
  ctx.strokeStyle = WALL;
  ctx.stroke(walls);
  ctx.lineWidth = Math.max(1.5, s * 0.18);
  ctx.strokeStyle = DOOR;
  ctx.stroke(doors);
  ctx.strokeStyle = NOCLIP_WALL;
  ctx.lineWidth = 2;
  ctx.stroke(noclips);
  ctx.fillStyle = PILLAR;
  ctx.fill(pillars);
}

// Heatmap: manchas en escala de alfa sobre un canvas aparte y después cada píxel toma el color de la rampa.
let heatCanvas: HTMLCanvasElement | null = null;

function drawHeat(ctx: CanvasRenderingContext2D, v: View, rastros: Capa['rastros']): void {
  if (rastros.length === 0) return;
  const { width: w, height: h } = ctx.canvas;
  heatCanvas ??= document.createElement('canvas');
  const hc = heatCanvas;
  if (hc.width !== w || hc.height !== h) {
    hc.width = w;
    hc.height = h;
  }
  const hx = hc.getContext('2d', { willReadFrequently: true })!;
  hx.clearRect(0, 0, w, h);
  const radius = Math.max(6, v.scale * 1.4);
  const max = Math.max(...rastros.map((r) => r[2]));
  const sprite = blob(radius);
  for (const [cx, cy, peso] of rastros) {
    const [x, y] = toScreen(v, w, h, cx + 0.5, cy + 0.5);
    if (x < -radius || y < -radius || x > w + radius || y > h + radius) continue;
    hx.globalAlpha = 0.25 + 0.75 * Math.sqrt(peso / max);
    hx.drawImage(sprite, x - radius, y - radius);
  }
  const img = hx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a === 0) continue;
    d[i] = palette[a * 3];
    d[i + 1] = palette[a * 3 + 1];
    d[i + 2] = palette[a * 3 + 2];
    d[i + 3] = Math.min(235, a * 1.6);
  }
  hx.putImageData(img, 0, 0);
  ctx.drawImage(hc, 0, 0);
}

const blobs = new Map<number, HTMLCanvasElement>();

function blob(radius: number): HTMLCanvasElement {
  const r = Math.round(radius);
  let c = blobs.get(r);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = r * 2;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgb(0 0 0 / 0.55)');
  grad.addColorStop(1, 'rgb(0 0 0 / 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, r * 2, r * 2);
  blobs.set(r, c);
  return c;
}

export const MARK_SIZE = 12;

export function drawMark(ctx: CanvasRenderingContext2D, v: View, m: Marca): void {
  const { width: w, height: h } = ctx.canvas;
  const [x, y] = toScreen(v, w, h, m.x, m.y);
  shape(ctx, MARK[m.tipo].shape, x, y, MARK_SIZE, MARK[m.tipo].color);
}

/** Forma de marca con un anillo del color del fondo para que se lea sobre el heatmap y las paredes. */
export function shape(ctx: CanvasRenderingContext2D, kind: 'x' | 'tri' | 'diamond', x: number, y: number, size: number, color: string): void {
  const r = size / 2;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const path = new Path2D();
  if (kind === 'x') {
    path.moveTo(x - r, y - r);
    path.lineTo(x + r, y + r);
    path.moveTo(x + r, y - r);
    path.lineTo(x - r, y + r);
    ctx.strokeStyle = SURFACE;
    ctx.lineWidth = 6;
    ctx.stroke(path);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke(path);
  } else {
    if (kind === 'tri') {
      path.moveTo(x, y - r * 1.1);
      path.lineTo(x + r, y + r * 0.8);
      path.lineTo(x - r, y + r * 0.8);
    } else {
      path.moveTo(x, y - r);
      path.lineTo(x + r, y);
      path.lineTo(x, y + r);
      path.lineTo(x - r, y);
    }
    path.closePath();
    ctx.strokeStyle = SURFACE;
    ctx.lineWidth = 4;
    ctx.stroke(path);
    ctx.fillStyle = color;
    ctx.fill(path);
  }
  ctx.restore();
}
