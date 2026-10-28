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
  return toTexture(drawWallpaper()[0], true, false);
}

function drawWallpaper(): [HTMLCanvasElement, CanvasRenderingContext2D] {
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
  return [c, ctx];
}

/**
 * El mismo empapelado, roto como una señal mal sintonizada: franjas corridas, bandas de color, estática y scanlines.
 * Es la textura de las paredes de noclip: a simple vista no se parecen a una pared común ni a una puerta.
 */
export function glitchWallpaper(): THREE.CanvasTexture {
  const [c, ctx] = drawWallpaper();
  const rnd = prng(9);
  // franjas horizontales corridas de lugar
  for (let i = 0; i < 26; i++) {
    const y = Math.floor(rnd() * 512);
    const h = 3 + Math.floor(rnd() * 22);
    ctx.drawImage(c, 0, y, 256, h, (rnd() - 0.5) * 90, y, 256, h);
  }
  // bandas de color (separación de canales)
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = ['rgba(255,0,90,0.28)', 'rgba(0,255,220,0.25)', 'rgba(80,120,255,0.25)'][i % 3];
    ctx.fillRect(0, rnd() * 512, 256, 2 + rnd() * 10);
  }
  // estática y scanlines
  for (let i = 0; i < 9000; i++) {
    const v = Math.floor(rnd() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${0.35 * rnd()})`;
    ctx.fillRect(rnd() * 256, rnd() * 512, 2, 1);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < 512; y += 3) ctx.fillRect(0, y, 256, 1);
  return toTexture(c, true, true);
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

/** Concreto gris de pared, con manchas de humedad y marcas del encofrado. Cubre la altura entera de la pared. */
export function concreteWall(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 512);
  const rnd = prng(4);
  ctx.fillStyle = '#8d8c86';
  ctx.fillRect(0, 0, 256, 512);
  speckle(ctx, 256, 512, rnd, 9000, 0.18);
  for (let i = 0; i < 10; i++) {
    const g = ctx.createRadialGradient(rnd() * 256, rnd() * 512, 0, rnd() * 256, rnd() * 512, 30 + rnd() * 90);
    g.addColorStop(0, 'rgba(60,62,58,0.18)');
    g.addColorStop(1, 'rgba(60,62,58,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 512);
  }
  ctx.fillStyle = 'rgba(40,40,38,0.25)';
  for (const y of [128, 256, 384]) ctx.fillRect(0, y, 256, 2);
  const damp = ctx.createLinearGradient(0, 512, 0, 400);
  damp.addColorStop(0, 'rgba(45,48,44,0.45)');
  damp.addColorStop(1, 'rgba(45,48,44,0)');
  ctx.fillStyle = damp;
  ctx.fillRect(0, 400, 256, 112);
  return toTexture(c, true, false);
}

/** Piso de concreto con fisuras finas. */
export function concreteFloor(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  const rnd = prng(5);
  ctx.fillStyle = '#6f6e69';
  ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, 256, rnd, 12000, 0.2);
  ctx.strokeStyle = 'rgba(30,30,28,0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    let x = rnd() * 256;
    let y = rnd() * 256;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 8; k++) ctx.lineTo((x += (rnd() - 0.5) * 40), (y += (rnd() - 0.5) * 40));
    ctx.stroke();
  }
  return toTexture(c, true, true);
}

/** Techo oscuro de losa con juntas. */
export function concreteCeiling(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  const rnd = prng(6);
  ctx.fillStyle = '#3f3f3c';
  ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, 256, rnd, 5000, 0.2);
  ctx.fillStyle = '#2b2b29';
  ctx.fillRect(0, 0, 256, 6);
  return toTexture(c, true, true);
}

/** Cemento liso de estacionamiento, con manchas suaves de aceite y humedad. */
export function cementFloor(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  const rnd = prng(7);
  ctx.fillStyle = '#7b7a74';
  ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, 256, rnd, 4000, 0.08);
  for (let i = 0; i < 7; i++) {
    const x = rnd() * 256;
    const y = rnd() * 256;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 20 + rnd() * 60);
    g.addColorStop(0, 'rgba(40,40,38,0.16)');
    g.addColorStop(1, 'rgba(40,40,38,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  }
  return toTexture(c, true, true);
}

/** Pilar de concreto con la franja de seguridad amarilla y negra abajo. Cubre la altura entera del pilar. */
export function pillarConcrete(): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 512);
  const rnd = prng(8);
  ctx.fillStyle = '#9a9890';
  ctx.fillRect(0, 0, 128, 512);
  speckle(ctx, 128, 512, rnd, 3000, 0.15);
  // franja de 40 cm abajo (512 px ≈ 2,35 m)
  const band = 88;
  ctx.fillStyle = '#1c1c1a';
  ctx.fillRect(0, 512 - band, 128, band);
  for (let x = -128; x < 256; x += 32) {
    ctx.fillStyle = '#d2a821';
    ctx.beginPath();
    ctx.moveTo(x, 512);
    ctx.lineTo(x + 16, 512);
    ctx.lineTo(x + 16 + band, 512 - band);
    ctx.lineTo(x + band, 512 - band);
    ctx.fill();
  }
  return toTexture(c, true, false); // se repite a lo ancho: el UV de las caras va en metros de mundo
}

/**
 * Atlas de códigos genéricos de estacionamiento, pintados en placas claras: 8 × 8 celdas de 128 × 64 px.
 * Letra de sector + número; no copia la señalética de ningún lugar real.
 */
export function codeAtlas(count: number): THREE.CanvasTexture {
  const [c, ctx] = canvas(1024, 512);
  ctx.fillStyle = '#9a9890';
  ctx.fillRect(0, 0, 1024, 512);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 38px monospace';
  for (let i = 0; i < count; i++) {
    const x = (i % 8) * 128;
    const y = Math.floor(i / 8) * 64;
    ctx.fillStyle = '#dcd7c4';
    ctx.fillRect(x + 6, y + 6, 116, 52);
    ctx.fillStyle = '#23231f';
    const code = `${'ABCDEFGH'[i % 8]}-${String(1 + ((i * 7) % 48)).padStart(2, '0')}`;
    ctx.fillText(code, x + 64, y + 34);
  }
  return toTexture(c, false, false);
}
