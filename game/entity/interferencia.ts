// La Interferencia: vive en la señal. No te ve, te oye. Diseño propio (nombre, forma, reglas).
// El director (director.ts, de liminal) decide el humor; acá está el "cerebro chico": cómo se mueve por el
// laberinto en cada humor, cuándo te atrapa y cómo se ve.

import * as THREE from 'three';
import { Dir } from '../../world';
import { CELL, type Level } from '../level';
import { makeDirector, NOISE_GATE, tickDirector, type Director, type Mood } from './director';
import { heardLoudness, wallsBetween } from './hearing';

/** Radio de la ventana de búsqueda de caminos, en celdas (81×81 alrededor del jugador). */
const R = 40;
const W = 2 * R + 1;
const REPATH_S = 0.5;
const CAPTURE_M = 0.8;
const EXPOSED_M = 6;

/** Por humor: velocidad (m/s), banda de distancia al jugador en celdas de camino, y cuánto se ve (0..1). */
const BEHAVIOR: Record<Mood, { speed: number; band: [number, number]; visible: number }> = {
  calm: { speed: 1.0, band: [9, 14], visible: 0 },
  stalk: { speed: 1.4, band: [4, 7], visible: 0.45 },
  hunt: { speed: 2.9, band: [10, 14], visible: 1 }, // la banda solo se usa si tiene que reaparecer
  retreat: { speed: 2.0, band: [20, 40], visible: 0 },
};

const STEPS: ReadonlyArray<[number, number, Dir]> = [
  [-1, 0, Dir.W],
  [1, 0, Dir.E],
  [0, -1, Dir.N],
  [0, 1, Dir.S],
];

export interface Tick {
  /** Humor antes y después de este frame. */
  from: Mood;
  mood: Mood;
  /** Te oyó por primera vez desde la última cacería. */
  detected: boolean;
  captured: boolean;
  /** Distancia en metros y paredes en medio (para el audio). */
  distM: number;
  walls: number;
}

export class Interferencia {
  readonly director: Director = makeDirector();
  readonly mesh: THREE.Mesh;
  x = 0;
  z = 0;
  private readonly material: THREE.ShaderMaterial;
  private visible = 0;
  private time = 0;
  private repath = 0;
  private field = new Int16Array(W * W);
  private minX = 0;
  private minY = 0;
  private goal: { rx: number; ry: number } | null = null;
  private next: { rx: number; ry: number } | null = null;
  private lastHeard: { rx: number; ry: number } | null = null;
  private heardThisCycle = false;
  private readonly rng = { next: Math.random };

