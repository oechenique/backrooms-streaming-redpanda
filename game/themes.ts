// Cómo se ve y suena cada nivel. La geometría sale de world/ (levels.ts); esto es solo presentación.

import * as THREE from 'three';
import { CODE_COUNT, type Materials, type Style } from './chunks';
import {
  carpet,
  cementFloor,
  ceiling,
  codeAtlas,
  concreteCeiling,
  concreteWall,
  glitchWallpaper,
  pillarConcrete,
  wallpaper,
} from './textures';

export interface Theme {
  fog: number;
  fogNear: number;
  fogFar: number;
  sky: { top: number; bottom: number; intensity: number };
  style: Style;
  /** Zumbido de los tubos: frecuencia base (Hz) y volumen. */
  hum: { freq: number; gain: number };
  /** Cortes de luz al azar. */
  blackouts: boolean;
  /** Golpes y ruidos en las cañerías del techo. */
  clanks: boolean;
  /** Goteo lejano. */
  drips: boolean;
  /** ¿Aparece La Interferencia? El Nivel 1 es zona segura. */
  entity: boolean;
}

/**
 * Material compartido de las paredes de noclip: empapelado roto por estática y bandas de color, sin niebla para que
 * se vea desde lejos. El que llama lo hace titilar y le corre la textura en cada frame.
 */
export const noclipMaterial = new THREE.MeshLambertMaterial({
  map: glitchWallpaper(),
  transparent: true,
  fog: false,
  emissive: 0xfff1c4,
  emissiveIntensity: 0,
});

/** Tubos que titilan: el que llama les cambia el color en cada frame. */
export const flickerLightMaterial = new THREE.MeshBasicMaterial({ color: 0xe8f1ff });

// Lo que un nivel no usa: no se llega a dibujar (sus mallas quedan vacías), pero el tipo pide un material.
const unused = new THREE.MeshBasicMaterial();

function level0(): Theme {
  const mats: Materials = {
    wall: new THREE.MeshLambertMaterial({ map: wallpaper() }),
    floor: new THREE.MeshLambertMaterial({ map: carpet() }),
    ceiling: new THREE.MeshLambertMaterial({ map: ceiling() }),
    light: new THREE.MeshBasicMaterial({ color: 0xfffbe8 }),
    deadLight: unused,
    flickerLight: unused,
    // Puerta de capa: marco de madera clara alrededor de un hueco negro.
    door: new THREE.MeshLambertMaterial({ color: 0x9a7444 }),
    void: new THREE.MeshBasicMaterial({ color: 0x050402 }),
    noclip: noclipMaterial,
    puddle: unused,
    reflection: unused,
    pipe: unused,
    tray: unused,
    pillar: unused,
    code: unused,
    paint: unused,
    paintYellow: unused,
  };
  return {
    fog: 0x7d7140,
    fogNear: 4,
    fogFar: 30,
    sky: { top: 0xfff4cf, bottom: 0xb8ad7a, intensity: 2.2 },
    style: {
      mats,
      height: 2.7,
      tex: { wall: 1.1, floor: 1.5, ceiling: 1.2 },
      lights: { everyX: 2, everyY: 2, rowY: 0, zAt: 0.5, size: [0.6, 1.2], dead: 0, flicker: 0 },
      puddles: 0,
      pipes: false,
      trays: false,
      parking: false,
    },
    hum: { freq: 120, gain: 0.035 },
    blackouts: false,
    clanks: false,
    drips: false,
    entity: true,
  };
}

// Nivel 1 — estacionamiento subterráneo infinito (zona segura). Partimos de la wiki
// (https://backrooms-wiki.wikidot.com/level-1, CC BY-SA 3.0: concreto, luz artificial, charcos, caños, ruidos en las
// cañerías); techo bajo, grilla de pilares, filas de tubos con algunos muertos, líneas pintadas y códigos en los
// pilares son diseño propio.
function level1(): Theme {
  const mats: Materials = {
    wall: new THREE.MeshLambertMaterial({ map: concreteWall() }),
    floor: new THREE.MeshLambertMaterial({ map: cementFloor() }),
    ceiling: new THREE.MeshLambertMaterial({ map: concreteCeiling() }),
    light: new THREE.MeshBasicMaterial({ color: 0xe8f1ff }),
    deadLight: new THREE.MeshBasicMaterial({ color: 0x34383a }),
    flickerLight: flickerLightMaterial,
    door: new THREE.MeshLambertMaterial({ color: 0x4a4d50 }),
    void: new THREE.MeshBasicMaterial({ color: 0x020203 }),
    noclip: noclipMaterial,
    puddle: new THREE.MeshLambertMaterial({ color: 0x2c3234, transparent: true, opacity: 0.5 }),
    reflection: new THREE.MeshBasicMaterial({
      color: 0xcfdcf0,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    pipe: new THREE.MeshLambertMaterial({ color: 0x5b5148 }),
    tray: new THREE.MeshLambertMaterial({ color: 0x6b6e70 }),
    pillar: new THREE.MeshLambertMaterial({ map: pillarConcrete() }),
    code: new THREE.MeshLambertMaterial({ map: codeAtlas(CODE_COUNT) }),
    paint: new THREE.MeshLambertMaterial({ color: 0xd8d6cc }),
    paintYellow: new THREE.MeshLambertMaterial({ color: 0xc9a227 }),
  };
  return {
    fog: 0x1f2422,
    fogNear: 3,
    fogFar: 26,
    sky: { top: 0xe2ecf2, bottom: 0x4e5452, intensity: 1.5 },
    style: {
      mats,
      height: 2.35,
      tex: { wall: 2.2, floor: 3, ceiling: 2.2 },
      // Filas de tubos sobre el centro de cada pasillo (el borde entre las filas 1 y 2 de cada 4), uno cada 2 celdas.
      lights: { everyX: 2, everyY: 4, rowY: 1, zAt: 1, size: [1.25, 0.14], dead: 0.14, flicker: 0.05 },
      puddles: 0.35,
      pipes: true,
      trays: true,
      parking: true,
    },
    hum: { freq: 100, gain: 0.022 },
    blackouts: false,
    clanks: true,
    drips: true,
    entity: false,
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
