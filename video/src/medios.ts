// Escenas, clips y narraciones. El texto de cada escena sale de guion-backrooms.md (scripts/guion.mjs lo copia a
// escenas.json).

import { getAudioDurationInSeconds } from '@remotion/media-utils';
import { getStaticFiles, staticFile } from 'remotion';
import data from './escenas.json';

export const FPS = data.fps;
export const VOLUMEN_JUEGO = data.volumen_juego;
/** Aire entre escenas: el clip sigue medio segundo después de que termina la voz (no después de la última). */
export const AIRE_FRAMES = Math.round(data.aire_s * FPS);

/** Visuales generados en Remotion (src/visuales/), en lugar de un clip grabado. */
export type Visual = 'laberinto' | 'semillas' | 'pipeline' | 'rastros';

/** Un clip grabado (`clip`) o un visual generado (`visual`). */
export interface ClipRef {
  clip?: string;
  visual?: Visual;
  /** Segundo del clip desde el que arranca. */
  desde?: number;
  velocidad?: number;
  /** Reel Insta: peso del corte dentro del bloque (en el gancho, que no tiene voz, son segundos). */
  s?: number;
  /** Reel Insta: punto del clip (x, y en %) que queda en el centro del cuadro vertical. */
  encuadre?: [number, number];
  /** Reel Insta: acercamiento (en un clip `contener`, sobre el ancho del cuadro). */
  zoom?: number;
  /** Reel Insta: el clip entero a lo ancho en vez de recortado al alto (para pantallas: Console, el mapa). */
  contener?: boolean;
}

/** Un bloque del Reel Insta: dura lo que su narración (o la suma de sus cortes, si no tiene voz). */
export interface Bloque {
  id: string;
  texto?: string;
  cortes: ClipRef[];
  /** Volumen del juego en el bloque (por defecto el de todo el video). */
  volumen?: number;
  /** Duración mínima: el bloque sigue después de la voz. */
  min_s?: number;
  /** Segundos que el bloque sigue después de la voz (el cierre, con el link). */
  cola_s?: number;
  /** Sin cortes propios: la voz sigue sobre el último corte del bloque anterior. */
  sigue?: boolean;
  /** Muestra el link del juego al final. */
  link?: boolean;
}

/** Una palabra de la narración con su tiempo (s), para los subtítulos. */
export interface Palabra {
  texto: string;
  desde: number;
  hasta: number;
}

/** Tiempos por letra que devuelve ElevenLabs (audio/<id>.json). */
interface Alineacion {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

export interface Item {
  id: string;
  clips: ClipRef[];
  texto: string;
  /** La luz se apaga al final de la escena (fundido a negro). */
  apagar?: boolean;
}

export const VIDEO = data.video as Item[];
export const REEL = data.reel as Item;
export const INSTA = data.reel_insta as { link: string; aire_s: number; bloques: Bloque[] };
export const MINIATURA = data.miniatura;
/** Mundo de los visuales generados: la seed del día de las grabaciones (las partidas 0.5.0). */
export const VISUALES = data.visuales;

export const clipPath = (clip: string) => `clips/${clip}.mp4`;
export const audioPath = (id: string) => `audio/${id}.mp3`;

/** ¿Está el archivo en public/? (clips y narraciones se generan o graban aparte y no van a git). */
export const existe = (path: string) => getStaticFiles().some((f) => f.name === path);

/**
 * Cada escena dura lo que dura su narración. Sin el mp3 todavía, se estima por palabras (~2,5 por segundo) para poder
 * revisar el armado en el Studio.
 */
export async function duracion(item: Item): Promise<{ frames: number; estimada: boolean }> {
  if (existe(audioPath(item.id))) {
    const s = await getAudioDurationInSeconds(staticFile(audioPath(item.id)));
    return { frames: Math.ceil(s * FPS), estimada: false };
  }
  const palabras = item.texto.split(/\s+/).length;
  return { frames: Math.ceil((palabras / 2.5) * FPS), estimada: true };
}

/** Las palabras de la narración de un bloque, desde los tiempos por letra (sin el json todavía, ninguna). */
export async function palabras(id: string): Promise<Palabra[]> {
  const path = `audio/${id}.json`;
  if (!existe(path)) return [];
  const a: Alineacion = await (await fetch(staticFile(path))).json();
  const out: Palabra[] = [];
  let actual: Palabra | null = null;
  a.characters.forEach((c, i) => {
    if (/\s/.test(c)) {
      actual = null;
      return;
    }
    if (!actual) {
      actual = { texto: '', desde: a.character_start_times_seconds[i], hasta: 0 };
      out.push(actual);
    }
    actual.texto += c;
    actual.hasta = a.character_end_times_seconds[i];
  });
  return out;
}

/** Frames de un bloque del Reel Insta: la voz (o los cortes), con su mínimo y su cola. */
export async function duracionBloque(b: Bloque): Promise<number> {
  const voz = b.texto ? (await duracion({ id: b.id, texto: b.texto, clips: [] })).frames / FPS : 0;
  const cortes = b.texto ? 0 : b.cortes.reduce((s, c) => s + (c.s ?? 1), 0);
  return Math.ceil(Math.max(voz + (b.cola_s ?? 0), cortes, b.min_s ?? 0) * FPS);
}