  constructor(private readonly level: Level) {
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uVisible: { value: 0 } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.3), this.material);
    this.mesh.frustumCulled = false;
  }

  get mood(): Mood {
    return this.director.mood;
  }

  /** Reaparece en la banda de su humor (al empezar, al cambiar de capa o si quedó encerrada). */
  phase(px: number, pz: number): void {
    const prx = Math.floor(px / CELL);
    const pry = Math.floor(pz / CELL);
    this.bfs(prx, pry);
    const [lo, hi] = BEHAVIOR[this.mood].band;
    const options: number[] = [];
    let farthest = 0;
    for (let i = 0; i < this.field.length; i++) {
      const d = this.field[i];
      if (d >= lo && d <= hi) options.push(i);
      if (d > this.field[farthest]) farthest = i;
    }
    const i = options.length ? options[Math.floor(Math.random() * options.length)] : farthest;
    const rx = this.minX + (i % W);
    const ry = this.minY + Math.floor(i / W);
    this.x = (rx + 0.5) * CELL;
    this.z = (ry + 0.5) * CELL;
    this.next = null;
    this.repath = 0;
  }

  update(dt: number, player: { x: number; z: number; speed: number }): Tick {
    const from = this.mood;
    const distM = Math.hypot(this.x - player.x, this.z - player.z);
    const walls = wallsBetween(this.level, this, player);
    const noise = heardLoudness(this.level, player, this, player.speed);
    tickDirector(this.director, { distM, noise, exposed: distM < EXPOSED_M && walls === 0, dtS: dt }, this.rng);
    const mood = this.mood;

    const prx = Math.floor(player.x / CELL);
    const pry = Math.floor(player.z / CELL);
    let detected = false;
    if (mood === 'hunt') {
      if (from !== 'hunt' || noise > 0.1) this.lastHeard = { rx: prx, ry: pry };
    } else if (noise >= NOISE_GATE && !this.heardThisCycle) {
      this.heardThisCycle = detected = true;
    }
    if (from !== mood) {
      if (mood === 'calm') this.heardThisCycle = false;
      this.repath = 0;
    }

    this.move(dt, prx, pry);
    const captured = (mood === 'hunt' || mood === 'stalk') && distM < CAPTURE_M && walls === 0;
    this.animate(dt);
    return { from, mood, detected, captured, distM, walls };
  }

  /** Orienta la silueta hacia la cámara (solo gira en y). */
  face(camera: THREE.Camera): void {
    this.mesh.position.set(this.x, 1.15, this.z);
    this.mesh.rotation.y = Math.atan2(camera.position.x - this.x, camera.position.z - this.z);
  }

  private move(dt: number, prx: number, pry: number): void {
    const hunting = this.mood === 'hunt';
    const goal = hunting && this.lastHeard ? this.lastHeard : { rx: prx, ry: pry };
    this.repath -= dt;
    if (this.repath <= 0 || this.goal?.rx !== goal.rx || this.goal?.ry !== goal.ry) {
      this.repath = REPATH_S;
      this.bfs(goal.rx, goal.ry);
      this.goal = goal;
    }

    let rx = Math.floor(this.x / CELL);
    let ry = Math.floor(this.z / CELL);
    // Fuera de la ventana o encerrada (un bloque cambió, o una puerta): salta por la señal.
    if (this.at(rx, ry) < 0) {
      this.phase(prx * CELL, pry * CELL);
      return;
    }
    if (!this.next) this.next = this.choose(rx, ry);
    if (!this.next) return;

    const tx = (this.next.rx + 0.5) * CELL;
    const tz = (this.next.ry + 0.5) * CELL;
    const dx = tx - this.x;
    const dz = tz - this.z;
    const d = Math.hypot(dx, dz);
    const step = BEHAVIOR[this.mood].speed * dt;
    if (d <= step) {
      this.x = tx;
      this.z = tz;
      rx = this.next.rx;
      ry = this.next.ry;
      this.next = null;
    } else {
      this.x += (dx / d) * step;
      this.z += (dz / d) * step;
    }
  }

  // Próxima celda: cacería = bajar por el campo hacia lo último que oyó; si no, mantenerse en la banda.
  private choose(rx: number, ry: number): { rx: number; ry: number } | null {
    const here = this.at(rx, ry);
    const options = STEPS.filter(([, , dir]) => this.level.open(rx, ry, dir))
      .map(([dx, dy]) => ({ rx: rx + dx, ry: ry + dy }))
      .filter((c) => this.at(c.rx, c.ry) >= 0);
    if (!options.length) return null;
    const pick = (list: typeof options) => list[Math.floor(Math.random() * list.length)] ?? null;
    const closer = options.filter((c) => this.at(c.rx, c.ry) < here);
    const farther = options.filter((c) => this.at(c.rx, c.ry) > here);

    if (this.mood === 'hunt') return here > 0 ? pick(closer) : pick(options); // llegó: busca alrededor
    const [lo, hi] = BEHAVIOR[this.mood].band;
    if (here > hi) return pick(closer);
    if (here < lo) return pick(farther) ?? pick(options);
    return pick(options.filter((c) => this.at(c.rx, c.ry) >= lo && this.at(c.rx, c.ry) <= hi)) ?? pick(options);
  }

  private at(rx: number, ry: number): number {
    const x = rx - this.minX;
    const y = ry - this.minY;
    if (x < 0 || y < 0 || x >= W || y >= W) return -1;
    return this.field[y * W + x];
  }

  // Distancia en celdas de camino desde (gx, gy) a cada celda de la ventana; -1 = inalcanzable.
  private bfs(gx: number, gy: number): void {
    this.minX = gx - R;
    this.minY = gy - R;
    const f = this.field;
    f.fill(-1);
    const queue = new Int32Array(W * W);
    let head = 0;
    let tail = 0;
    f[R * W + R] = 0;
    queue[tail++] = R * W + R;
    while (head < tail) {
      const i = queue[head++];
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy, dir] of STEPS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= W) continue;
        const j = ny * W + nx;
        if (f[j] >= 0 || !this.level.open(this.minX + x, this.minY + y, dir)) continue;
        f[j] = f[i] + 1;
        queue[tail++] = j;
      }
    }
  }

  private animate(dt: number): void {
    this.time += dt;
    let target = BEHAVIOR[this.mood].visible;
    if (this.mood === 'stalk' && Math.random() < 0.08) target = 0; // en acecho titila
    this.visible += (target - this.visible) * Math.min(1, dt * 4);
    this.material.uniforms.uTime.value = this.time;
    this.material.uniforms.uVisible.value = this.visible;
    this.mesh.visible = this.visible > 0.01;
  }
}

const VERTEX = /* glsl */ `
varying vec2 vUv;
varying float vDepth;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

// Silueta alta y angosta hecha de estática, con líneas que se corren como una señal mal sintonizada.
const FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uVisible;
varying vec2 vUv;
varying float vDepth;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  float line = floor(vUv.y * 90.0);
  float frame = floor(uTime * 24.0);
  vec2 uv = vUv;
  uv.x += (hash(vec2(line, frame)) - 0.5) * 0.12 * (1.2 - uVisible);
  vec2 body = (uv - vec2(0.5, 0.42)) / vec2(0.2, 0.42);
  vec2 head = (uv - vec2(0.5, 0.88)) / vec2(0.09, 0.07);
  float mask = max(1.0 - smoothstep(0.75, 1.0, length(body)), 1.0 - smoothstep(0.7, 1.0, length(head)));
  float n = hash(floor(uv * vec2(70.0, 160.0)) + frame);
  float fade = 1.0 - smoothstep(6.0, 28.0, vDepth);
  float a = mask * uVisible * fade * (0.55 + 0.45 * n);
  if (a < 0.02) discard;
  gl_FragColor = vec4(vec3(0.08 + 0.85 * n), a);
}
`;
