import * as THREE from 'three';
import { getStart, World, WORLD_V, ZONE_SIZE } from '../world';
import { Chunks } from './chunks';
import { Input } from './input';
import { CELL, Level } from './level';
import { Player } from './player';
import { carpet, ceiling, wallpaper } from './textures';

// Seed por URL (?seed=123): misma seed, mismo mundo. Sin seed se sortea una y se escribe en la URL.
function readSeed(): number {
  const url = new URL(location.href);
  const raw = url.searchParams.get('seed');
  if (raw && /^\d{1,10}$/.test(raw) && Number(raw) <= 0xffffffff) return Number(raw);
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  url.searchParams.set('seed', String(seed));
  history.replaceState(null, '', url);
  return seed;
}

const seed = readSeed();
const start = getStart(seed);
const level = new Level(new World(seed), start.gx, start.gy, start.z);
const player = new Player(
  level,
  (start.gx - level.originGx + 0.5) * CELL,
  (start.gy - level.originGy + 0.5) * CELL,
);

const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const hud = document.querySelector<HTMLElement>('#hud')!;
const overlay = document.querySelector<HTMLElement>('#overlay')!;
const touch = matchMedia('(pointer: coarse)').matches;
overlay.querySelector<HTMLElement>(touch ? '.desktop' : '.touch')!.hidden = true;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: devicePixelRatio < 2 });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

const FOG = 0x7d7140;
const scene = new THREE.Scene();
scene.background = new THREE.Color(FOG);
scene.fog = new THREE.Fog(FOG, 4, 30);
scene.add(new THREE.HemisphereLight(0xfff4cf, 0xb8ad7a, 2.2));

const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 60);
camera.rotation.order = 'YXZ';

const chunks = new Chunks(scene, level, {
  wall: new THREE.MeshLambertMaterial({ map: wallpaper() }),
  floor: new THREE.MeshLambertMaterial({ map: carpet() }),
  ceiling: new THREE.MeshLambertMaterial({ map: ceiling() }),
  light: new THREE.MeshBasicMaterial({ color: 0xfffbe8 }),
  door: new THREE.MeshLambertMaterial({ color: 0x6e5432 }),
});

const input = new Input(canvas, document.querySelector('#stick-base')!, document.querySelector('#stick-knob')!);

function resize(): void {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// Entrar: en desktop toma el mouse; en táctil solo oculta el cartel. Esc lo vuelve a mostrar.
let playing = false;
overlay.addEventListener('click', () => {
  overlay.hidden = true;
  playing = true;
  if (!touch) canvas.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  if (!touch && document.pointerLockElement !== canvas) {
    playing = false;
    overlay.hidden = false;
  }
});

let hudText = '';
function updateHud(): void {
  const { rx, ry } = player.cell;
  const { gx, gy } = level.global(rx, ry);
  const text =
    `seed ${seed} · world_v ${WORLD_V}\n` +
    `zona ${Math.floor(gx / ZONE_SIZE)}, ${Math.floor(gy / ZONE_SIZE)} · capa ${level.z}\n` +
    `celda ${gx % ZONE_SIZE}, ${gy % ZONE_SIZE}`;
  if (text !== hudText) hud.textContent = hudText = text;
}

let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (playing) {
    input.poll();
    player.update(dt, input);
  }
  chunks.update(player.x, player.z);
  camera.position.set(player.x, player.eyeY, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
  updateHud();
  renderer.render(scene, camera);
});
