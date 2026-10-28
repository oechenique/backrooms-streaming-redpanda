// Genera zonas fuera del hilo principal (≈ 20 ms cada una en PC, más en celu).

import { generateZone } from '../world';

export interface ZoneRequest {
  seed: number;
  x: number;
  y: number;
  z: number;
}

self.onmessage = (e: MessageEvent<ZoneRequest>) => {
  const { seed, x, y, z } = e.data;
  const zone = generateZone(seed, x, y, z);
  (self as unknown as Worker).postMessage(zone, [zone.edges.buffer]);
};
