import { describe, expect, it } from 'vitest';
import { Dir, Edge, getStart, World } from '../world';
import type { Input } from './input';
import { CELL, isPortal, Level } from './level';
import { Player } from './player';

const seed = 42;
const start = getStart(seed);
const level = new Level(new World(seed), start.gx, start.gy, start.z);
// Hacia +x: con yaw = -π/2 el frente de la cámara apunta a +x.
const forward = { forward: 1, strafe: 0, running: false, sneaking: false, takeLook: () => ({ yaw: 0, pitch: 0 }) };

// Primera celda de la zona cuyo lado E cumple `want` y cuyo lado W está abierto (para tener de dónde venir).
function find(want: (e: Edge) => boolean): { rx: number; ry: number; edge: Edge } {
  for (let ry = 1; ry < 255; ry++)
    for (let rx = 1; rx < 254; rx++) {
      const edge = level.edge(rx, ry, Dir.E);
      if (want(edge)) return { rx, ry, edge };
    }
  throw new Error('no hay');
}

function walk(rx: number, ry: number): { player: Player; crossing: ReturnType<Player['update']> } {
  const player = new Player(level, (rx + 0.5) * CELL, (ry + 0.5) * CELL);
  player.yaw = -Math.PI / 2;
  for (let i = 0; i < 60; i++) {
    const crossing = player.update(0.05, forward as unknown as Input);
    if (crossing) return { player, crossing };
  }
  return { player, crossing: null };
}

describe('Player', () => {
  it('cruza una puerta de capa caminando por el medio', () => {
    const { rx, ry, edge } = find(isPortal);
    const { player, crossing } = walk(rx, ry);
    expect(crossing).toEqual({ dz: edge === Edge.DOOR_UP ? 1 : -1 });
    expect(player.cell).toEqual({ rx: rx + 1, ry });
  });

  it('no atraviesa una pared', () => {
    const { rx, ry } = find((e) => e === Edge.WALL);
    const { player, crossing } = walk(rx, ry);
    expect(crossing).toBeNull();
    expect(player.x).toBeLessThan((rx + 1) * CELL);
  });
});
