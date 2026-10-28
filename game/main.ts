import * as THREE from 'three';
import { getStart, World, WORLD_V, ZONE_SIZE } from '../world';
import { Sound } from './audio';
import { Chunks } from './chunks';
import { Interferencia } from './entity/interferencia';
import { Events, uuid } from './events';
import { Input } from './input';
import { CELL, CHUNK, Level } from './level';
import { Player } from './player';
import { SHIFT_LAYERS, Shifter } from './shifter';
import { carpet, ceiling, wallpaper } from './textures';
import { ZoneLoader } from './zones';

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

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const canvas = $<HTMLCanvasElement>('#view');
const hud = $('#hud');
const overlay = $('#overlay');
const fade = $('#fade');
const touch = matchMedia('(pointer: coarse)').matches;
const debug = new URL(location.href).searchParams.has('debug');
overlay.querySelector<HTMLElement>(touch ? '.desktop' : '.touch')!.hidden = true;

const seed = readSeed();
const start = getStart(seed);
const world = new World(seed, 48);
const loader = new ZoneLoader(world);
const level = new Level(world, start.gx, start.gy, start.z);
const player = new Player(level, (start.gx - level.originGx + 0.5) * CELL, (start.gy - level.originGy + 0.5) * CELL);
const events = new Events(seed, touch ? 'touch' : 'desktop');
const sound = new Sound();
player.onStep = (speed) => sound.step(speed);

// En celulares: menos píxeles y sin antialias, para sostener los fps.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !touch && devicePixelRatio < 2 });
renderer.setPixelRatio(Math.min(devicePixelRatio, touch ? 1.5 : 2));

const FOG = 0x7d7140;
const scene = new THREE.Scene();
scene.background = new THREE.Color(FOG);
scene.fog = new THREE.Fog(FOG, 4, 30);
const sky = new THREE.HemisphereLight(0xfff4cf, 0xb8ad7a, 2.2);
scene.add(sky);

const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 60);
camera.rotation.order = 'YXZ';

const lightMat = new THREE.MeshBasicMaterial({ color: 0xfffbe8 });
const chunks = new Chunks(
  scene,
  level,
  {
    wall: new THREE.MeshLambertMaterial({ map: wallpaper() }),
    floor: new THREE.MeshLambertMaterial({ map: carpet() }),
    ceiling: new THREE.MeshLambertMaterial({ map: ceiling() }),
    light: lightMat,
    door: new THREE.MeshLambertMaterial({ color: 0x6e5432 }),
    void: new THREE.MeshBasicMaterial({ color: 0x050402 }),
  },
  // Un bloque se arma cuando sus zonas llegaron del worker; si faltan, se piden.
  (cx, cy) => {
    let ready = true;
    for (const [x, y, z] of level.chunkZones(cx, cy))
      if (!world.has(x, y, z)) {
        ready = false;
        void loader.load(x, y, z);
      }
    return ready;
  },
);

const entity = new Interferencia(level);
scene.add(entity.mesh);

const input = new Input(canvas, $('#stick-base'), $('#stick-knob'));

const where = () => ({ ...level.globalPos(player.x, player.z), z: level.z });

const shifter = new Shifter(level, chunks, loader, camera, ({ cx, cy, from, to }) => {
  const { gx, gy } = level.global(cx * CHUNK, cy * CHUNK);
  events.emit('laberinto_cambio', where(), { bloque_x: gx, bloque_y: gy, bloque_lado: CHUNK, capa_antes: from, capa_despues: to });
});

