import * as THREE from 'three';
import { daySeed, getStart, levelParams, World, WORLD_V, ZONE_SIZE } from '../world';
import { Sound } from './audio';
import { Chunks } from './chunks';
import { Interferencia, type Tick } from './entity/interferencia';
import { Signal, threatOf } from './entity/signal';
import { safeLanding } from './landing';
import { Events, uuid } from './events';
import { browserOutboxDeps, Outbox } from './outbox';
import { Input } from './input';
import { CELL, CHUNK, Level } from './level';
import { Player, type Crossing } from './player';
import { SHIFT_LAYERS, Shifter } from './shifter';
import { flickerLightMaterial, noclipMaterial, themeFor, type Theme } from './themes';
import { ZoneLoader } from './zones';

// Seed por URL (?seed=123): misma seed, mismo mundo. Sin seed, la seed del día (hash de la fecha UTC): todos los que
// entran ese día juegan el mismo mundo.
function readSeed(): number {
  const raw = new URL(location.href).searchParams.get('seed');
  if (raw && /^\d{1,10}$/.test(raw) && Number(raw) <= 0xffffffff) return Number(raw);
  return daySeed(new Date());
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
// Solo para revisar: ?debug=1&nivel=1 arranca en el Nivel 1. Sin debug siempre se empieza en el 0.
const startLevel = debug && new URL(location.href).searchParams.get('nivel') === '1' ? 1 : 0;
const level = new Level(world, start.gx, start.gy, start.z, startLevel);
const player = new Player(level, (start.gx - level.originGx + 0.5) * CELL, (start.gy - level.originGy + 0.5) * CELL);
// Los eventos van a una cola que los manda al collector cada 2 s (proxy de Vite /api → collector). Si el collector
// no responde, la cola espera y reintenta; el juego sigue igual. Ver outbox.ts.
const outbox = new Outbox(browserOutboxDeps());
const events = new Events(seed, touch ? 'touch' : 'desktop', debug, (e) => outbox.push(e));
setInterval(() => void outbox.flush(), 2000);
events.level = startLevel;
const sound = new Sound();
player.onStep = (speed) => sound.step(speed);

// En celulares: menos píxeles y sin antialias, para sostener los fps.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !touch && devicePixelRatio < 2 });
renderer.setPixelRatio(Math.min(devicePixelRatio, touch ? 1.5 : 2));

const scene = new THREE.Scene();
const fog = new THREE.Fog(0, 1, 2);
scene.fog = fog;
const sky = new THREE.HemisphereLight();
scene.add(sky);
let theme: Theme = themeFor(level.levelNo);

const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 60);
camera.rotation.order = 'YXZ';

const chunks = new Chunks(
  scene,
  level,
  theme.style,
  // Un bloque se arma cuando sus zonas llegaron del worker; si faltan, se piden.
  (cx, cy) => {
    let ready = true;
    for (const [x, y, z, n] of level.chunkZones(cx, cy))
      if (!world.has(x, y, z, n)) {
        ready = false;
        void loader.load(x, y, z, n);
      }
    return ready;
  },
);

// Niebla, cielo, zumbido, estilo de los bloques y título del nivel actual.
function applyTheme(): void {
  theme = themeFor(level.levelNo);
  scene.background = new THREE.Color(theme.fog);
  fog.color.set(theme.fog);
  fog.near = theme.fogNear;
  fog.far = theme.fogFar;
  sky.color.set(theme.sky.top);
  sky.groundColor.set(theme.sky.bottom);
  sky.intensity = theme.sky.intensity;
  sound.setHum(theme.hum);
  chunks.reset(theme.style);
  document.title = `Nivel ${level.levelNo}`;
  if (phase !== 'over') overlay.querySelector('h1')!.textContent = `NIVEL ${level.levelNo}`;
}

const entity = new Interferencia(level);
// Una sola variable de proximidad para el grito, el cuerpo y las luces (ver signal.ts).
const signal = new Signal();
let screaming = false;
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
  loader.prefetch(gx, gy, level.z, level.levelNo, SHIFT_LAYERS, levelParams(level.levelNo).noclipTo);
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
// Nivel 1: cortes de luz y golpes en las cañerías.
let blackoutIn = 40;
let blackoutLeft = 0;
let clankIn = 8;
let dripIn = 2;

function zoneOfPlayer(): string {
  const { gx, gy } = level.global(player.cell.rx, player.cell.ry);
  return `${Math.floor(gx / ZONE_SIZE)},${Math.floor(gy / ZONE_SIZE)},${level.z}`;
}

function zoneKeyOfPlayer(): string {
  return `${level.levelNo}:${zoneOfPlayer()}`;
}

function endSession(motivo: 'captura' | 'salida'): void {
  if (!sessionOpen) return;
  sessionOpen = false;
  events.emit('sesion_fin', where(), { motivo });
}

applyTheme();

