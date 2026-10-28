// La Interferencia: vive en la señal. No te ve, te oye. Diseño propio (nombre, forma, reglas, cuerpo y grito).
// El director (director.ts, de liminal) decide el humor; acá está el "cerebro chico": cómo se mueve por el
// laberinto en cada humor, cuándo te atrapa y cómo se ve.
//
// Cuerpo: humanoide desproporcionadamente estirado y flaco, brazos que le llegan debajo de las rodillas, dedos
// largos, cabeza alargada sin ojos ni boca. La piel mezcla carne descompuesta con estática, ruido analógico y
// scanlines. Cuanto más cerca (la misma `threat` que deforma el grito), más se rompe: tirones, desgarros en bandas,
// aberración cromática, bloques que se invierten o faltan durante los cortes, y saltos de posición.

import * as THREE from 'three';
import { Dir } from '../../world';
import { CELL, type Level } from '../level';
import { makeDirector, NOISE_GATE, tickDirector, type Director, type Mood } from './director';
import { heardLoudness, wallsBetween } from './hearing';
import type { Signal } from './signal';

/** Tamaño del cuerpo en metros (casi toca el techo de 2,7 m). */
const BODY_W = 1.7;
const BODY_H = 2.6;
/** Radio de la ventana de búsqueda de caminos, en celdas (81×81 alrededor del jugador). */
const R = 40;
const W = 2 * R + 1;
const REPATH_S = 0.5;
const CAPTURE_M = 0.8;
const EXPOSED_M = 6;
/** Después de una puerta: segundos sin aparecer y celdas extra de distancia al volver. */
const AWAY_MIN_S = 4;
const AWAY_MAX_S = 7;
const AWAY_EXTRA = 8;

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
  /** Está en el mundo (false mientras vuelve después de una puerta). */
  present: boolean;
  /** Distancia en metros (Infinity si no está) y paredes en medio (para el audio). */
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
  private awayS = 0;
  private jumpLeft = 0;
  private jumpOff = 0;
  private readonly rng = { next: Math.random };

  constructor(private readonly level: Level) {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uVisible: { value: 0 },
        uThreat: { value: 0 },
        uBurst: { value: 0 },
        uCut: { value: 0 },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(BODY_W, BODY_H), this.material);
    this.mesh.frustumCulled = false;
  }

  get mood(): Mood {
    return this.director.mood;
  }

  /** Reaparece en la banda de su humor, corrida `extra` celdas más lejos (al empezar o si quedó encerrada). */
  phase(px: number, pz: number, extra = 0): void {
    const prx = Math.floor(px / CELL);
    const pry = Math.floor(pz / CELL);
    this.bfs(prx, pry);
    const [lo, hi] = BEHAVIOR[this.mood].band.map((d) => d + extra);
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

  /**
   * El jugador cruzó una puerta: la señal tarda unos segundos en encontrarlo en la capa nueva y vuelve más lejos.
   * Mientras tanto no oye ni atrapa; el director sigue corriendo (una cacería puede terminar en escape).
   */
  leave(): void {
    this.awayS = AWAY_MIN_S + Math.random() * (AWAY_MAX_S - AWAY_MIN_S);
    this.next = null;
  }

  update(dt: number, player: { x: number; z: number; speed: number }): Tick {
    const from = this.mood;
    if (this.awayS > 0) {
      this.awayS -= dt;
      tickDirector(this.director, { distM: Infinity, noise: 0, exposed: false, dtS: dt }, this.rng);
      if (this.awayS <= 0) this.phase(player.x, player.z, AWAY_EXTRA);
      this.animate(dt);
      const mood = this.mood;
      return { from, mood, detected: false, captured: false, present: this.awayS <= 0, distM: Infinity, walls: 2 };
    }
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
    return { from, mood, detected, captured, present: true, distM, walls };
  }

  /** La señal (la misma que deforma el grito) rompe el cuerpo; los saltos lo corren de costado un instante. */
  glitch(signal: Signal, dt: number): void {
    const u = this.material.uniforms;
    u.uThreat.value = signal.threat;
    u.uBurst.value = signal.burst;
    u.uCut.value = signal.cut ? 1 : 0;
    this.jumpLeft -= dt;
    if (signal.jump) {
      this.jumpLeft = 0.08 + 0.1 * Math.random();
      this.jumpOff = (Math.random() * 2 - 1) * (0.2 + 0.5 * signal.threat);
    }
  }

  /** Orienta el cuerpo hacia la cámara (solo gira en y), con el salto de costado si hay uno en curso. */
  face(camera: THREE.Camera): void {
    const dx = camera.position.x - this.x;
    const dz = camera.position.z - this.z;
    const len = Math.hypot(dx, dz) || 1;
    const off = this.jumpLeft > 0 ? this.jumpOff : 0;
    this.mesh.position.set(this.x + (dz / len) * off, BODY_H / 2, this.z - (dx / len) * off);
    this.mesh.rotation.y = Math.atan2(dx, dz);
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
    let target = this.awayS > 0 ? 0 : BEHAVIOR[this.mood].visible;
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

// Cuerpo por campos de distancia (cápsulas) en metros, sobre un plano de BODY_W × BODY_H.
// k = agresividad: amenaza + ráfaga. Con k alto, tirones, desgarros y aberración.
const FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uVisible;
uniform float uThreat;
uniform float uBurst;
uniform float uCut;
varying vec2 vUv;
varying float vDepth;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float seg(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

float body(vec2 p, float t, float k) {
  float tw = (hash(vec2(floor(t * 18.0), 3.0)) - 0.5) * k; // tirón
  float sway = sin(t * 1.3) * 0.03;
  vec2 chest = vec2(sway * 0.5 + tw * 0.05, 1.95);
  vec2 neckTop = chest + vec2(tw * 0.08, 0.2);
  float d = seg(p, vec2(0.0, 1.25), vec2(0.0, 1.55), 0.055);
  d = min(d, seg(p, vec2(0.0, 1.55), chest, 0.075));
  d = min(d, seg(p, chest, neckTop, 0.028));
  // cabeza alargada, sin rasgos, que se tuerce
  vec2 q = p - (neckTop + vec2(0.02 + tw * 0.1, 0.17));
  float ang = 0.25 * sin(t * 0.7) + tw * 0.6;
  q = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * q;
  d = min(d, (length(q / vec2(0.075, 0.18)) - 1.0) * 0.075);
  for (int i = 0; i < 2; i++) {
    float sx = i == 0 ? -1.0 : 1.0;
    // piernas largas y flacas
    vec2 knee = vec2(sx * 0.09, 0.66);
    d = min(d, seg(p, vec2(sx * 0.06, 1.27), knee, 0.035));
    d = min(d, seg(p, knee, vec2(sx * 0.13, 0.03), 0.028));
    // brazos que llegan debajo de las rodillas
    float swing = sin(t * 1.1 + sx) * 0.04 + (hash(vec2(floor(t * 22.0), sx)) - 0.5) * 0.25 * k;
    vec2 sh = chest + vec2(sx * 0.17, -0.03);
    vec2 el = sh + vec2(sx * (0.12 + swing * 0.5), -0.5);
    vec2 wr = el + vec2(-sx * 0.02 + swing, -0.62);
    d = min(d, seg(p, sh, el, 0.028));
    d = min(d, seg(p, el, wr, 0.022));
    // dedos largos
    for (int f = 0; f < 3; f++) {
      float ff = float(f) - 1.0;
      d = min(d, seg(p, wr, wr + vec2(sx * 0.02 + ff * 0.05 + swing * 0.4, -0.3 - abs(ff) * 0.04), 0.008));
    }
  }
  return d;
}

void main() {
  float t = uTime;
  float k = clamp(uThreat + uBurst * 0.8, 0.0, 1.5);
  float frame = floor(t * 24.0);
  vec2 uv = vUv;
  // desgarros: bandas horizontales que se corren, más y más anchas cuanto más cerca
  float band = floor(uv.y * (12.0 + 30.0 * k));
  float tear = step(1.0 - (0.08 + 0.5 * k), hash(vec2(band, frame)));
  uv.x += tear * (hash(vec2(band, frame + 7.0)) - 0.5) * (0.1 + 0.5 * k);
  // temblor fino de señal mal sintonizada
  uv.x += (hash(vec2(floor(uv.y * 140.0), frame)) - 0.5) * 0.012 * (0.5 + k);
  vec2 p = vec2((uv.x - 0.5) * ${BODY_W.toFixed(2)}, uv.y * ${BODY_H.toFixed(2)});
  // deformación orgánica violenta
  p.x += sin(p.y * 9.0 + t * (3.0 + 25.0 * k)) * 0.02 * k;
  p.y += sin(p.x * 14.0 + t * 20.0) * 0.015 * k;
  // aberración cromática: cada canal ve el cuerpo corrido
  float ab = 0.008 + 0.05 * k;
  float e = 0.012 + 0.02 * k;
  vec3 m = vec3(
    smoothstep(e, -e, body(p + vec2(ab, 0.0), t, k)),
    smoothstep(e, -e, body(p, t, k)),
    smoothstep(e, -e, body(p - vec2(ab, 0.0), t, k))
  );
  float mask = max(m.r, max(m.g, m.b));
  if (mask < 0.01) discard;
  // carne descompuesta: manchas, llagas y venas oscuras
  vec3 flesh = mix(vec3(0.20, 0.11, 0.09), vec3(0.36, 0.33, 0.24), noise(p * 9.0));
  flesh = mix(flesh, vec3(0.08, 0.03, 0.03), smoothstep(0.55, 0.75, noise(p * 31.0 + 4.0)));
  float vein = smoothstep(0.03, 0.0, abs(noise(p * 14.0 + vec2(0.0, t * 0.2)) - 0.5));
  flesh = mix(flesh, vec3(0.05, 0.02, 0.04), vein * 0.7);
  // estática y scanlines encima
  float st = hash(floor(uv * vec2(90.0, 220.0)) + frame);
  vec3 col = mix(flesh, vec3(st), clamp(0.3 + 0.45 * k, 0.0, 0.95));
  col *= 0.75 + 0.25 * sin(uv.y * 900.0 + t * 40.0);
  // durante un corte: bloques que faltan o se invierten
  float blk = hash(floor(vec2(uv.x * 8.0, uv.y * 20.0)) + frame);
  float drop = uCut * step(0.45, blk);
  col = mix(col, 1.0 - col, uCut * step(0.8, blk));
  col *= m * 1.15;
  float fade = 1.0 - smoothstep(6.0, 28.0, vDepth);
  float a = mask * uVisible * fade * (1.0 - drop) * (0.75 + 0.25 * st);
  if (a < 0.02) discard;
  gl_FragColor = vec4(col, a);
}
`;
