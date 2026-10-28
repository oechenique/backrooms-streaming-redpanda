// Cómo se ve y suena cada nivel. La geometría sale de world/ (levels.ts); esto es solo presentación.

import * as THREE from 'three';
import type { Materials, Style } from './chunks';
import { carpet, ceiling, concreteCeiling, concreteFloor, concreteWall, wallpaper } from './textures';

export interface Theme {
  fog: number;
  fogNear: number;
  fogFar: number;
  sky: { top: number; bottom: number; intensity: number };
  style: Style;
  /** Zumbido de los tubos: frecuencia base (Hz) y volumen. */
  hum: { freq: number; gain: number };
  /** Cortes de luz al azar (Nivel 1, según la wiki). */
  blackouts: boolean;
  /** Golpes y ruidos en las cañerías del techo. */
  clanks: boolean;
}

/** Material compartido de las paredes de noclip: el que llama lo hace titilar en cada frame. */
export const noclipMaterial = new THREE.MeshLambertMaterial({ map: wallpaper(), transparent: true });

function level0(): Theme {
  const mats: Materials = {
    wall: new THREE.MeshLambertMaterial({ map: wallpaper() }),
    floor: new THREE.MeshLambertMaterial({ map: carpet() }),
    ceiling: new THREE.MeshLambertMaterial({ map: ceiling() }),
    light: new THREE.MeshBasicMaterial({ color: 0xfffbe8 }),
    door: new THREE.MeshLambertMaterial({ color: 0x6e5432 }),
    void: new THREE.MeshBasicMaterial({ color: 0x050402 }),
    noclip: noclipMaterial,
    puddle: new THREE.MeshBasicMaterial({ color: 0x000000 }),
    pipe: new THREE.MeshLambertMaterial({ color: 0x000000 }),
  };
  return {
    fog: 0x7d7140,
    fogNear: 4,
    fogFar: 30,
    sky: { top: 0xfff4cf, bottom: 0xb8ad7a, intensity: 2.2 },
    style: { mats, lightEvery: 2, lightSize: [0.6, 1.2], puddles: false, pipes: false },
    hum: { freq: 120, gain: 0.035 },
    blackouts: false,
    clanks: false,
  };
}

// Nivel 1 — Habitable Zone (https://backrooms-wiki.wikidot.com/level-1, CC BY-SA 3.0): concreto gris, luz
// artificial escasa y fría, charcos, caños en el techo, cortes de luz y ruidos en las cañerías. Implementación propia.
function level1(): Theme {
  const wall = new THREE.MeshLambertMaterial({ map: concreteWall() });
  const mats: Materials = {
    wall,
    floor: new THREE.MeshLambertMaterial({ map: concreteFloor() }),
    ceiling: new THREE.MeshLambertMaterial({ map: concreteCeiling() }),
    light: new THREE.MeshBasicMaterial({ color: 0xe8f1ff }),
    door: new THREE.MeshLambertMaterial({ color: 0x4a4d50 }),
    void: new THREE.MeshBasicMaterial({ color: 0x020203 }),
    noclip: wall,
    puddle: new THREE.MeshPhongMaterial({ color: 0x3a3e40, shininess: 90, specular: 0x8a949c, transparent: true, opacity: 0.6 }),
    pipe: new THREE.MeshLambertMaterial({ color: 0x5b5148 }),
  };
  return {
    fog: 0x25282a,
    fogNear: 3,
    fogFar: 24,
    sky: { top: 0xdfe8f0, bottom: 0x4a4d4f, intensity: 1.6 },
    style: { mats, lightEvery: 3, lightSize: [0.25, 1.4], puddles: true, pipes: true },
    hum: { freq: 100, gain: 0.02 },
    blackouts: true,
    clanks: true,
  };
}

const cache = new Map<number, Theme>();
const BUILDERS = [level0, level1];

/** Tema del nivel (se arma una sola vez por nivel). */
export function themeFor(level: number): Theme {
  let theme = cache.get(level);
  if (!theme) cache.set(level, (theme = (BUILDERS[level] ?? level0)()));
  return theme;
}
