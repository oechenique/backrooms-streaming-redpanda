// Eventos del juego con el contrato borrador (se cierra en F2). Por ahora van a la consola y a un buffer;
// en F2 el buffer se manda en batch al collector.
//
// Privacidad: la sesión es un UUID al azar por partida; no se guarda IP, user agent ni nada personal.

import { WORLD_V } from '../world';

export const CLIENT_VERSION = '0.3.0';

export type EventType =
  | 'sesion_inicio'
  | 'sesion_fin'
  | 'posicion'
  | 'zona_cambio'
  | 'laberinto_cambio'
  | 'aparicion'
  | 'deteccion'
  | 'persecucion_inicio'
  | 'escape'
  | 'captura'
  | 'noclip';

export interface GameEvent {
  event_id: string;
  /** ISO 8601 en UTC. */
  ts: string;
  session: string;
  seed: number;
  world_v: number;
  /** Nivel de los Backrooms (0 o 1). */
  level: number;
  type: EventType;
  /** Celda global del jugador, con decimales. */
  x: number;
  y: number;
  /** Capa del mundo. Propuesta para el contrato: sin la capa no se puede reconstruir el mapa. */
  z: number;
  /** `debug`: la partida corrió con ?debug=1 (puede tener nivel o caza forzados); el pipeline la puede filtrar. */
  client: { platform: 'desktop' | 'touch'; version: string; debug: boolean };
  data: Record<string, unknown>;
}

// crypto.randomUUID solo existe en contextos seguros; al probar desde el celu por IP local la página es http.
export function uuid(): string {
  if (typeof crypto.randomUUID === 'function' && isSecureContext) return crypto.randomUUID();
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
  /** Pendientes de envío (F2). */
  readonly buffer: GameEvent[] = [];

  constructor(
    private readonly seed: number,
    private readonly platform: 'desktop' | 'touch',
    private readonly debug = false,
  ) {}

  emit(type: EventType, pos: { x: number; y: number; z: number }, data: Record<string, unknown> = {}): GameEvent {
    const event: GameEvent = {
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
    this.buffer.push(event);
    if (this.buffer.length > 500) this.buffer.shift();
    console.info('[evento]', JSON.stringify(event));
    return event;
  }
}
