// Pide zonas al worker y las guarda en el World. Si el juego necesita una zona que todavía no llegó,
// World la genera en el hilo principal: es el caso raro, la precarga existe para evitarlo.

import { ZONE_SIZE, type World, type Zone } from '../world';
import type { ZoneRequest } from './zone-worker';

export class ZoneLoader {
  private readonly worker = new Worker(new URL('./zone-worker.ts', import.meta.url), { type: 'module' });
  private readonly pending = new Map<string, Array<() => void>>();
  private queue: ZoneRequest[] = [];
  private busy = false;

  constructor(private readonly world: World) {
    this.worker.onmessage = (e: MessageEvent<Zone>) => {
      const zone = e.data;
      const k = key(zone.x, zone.y, zone.z, zone.level);
      if (!this.world.has(zone.x, zone.y, zone.z, zone.level)) this.world.put(zone);
      for (const done of this.pending.get(k) ?? []) done();
      this.pending.delete(k);
      this.busy = false;
      this.next();
    };
  }

  /** Resuelve cuando la zona está en el World. */
  load(x: number, y: number, z: number, level = 0): Promise<void> {
    x >>>= 0;
    y >>>= 0;
    z >>>= 0;
    if (this.world.has(x, y, z, level)) return Promise.resolve();
    const k = key(x, y, z, level);
    return new Promise((resolve) => {
      const waiting = this.pending.get(k);
      if (waiting) return waiting.push(resolve);
      this.pending.set(k, [resolve]);
      this.queue.push({ seed: this.world.seed, x, y, z, level });
      this.next();
    });
  }

  /**
   * Precarga lo que el jugador puede necesitar pronto: las 3×3 zonas alrededor de la celda global (gx, gy) en la
   * capa z, la zona actual en las capas vecinas (puertas y bloques que cambian) y en el nivel al que lleva el noclip.
   */
  prefetch(gx: number, gy: number, z: number, level: number, layers: number[], noclipTo: number | null): void {
    const zx = Math.floor(gx / ZONE_SIZE);
    const zy = Math.floor(gy / ZONE_SIZE);
    void this.load(zx, zy, z, level);
    for (const dz of layers) void this.load(zx, zy, z + dz, level);
    if (noclipTo !== null) void this.load(zx, zy, z, noclipTo);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) if (dx || dy) void this.load(zx + dx, zy + dy, z, level);
  }

  // Una zona por vez: la primera de la cola es la más urgente.
  private next(): void {
    if (this.busy) return;
    const req = this.queue.shift();
    if (!req) return;
    if (this.world.has(req.x, req.y, req.z, req.level)) {
      const k = key(req.x, req.y, req.z, req.level);
      for (const done of this.pending.get(k) ?? []) done();
      this.pending.delete(k);
      return this.next();
    }
    this.busy = true;
    this.worker.postMessage(req);
  }
}

const key = (x: number, y: number, z: number, level: number) => `${level}:${x >>> 0},${y >>> 0},${z >>> 0}`;
