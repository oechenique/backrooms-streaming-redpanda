// Cola de salida de eventos hacia el collector.
//
// - Cada 2 s (el que llama decide el ritmo) manda un lote por POST al collector (ver collectorUrl).
// - Si el collector no responde o da error, el lote queda en la cola y se reintenta con espera creciente
//   (2, 4, 8… hasta 30 s). El juego no se entera: sigue andando.
// - La cola se guarda en localStorage: si cerrás con el collector caído, se manda en la próxima partida.
// - Al cerrar la pestaña se usa sendBeacon (el navegador lo entrega aunque la página ya no exista).
//
// Entrega at-least-once: un evento puede llegar dos veces (por ejemplo, si el collector lo guardó pero la respuesta
// no llegó). Se deduplica por event_id aguas abajo (F3).

import type { GameEvent } from './events';

export interface OutboxDeps {
  /** POST del lote (JSON). Rechaza si no hubo respuesta (red, collector apagado). */
  send(body: string): Promise<{ ok: boolean; status: number }>;
  /** sendBeacon del lote; true si el navegador lo aceptó para enviar. */
  beacon(body: string): boolean;
  storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  now(): number;
}

const KEY = 'backrooms.outbox';
/** Eventos que se guardan como máximo si el collector no responde (≈ 2 MB); después se descartan los más viejos. */
const MAX_QUEUE = 5000;
const BATCH = 200;
/** sendBeacon tiene un límite de ~64 KB por llamada en varios navegadores. */
const BEACON_BYTES = 60_000;
const BACKOFF_MIN = 2000;
const BACKOFF_MAX = 30_000;

export class Outbox {
  private queue: GameEvent[] = [];
  private inFlight = false;
  private backoff = 0;
  private retryAt = 0;
  /** Eventos descartados por llenarse la cola (para el HUD de debug). */
  dropped = 0;

  constructor(private readonly deps: OutboxDeps) {
    try {
      const saved = deps.storage?.getItem(KEY);
      if (saved) this.queue = JSON.parse(saved) as GameEvent[];
    } catch {
      this.queue = [];
    }
  }

  get size(): number {
    return this.queue.length;
  }

  /** ¿El último envío falló? (y cuántos ms faltan para reintentar) */
  get waitMs(): number {
    return this.backoff ? Math.max(0, this.retryAt - this.deps.now()) : 0;
  }

  push(event: GameEvent): void {
    this.queue.push(event);
    if (this.queue.length > MAX_QUEUE) {
      this.queue.splice(0, this.queue.length - MAX_QUEUE);
      this.dropped++;
    }
  }

  /** Manda un lote si toca. Nunca rechaza: los errores quedan en la cola para el próximo intento. */
  async flush(): Promise<void> {
    if (this.inFlight || !this.queue.length || this.deps.now() < this.retryAt) return this.save();
    this.inFlight = true;
    const batch = this.queue.slice(0, BATCH);
    try {
      const res = await this.deps.send(JSON.stringify(batch));
      // 2xx: guardado (válidos al tópico, inválidos a la DLQ). 400/413: el lote no tiene arreglo; reintentarlo
      // trabaría la cola (el collector ya mandó lo que pudo a la DLQ). Cualquier otra cosa: reintentar.
      if (res.ok || res.status === 400 || res.status === 413) this.ack(batch);
      else this.fail();
    } catch {
      this.fail();
    } finally {
      this.inFlight = false;
      this.save();
    }
  }

  /**
   * Al cerrar: manda lo pendiente con sendBeacon, en partes chicas. Si el collector venía respondiendo, lo que el
   * navegador aceptó sale de la cola; si venía caído, queda guardado igual y se reintenta en la próxima partida.
   */
  flushOnExit(): void {
    const healthy = this.backoff === 0;
    const sent = new Set<GameEvent>();
    for (const part of chunks(this.queue)) if (this.deps.beacon(JSON.stringify(part)) && healthy) part.forEach((e) => sent.add(e));
    if (sent.size) this.queue = this.queue.filter((e) => !sent.has(e));
    this.save();
  }

  private ack(batch: GameEvent[]): void {
    const done = new Set(batch);
    this.queue = this.queue.filter((e) => !done.has(e));
    this.backoff = 0;
    this.retryAt = 0;
  }

  private fail(): void {
    this.backoff = this.backoff ? Math.min(BACKOFF_MAX, this.backoff * 2) : BACKOFF_MIN;
    this.retryAt = this.deps.now() + this.backoff;
  }

  private save(): void {
    try {
      this.deps.storage?.setItem(KEY, JSON.stringify(this.queue));
    } catch {
      // Sin espacio o sin almacenamiento (modo privado): la cola sigue en memoria.
    }
  }
}

// Parte la cola en lotes de menos de BEACON_BYTES y de hasta BATCH eventos.
function chunks(queue: GameEvent[]): GameEvent[][] {
  const out: GameEvent[][] = [];
  let part: GameEvent[] = [];
  let bytes = 2;
  for (const e of queue) {
    const size = JSON.stringify(e).length + 1;
    if (part.length && (bytes + size > BEACON_BYTES || part.length >= BATCH)) {
      out.push(part);
      part = [];
      bytes = 2;
    }
    part.push(e);
    bytes += size;
  }
  if (part.length) out.push(part);
  return out;
}

/**
 * Adónde mandar los eventos: VITE_COLLECTOR_URL (la base del collector, sin /events) si está definida; si no, en
 * desarrollo el proxy de Vite (/api → collector). En un build sin VITE_COLLECTOR_URL devuelve null: telemetría apagada.
 */
export function collectorUrl(base: string | undefined, dev: boolean): string | null {
  const b = base?.trim() || (dev ? '/api' : '');
  return b ? `${b.replace(/\/+$/, '')}/events` : null;
}

/** Dependencias reales del navegador. */
export function browserOutboxDeps(url: string): OutboxDeps {
  let storage: Storage | null = null;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  return {
    send: (body) =>
      fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body }).then((r) => ({
        ok: r.ok,
        status: r.status,
      })),
    beacon: (body) => navigator.sendBeacon(url, new Blob([body], { type: 'application/json' })),
    storage,
    now: () => Date.now(),
  };
}
