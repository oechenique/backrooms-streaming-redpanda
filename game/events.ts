// Eventos del juego. El contrato es contracts/event.schema.json (v1); los tipos de acá lo reflejan para que cada
// `emit` quede chequeado al compilar, y contract.test.ts valida lo que sale contra el schema.
// Cada evento va a la consola y al `sink` (la cola que lo manda al collector, outbox.ts).
//
// Privacidad: la sesión es un UUID al azar por partida; no se guarda IP, user agent ni nada personal.

import { WORLD_V } from '../world';

export const CLIENT_VERSION = '0.4.0';

type Mood = 'calm' | 'stalk' | 'hunt' | 'retreat';

/** `data` de cada tipo de evento. */
export interface EventData {
  sesion_inicio: { zona: string };
  sesion_fin: { motivo: 'captura' | 'salida' };
  posicion: { velocidad: number; humor: Mood };
  zona_cambio: { zona: string; via: 'caminando' | 'puerta' | 'noclip' };
  laberinto_cambio: { bloque_x: number; bloque_y: number; bloque_lado: number; capa_antes: number; capa_despues: number };
  aparicion: { distancia_m: number | null };
  deteccion: { distancia_m: number | null };
  persecucion_inicio: { persecucion_id: string; distancia_m: number | null };
  escape: { persecucion_id: string; duracion_s: number; via: 'retirada' | 'noclip' };
  captura: { persecucion_id: string | null; duracion_s: number; humor: Mood };
  noclip: { nivel_origen: number; nivel_destino: number };
}

export type EventType = keyof EventData;

export interface GameEvent<T extends EventType = EventType> {
  event_id: string;
  /** ISO 8601 en UTC. */
  ts: string;
  session: string;
  seed: number;
  world_v: number;
  /** Nivel de los Backrooms (0 o 1). */
  level: number;
  type: T;
  /** Celda global del jugador, con decimales. */
  x: number;
  y: number;
  /** Capa del mundo. */
  z: number;
  /** `debug`: la partida corrió con ?debug=1 (puede tener nivel o caza forzados); el pipeline la puede filtrar. */
  client: { platform: 'desktop' | 'touch'; version: string; debug: boolean };
  data: EventData[T];
}

// crypto.randomUUID solo existe en contextos seguros; al probar desde el celu por IP local la página es http.
export function uuid(): string {
  if (typeof crypto.randomUUID === 'function' && globalThis.isSecureContext) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((v) => v.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export class Events {
  readonly session = uuid();
  /** Nivel actual de los Backrooms: va en el campo común `level` de cada evento. */
  level = 0;

  constructor(
    private readonly seed: number,
    private readonly platform: 'desktop' | 'touch',
    private readonly debug: boolean,
    private readonly sink: (event: GameEvent) => void,
    private readonly log = true,
  ) {}

  emit<T extends EventType>(type: T, pos: { x: number; y: number; z: number }, data: EventData[T]): GameEvent<T> {
    const event: GameEvent<T> = {
      event_id: uuid(),
      ts: new Date().toISOString(),
      session: this.session,
      seed: this.seed,
      world_v: WORLD_V,
      level: this.level,
      type,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      client: { platform: this.platform, version: CLIENT_VERSION, debug: this.debug },
      data,
    };
    this.sink(event as GameEvent);
    if (this.log) console.info('[evento]', JSON.stringify(event));
    return event;
  }
}
