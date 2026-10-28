import { describe, expect, it } from 'vitest';
import { Dir, Edge, getStart, World } from '../world';
import type { Input } from './input';
import { CELL, isPortal, Level } from './level';
import { PILLAR_HALF, Player } from './player';

const seed = 42;
const start = getStart(seed);
const world = new World(seed, 32);
const level0 = new Level(world, start.gx, start.gy, start.z);
const level1 = new Level(world, start.gx, start.gy, start.z, 1);
// Hacia +x: con yaw = -π/2 el frente de la cámara apunta a +x.
const forward = { forward: 1, strafe: 0, running: false, sneaking: false, takeLook: () => ({ yaw: 0, pitch: 0 }) };
const still = { ...forward, forward: 0 };

// Primera celda de la zona cuyo lado E cumple `want`.
function find(level: Level, want: (e: Edge, rx: number, ry: number) => boolean): { rx: number; ry: number; edge: Edge } {
  for (let ry = 1; ry < 255; ry++)
    for (let rx = 1; rx < 254; rx++) {
      const edge = level.edge(rx, ry, Dir.E);
      if (want(edge, rx, ry)) return { rx, ry, edge };
    }
  throw new Error('no hay');
}

function walk(level: Level, rx: number, ry: number): { player: Player; crossing: ReturnType<Player['update']> } {
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
    const { rx, ry, edge } = find(level0, isPortal);
    const { player, crossing } = walk(level0, rx, ry);
    expect(crossing).toEqual({ kind: 'door', dz: edge === Edge.DOOR_UP ? 1 : -1 });
    expect(player.cell).toEqual({ rx: rx + 1, ry });
  });

  it('no atraviesa una pared común', () => {
    const { rx, ry } = find(level0, (e, x, y) => e === Edge.WALL && !level0.noclip(x, y, Dir.E));
    const { player, crossing } = walk(level0, rx, ry);
    expect(crossing).toBeNull();
    expect(player.x).toBeLessThan((rx + 1) * CELL);
  });

  it('se mete en una pared de noclip', () => {
    const { rx, ry } = find(level0, (e, x, y) => e === Edge.WALL && level0.noclip(x, y, Dir.E));
    const { player, crossing } = walk(level0, rx, ry);
    expect(crossing).toEqual({ kind: 'noclip' });
    expect(player.cell).toEqual({ rx: rx + 1, ry });
  });

  it('choca con los pilares del Nivel 1', () => {
    let corner: { rx: number; ry: number } | null = null;
    for (let ry = 1; ry < 255 && !corner; ry++)
      for (let rx = 1; rx < 255 && !corner; rx++) if (level1.pillar(rx, ry)) corner = { rx, ry };
    expect(corner).not.toBeNull();
    const { rx, ry } = corner!;
    // Parado sobre la esquina del pilar: la colisión lo saca fuera de la caja.
    const player = new Player(level1, rx * CELL + 0.01, ry * CELL + 0.02);
    player.update(0.05, still as unknown as Input);
    const dx = Math.abs(player.x - rx * CELL);
    const dz = Math.abs(player.z - ry * CELL);
    expect(Math.max(dx, dz)).toBeGreaterThan(PILLAR_HALF);
  });
});
