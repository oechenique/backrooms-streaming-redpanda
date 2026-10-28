// Genera zonas fuera del hilo principal (≈ 20 ms cada una en PC, más en celu).

import { generateZone } from '../world';

export interface ZoneRequest {
  seed: number;
  x: number;
  y: number;
  z: number;
  level: number;
}

self.onmessage = (e: MessageEvent<ZoneRequest>) => {
  const { seed, x, y, z, level } = e.data;
  const zone = generateZone(seed, x, y, z, level);
  (self as unknown as Worker).postMessage(zone, [zone.edges.buffer]);
};