function resize(): void {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

function prefetch(): void {
  const { gx, gy } = level.global(player.cell.rx, player.cell.ry);
  loader.prefetch(gx, gy, level.z, SHIFT_LAYERS);
}

// --- Estado de la partida ---------------------------------------------------------------------------------------

type Phase = 'loading' | 'ready' | 'playing' | 'paused' | 'over';
let phase: Phase = 'loading';
let sessionOpen = false;
let chase: { id: string; t0: number } | null = null;
let zoneKey = '';
let posTimer = 0;
let fear = 0;
let exertion = 0;

function zoneOfPlayer(): string {
  const { gx, gy } = level.global(player.cell.rx, player.cell.ry);
  return `${Math.floor(gx / ZONE_SIZE)},${Math.floor(gy / ZONE_SIZE)},${level.z}`;
}

function endSession(motivo: 'captura' | 'salida'): void {
  if (!sessionOpen) return;
  sessionOpen = false;
  events.emit('sesion_fin', where(), { motivo });
}

const status = $('#status');
status.textContent = 'Cargando…';
// La zona de arranque viene del worker; el resto se precarga mientras se lee el cartel.
void loader.load(Math.floor(start.gx / ZONE_SIZE), Math.floor(start.gy / ZONE_SIZE), start.z).then(() => {
  prefetch();
  entity.phase(player.x, player.z);
  zoneKey = zoneOfPlayer();
  phase = 'ready';
  status.textContent = '';
});

overlay.addEventListener('click', () => {
  if (phase === 'over') return location.reload();
  if (phase === 'loading') return;
  overlay.hidden = true;
  sound.start();
  if (touch) void document.documentElement.requestFullscreen?.().catch(() => {});
  // Si el navegador niega el lock, se sigue jugando: se mira arrastrando (ver input.ts).
  else void Promise.resolve(canvas.requestPointerLock()).catch(() => {});
  if (!sessionOpen) {
    sessionOpen = true;
    events.emit('sesion_inicio', where(), { zona: zoneKey });
  }
  phase = 'playing';
});
document.addEventListener('pointerlockchange', () => {
  if (!touch && document.pointerLockElement !== canvas && phase === 'playing') {
    phase = 'paused';
    overlay.hidden = false;
  }
});
addEventListener('pagehide', () => endSession('salida'));

function crossDoor(dz: 1 | -1): void {
  level.enterLayer(level.z + dz);
  chunks.reset();
  prefetch();
  entity.leave();
  // Fundido corto: tapa el cambio de mundo mientras se arman los bloques.
  fade.style.transition = 'none';
  fade.style.opacity = '1';
  requestAnimationFrame(() => {
    fade.style.transition = 'opacity 0.35s';
    fade.style.opacity = '0';
  });
}

function capture(): void {
  phase = 'over';
  sound.capture();
  const durationS = chase ? (performance.now() - chase.t0) / 1000 : 0;
  events.emit('captura', where(), { persecucion_id: chase?.id ?? null, duracion_s: round1(durationS), humor: entity.mood });
  chase = null;
  endSession('captura');
  if (document.pointerLockElement) document.exitPointerLock();
  overlay.querySelector('h1')!.textContent = 'TE ENCONTRÓ';
  for (const p of overlay.querySelectorAll<HTMLElement>('p')) p.hidden = true;
  status.hidden = false;
  status.textContent = `La Interferencia te oyó. ${touch ? 'Tocá' : 'Click'} para volver a empezar.`;
  overlay.hidden = false;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

function updateEntity(dt: number): void {
  const t = entity.update(dt, player);
  const pos = where();
  // null mientras la entidad vuelve después de una puerta: todavía no está en el mundo.
  const dist = t.present ? round1(t.distM) : null;
  if (t.detected) events.emit('deteccion', pos, { distancia_m: dist });
  if (t.from !== t.mood) {
    if (t.mood === 'stalk') events.emit('aparicion', pos, { distancia_m: dist });
    if (t.mood === 'hunt') {
      chase = { id: uuid(), t0: performance.now() };
      events.emit('persecucion_inicio', pos, { persecucion_id: chase.id, distancia_m: dist });
    }
    if (t.from === 'hunt' && chase) {
      events.emit('escape', pos, { persecucion_id: chase.id, duracion_s: round1((performance.now() - chase.t0) / 1000) });
      chase = null;
    }
  }
  if (t.captured) return capture();

  // Miedo, cansancio, luces y audio.
  const near = (r: number) => Math.max(0, 1 - Math.min(t.distM, r) / r);
  const target = t.mood === 'hunt' ? 0.6 + 0.4 * near(25) : t.mood === 'stalk' ? 0.25 + 0.35 * near(15) : 0;
  fear += (target - fear) * Math.min(1, dt * (target > fear ? 2 : 0.3));
  exertion = Math.max(0, Math.min(1, exertion + (player.speed > 2.5 ? 0.12 : -0.08) * dt));
  const flicker = t.mood === 'calm' || t.mood === 'retreat' ? 0 : near(15) * (t.mood === 'hunt' ? 1 : 0.6);
  const dim = flicker && Math.random() < flicker * 0.25 ? 0.25 + Math.random() * 0.4 : 1;
  lightMat.color.setScalar(dim);
  sky.intensity = 2.2 * (0.75 + 0.25 * dim);
  const gain = t.present ? { calm: 0.1, stalk: 0.5, hunt: 1, retreat: 0.25 }[t.mood] * 0.5 ** t.walls : 0;
  sound.update({ fear, exertion, flicker, yaw: player.yaw, entity: { dx: entity.x - player.x, dz: entity.z - player.z, gain } });
}

let hudText = '';
let frameMs = 0;
function updateHud(): void {
  const { rx, ry } = player.cell;
  const { gx, gy } = level.global(rx, ry);
  let text =
    `seed ${seed} · world_v ${WORLD_V}\n` +
    `zona ${Math.floor(gx / ZONE_SIZE)}, ${Math.floor(gy / ZONE_SIZE)} · capa ${level.z}\n` +
    `celda ${gx % ZONE_SIZE}, ${gy % ZONE_SIZE}`;
  if (debug) {
    const d = entity.director;
    text +=
      `\n${frameMs.toFixed(1)} ms/frame · ${renderer.info.render.calls} draws` +
      `\n${d.mood} · amenaza ${d.menace.toFixed(0)} · sospecha ${d.suspicion.toFixed(1)}` +
      `\nentidad a ${Math.hypot(entity.x - player.x, entity.z - player.z).toFixed(1)} m`;
  }
  if (text !== hudText) hud.textContent = hudText = text;
}

let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  const t0 = performance.now();
  if (phase === 'playing') {
    input.poll();
    const crossing = player.update(dt, input);
    if (crossing) crossDoor(crossing.dz);
    const key = zoneOfPlayer();
    if (key !== zoneKey) {
      zoneKey = key;
      prefetch();
      events.emit('zona_cambio', where(), { zona: key, via: crossing ? 'puerta' : 'caminando' });
    }
    updateEntity(dt);
    shifter.update(dt, player.x, player.z);
    posTimer -= dt;
    if (posTimer <= 0 && phase === 'playing') {
      posTimer = 2;
      events.emit('posicion', where(), { velocidad: round1(player.speed), humor: entity.mood });
    }
  }
  if (phase !== 'loading') chunks.update(player.x, player.z);
  camera.position.set(player.x, player.eyeY, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
  entity.face(camera);
  updateHud();
  renderer.render(scene, camera);
  frameMs += (performance.now() - t0 - frameMs) * 0.05;
});
