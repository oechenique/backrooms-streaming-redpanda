// Gold liviano que exporta el consumer (consumer/gold.py). El servidor de Vite lo sirve en /gold/ desde data/gold.

export interface Resumen {
  seed: number;
  world_v: number;
  sesiones: number;
  duracion_media_s: number | null;
  primera: string;
  ultima: string;
  persecuciones: number;
  capturas: number;
  escapes: number;
  perdidas: number;
  en_curso: number;
  /** Sobre las persecuciones terminadas (escape, captura o pérdida de rastro). */
  pct_captura: number | null;
  duracion_media_persecucion_s: number | null;
  capas: { level: number; z: number; celdas: number; marcas: number }[];
}

export interface Index {
  generado: string;
  mundos: Resumen[];
}

export type Tipo = 'captura' | 'escape' | 'noclip';

export interface Marca {
  tipo: Tipo;
  x: number;
  y: number;
  /** escape: via; captura: humor de la entidad; noclip: "al nivel N". */
  detalle: string | null;
  ts: string;
  /** Primeros 8 caracteres de la sesión (anónima). */
  session: string;
}

export interface Capa {
  level: number;
  z: number;
  /** [celda x, celda y, peso]. */
  rastros: [number, number, number][];
  marcas: Marca[];
}

export interface Mapa {
  seed: number;
  world_v: number;
  capas: Capa[];
}

async function get<T>(path: string): Promise<T | null> {
  const r = await fetch(path, { cache: 'no-store' });
  return r.ok ? ((await r.json()) as T) : null;
}

export const loadIndex = () => get<Index>('/gold/index.json');
export const loadMapa = (seed: number, worldV: number) => get<Mapa>(`/gold/mapa/${seed}-v${worldV}.json`);
