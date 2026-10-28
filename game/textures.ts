// Texturas procedurales dibujadas en canvas: ni un archivo de imagen. Diseño propio.

import * as THREE from 'three';

// PRNG chico (mulberry32) para que las texturas salgan iguales en cada carga. Es solo estética: no toca el mundo.
function prng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, rnd: () => number, n: number, alpha: number) {
  for (let i = 0; i < n; i++) {
    const shade = rnd() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${shade},${shade},${shade},${alpha * rnd()})`;
    ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
  }
}

function toTexture(c: HTMLCanvasElement, repeatX: boolean, repeatY: boolean): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = repeatX ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.wrapT = repeatY ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** Empapelado amarillo con rayas finas y zócalo sucio. Cubre la altura entera de la pared (v = 0 abajo). */
export function wallpaper(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 512);
  const rnd = prng(1);
  ctx.fillStyle = '#c8b46a';
  ctx.fillRect(0, 0, 256, 512);
  for (let x = 0; x < 256; x += 32) {
    ctx.fillStyle = 'rgba(255,240,180,0.18)';
    ctx.fillRect(x, 0, 10, 512);
    ctx.fillStyle = 'rgba(90,70,20,0.12)';
    ctx.fillRect(x + 14, 0, 2, 512);
  }
  speckle(ctx, 256, 512, rnd, 6000, 0.12);
  const grime = ctx.createLinearGradient(0, 512, 0, 380);
  grime.addColorStop(0, 'rgba(60,45,10,0.35)');
  grime.addColorStop(1, 'rgba(60,45,10,0)');
  ctx.fillStyle = grime;
  ctx.fillRect(0, 380, 256, 132);
  ctx.fillStyle = '#7d6a33';
  ctx.fillRect(0, 494, 256, 18);
  return toTexture(c, true, false);
}

/** Alfombra húmeda, marrón amarillenta. */
export function carpet(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  const rnd = prng(2);
  ctx.fillStyle = '#8c7a40';
  ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, 256, rnd, 14000, 0.22);
  for (let i = 0; i < 6; i++) {
    const g = ctx.createRadialGradient(rnd() * 256, rnd() * 256, 0, rnd() * 256, rnd() * 256, 40 + rnd() * 60);
    g.addColorStop(0, 'rgba(50,40,15,0.12)');
    g.addColorStop(1, 'rgba(50,40,15,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  }
  return toTexture(c, true, true);
}

/** Placas de techo acústico de 2×2 pies: la textura cubre 2×2 placas. */
export function ceiling(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  const rnd = prng(3);
  ctx.fillStyle = '#d6cfa6';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = 'rgba(80,70,40,0.25)';
    ctx.fillRect(rnd() * 256, rnd() * 256, 1.5, 1.5);
  }
  ctx.fillStyle = '#9d9370';
  for (const p of [0, 128]) {
    ctx.fillRect(p, 0, 4, 256);
    ctx.fillRect(0, p, 256, 4);
  }
  return toTexture(c, true, true);
}