const status = $('#status');
status.textContent = 'Cargando…';
// La zona de arranque viene del worker; el resto se precarga mientras se lee el cartel.
void loader.load(Math.floor(start.gx / ZONE_SIZE), Math.floor(start.gy / ZONE_SIZE), start.z, startLevel).then(() => {
  prefetch();
  // Solo para revisar el grito y el cuerpo: ?debug=1&caza=1 arranca con la entidad cazando. No emite
  // persecucion_inicio (sería un evento falso); el escape tampoco sale, porque no hay persecución abierta.
  if (debug && new URL(location.href).searchParams.get('caza') === '1') entity.director.mood = 'hunt';
  entity.phase(player.x, player.z);
  zoneKey = zoneKeyOfPlayer();
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
    events.emit('sesion_inicio', where(), { zona: zoneOfPlayer() });
  }
  phase = 'playing';
});
document.addEventListener('pointerlockchange', () => {
  if (!touch && document.pointerLockElement !== canvas && phase === 'playing') {
    phase = 'paused';
    sound.pause();
    overlay.hidden = false;
  }
});
// Al cerrar: fin de sesión y lo pendiente por sendBeacon. Al pasar a segundo plano (en el celu puede ser lo último que
// pase antes de que el sistema mate la pestaña), solo se manda lo pendiente.
addEventListener('pagehide', () => {
  endSession('salida');
  outbox.flushOnExit();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') outbox.flushOnExit();
});

function crossDoor(dz: 1 | -1): void {
  level.enterLayer(level.z + dz);
  chunks.reset();
  prefetch();
  entity.leave();
  fadeIn(0.35);
}

// Noclip: el jugador se mete en la pared y cae al nivel siguiente, en la misma capa y posición global.
function noclip(): void {
  const from = level.levelNo;
  const to = levelParams(from).noclipTo;
  if (to === null) return;
  events.emit('noclip', where(), { nivel_origen: from, nivel_destino: to });
  // Si te venía cazando y el nivel nuevo es zona segura, el noclip es un escape.
  if (chase && !themeFor(to).entity) {
    events.emit('escape', where(), { persecucion_id: chase.id, duracion_s: round1((performance.now() - chase.t0) / 1000), via: 'noclip' });
    chase = null;
  }
  level.enterLevel(to);
  events.level = to;
  applyTheme();
  // Misma posición global en el nivel nuevo; si ahí hay una pared o un pilar, a la celda caminable más cercana.
  const landing = safeLanding(level, player.x, player.z);
  player.x = landing.x;
  player.z = landing.z;
  prefetch();
  entity.leave();
  blackoutLeft = 0;
  fadeIn(1.2);
}

// Pantalla en negro que se desvanece: tapa el cambio de mundo mientras se arman los bloques.
function fadeIn(seconds: number): void {
  fade.style.transition = 'none';
  fade.style.opacity = '1';
  requestAnimationFrame(() => {
    fade.style.transition = `opacity ${seconds}s`;
    fade.style.opacity = '0';
  });
}

const VIA = { door: 'puerta', noclip: 'noclip' } as const satisfies Record<Crossing['kind'], string>;

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
  // Zona segura: La Interferencia no existe en este nivel (no oye, no se mueve, no se ve, no suena).
  if (!theme.entity) entity.mesh.visible = false;
  const t: Tick = theme.entity
    ? entity.update(dt, player)
    : { from: entity.mood, mood: entity.mood, detected: false, captured: false, present: false, distM: Infinity, walls: 2 };
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
      events.emit('escape', pos, { persecucion_id: chase.id, duracion_s: round1((performance.now() - chase.t0) / 1000), via: 'retirada' });
      chase = null;
    }
  }
  if (t.captured) return capture();

  // El grito empieza con la persecución (mismo frame que persecucion_inicio) y se corta si la entidad deja de
  // cazar o desaparece tras una puerta o un noclip.
  const scream = t.mood === 'hunt' && t.present;
  if (scream && !screaming) sound.screamStart();
  if (!scream && screaming) sound.screamStop();
  screaming = scream;
  signal.update(dt, threatOf(t.mood, t.distM, t.present));
  entity.glitch(signal, dt);

  // Miedo, cansancio, luces y audio.
  const near = (r: number) => Math.max(0, 1 - Math.min(t.distM, r) / r);
  const target = t.mood === 'hunt' ? 0.6 + 0.4 * near(25) : t.mood === 'stalk' ? 0.25 + 0.35 * near(15) : 0;
  fear += (target - fear) * Math.min(1, dt * (target > fear ? 2 : 0.3));
  exertion = Math.max(0, Math.min(1, exertion + (player.speed > 2.5 ? 0.12 : -0.08) * dt));
  // Las luces también se rompen con las ráfagas de la señal.
  const flicker = Math.max(
    t.mood === 'calm' || t.mood === 'retreat' ? 0 : near(15) * (t.mood === 'hunt' ? 1 : 0.6),
    signal.burst * signal.threat,
  );
  const blackout = updateAmbience(dt);
  const dim = blackout ? 0.03 : flicker && Math.random() < flicker * 0.25 ? 0.25 + Math.random() * 0.4 : 1;
  (theme.style.mats.light as THREE.MeshBasicMaterial).color.setScalar(dim);
  sky.intensity = theme.sky.intensity * (blackout ? 0.12 : 0.75 + 0.25 * dim);
  const gain = t.present ? { calm: 0.1, stalk: 0.5, hunt: 1, retreat: 0.25 }[t.mood] * 0.5 ** t.walls : 0;
  sound.update({
    fear,
    exertion,
    flicker,
    blackout,
    signal,
    yaw: player.yaw,
    entity: { dx: entity.x - player.x, dz: entity.z - player.z, gain },
  });
}

