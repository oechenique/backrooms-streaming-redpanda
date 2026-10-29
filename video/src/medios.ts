// Escenas, clips y narraciones. El texto de cada escena sale de guion-backrooms.md (scripts/guion.mjs lo copia a
// escenas.json).

import { getAudioDurationInSeconds } from '@remotion/media-utils';
import { getStaticFiles, staticFile } from 'remotion';
import data from './escenas.json';

export const FPS = data.fps;
export const VOLUMEN_JUEGO = data.volumen_juego;
/** Aire entre escenas: el clip sigue medio segundo después de que termina la voz (no después de la última). */
export const AIRE_FRAMES = Math.round(data.aire_s * FPS);

export interface ClipRef {
  clip: string;
  /** Segundo del clip desde el que arranca. */
  desde?: number;
  velocidad?: number;
}

export interface Item {
  id: string;
  clips: ClipRef[];
  texto: string;
  /** La luz se apaga al final de la escena (fundido a negro). */
  apagar?: boolean;
}

export const VIDEO: Item[] = data.video;
export const REEL: Item = data.reel;
export const MINIATURA = data.miniatura;

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