// Ambiente del nivel: golpes en las cañerías cada 6–18 s, goteo lejano cada 1,5–6,5 s, tubos que titilan y cortes
// de luz de 2–5 s cada 40–90 s, según lo que tenga el nivel. Devuelve si hay un corte de luz en curso.
function updateAmbience(dt: number): boolean {
  if (theme.clanks && (clankIn -= dt) <= 0) {
    clankIn = 6 + Math.random() * 12;
    sound.clank();
  }
  if (theme.drips && (dripIn -= dt) <= 0) {
    dripIn = 1.5 + Math.random() * 5;
    sound.drip();
  }
  // Tubos que titilan: casi siempre prendidos, a ratos se apagan un instante o quedan a media luz.
  const r = Math.random();
  flickerLightMaterial.color.setScalar(r < 0.08 ? 0.05 : r < 0.14 ? 0.4 : 1);
  if (!theme.blackouts) return false;
  if (blackoutLeft > 0) return (blackoutLeft -= dt) > 0;
  if ((blackoutIn -= dt) <= 0) {
    blackoutIn = 40 + Math.random() * 50;
    blackoutLeft = 2 + Math.random() * 3;
  }
  return false;
}

// Las paredes de noclip titilan: un destello fuerte cada ~1 s, con ráfagas de parpadeo entre medio.
let noclipBurst = 0;
function flickerNoclip(dt: number): void {
  noclipBurst -= dt;
  if (noclipBurst < -0.6 - Math.random() * 0.8) noclipBurst = 0.25 + Math.random() * 0.3;
  const glitch = noclipBurst > 0 ? Math.random() < 0.6 : Math.random() < 0.04;
  noclipMaterial.opacity = glitch ? 0.25 + Math.random() * 0.45 : 1;
  noclipMaterial.emissiveIntensity = glitch ? 0.5 + Math.random() * 0.6 : 0.08;
  // La textura rota se corre en cada falla: las bandas de estática "corren" por la pared.
  if (glitch) noclipMaterial.map!.offset.set(Math.random(), Math.random() * 0.2);
}

let hudText = '';
let frameMs = 0;
function updateHud(): void {
  const { rx, ry } = player.cell;
  const { gx, gy } = level.global(rx, ry);
  let text =
    `seed ${seed} · world_v ${WORLD_V}\n` +
    `nivel ${level.levelNo} · zona ${Math.floor(gx / ZONE_SIZE)}, ${Math.floor(gy / ZONE_SIZE)} · capa ${level.z}\n` +
    `celda ${gx % ZONE_SIZE}, ${gy % ZONE_SIZE}`;
  if (debug) {
    const d = entity.director;
    text +=
      `\n${frameMs.toFixed(1)} ms/frame · ${renderer.info.render.calls} draws` +
      `\ncola ${outbox.size}${outbox.waitMs ? ` · collector sin respuesta, reintento en ${Math.ceil(outbox.waitMs / 1000)} s` : ''}` +
      (theme.entity
        ? `\n${d.mood} · amenaza ${d.menace.toFixed(0)} · sospecha ${d.suspicion.toFixed(1)}` +
          `\nentidad a ${Math.hypot(entity.x - player.x, entity.z - player.z).toFixed(1)} m`
        : '\nzona segura: sin La Interferencia');
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
    if (crossing?.kind === 'door') crossDoor(crossing.dz);
    if (crossing?.kind === 'noclip') noclip();
    const key = zoneKeyOfPlayer();
    if (key !== zoneKey) {
      zoneKey = key;
      prefetch();
      events.emit('zona_cambio', where(), { zona: zoneOfPlayer(), via: crossing ? VIA[crossing.kind] : 'caminando' });
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
  if (levelParams(level.levelNo).noclipRate) flickerNoclip(dt);
  camera.position.set(player.x, player.eyeY, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
  entity.face(camera);
  updateHud();
  renderer.render(scene, camera);
  frameMs += (performance.now() - t0 - frameMs) * 0.05;
});
