import { describe, expect, it } from 'vitest';
import { Dir, Edge, getStart, World } from '../world';
import { safeLanding, walkable } from './landing';
import { CELL, Level } from './level';
import { solidAt } from './player';

const seed = 42;
const start = getStart(seed);
const level1 = new Level(new World(seed, 32), start.gx, start.gy, start.z, 1);

// Primera celda del Nivel 1 que cumple `want`.
function find(want: (rx: number, ry: number) => boolean): { rx: number; ry: number } {
  for (let ry = 2; ry < 254; ry++) for (let rx = 2; rx < 254; rx++) if (want(rx, ry)) return { rx, ry };
  throw new Error('no hay');
}

describe('llegada después de un noclip', () => {
  it('si el punto es caminable, no lo mueve', () => {
    const { rx, ry } = find((x, y) => walkable(level1, (x + 0.5) * CELL, (y + 0.5) * CELL));
    const p = { x: (rx + 0.5) * CELL + 0.1, z: (ry + 0.5) * CELL - 0.1 };
    expect(safeLanding(level1, p.x, p.z)).toEqual(p);
  });

  it('si cae dentro de una pared, va a la celda caminable más cercana', () => {
    const { rx, ry } = find((x, y) => level1.edge(x, y, Dir.E) === Edge.WALL);
    const p = { x: (rx + 1) * CELL, z: (ry + 0.5) * CELL }; // justo sobre la pared
    expect(solidAt(level1, p.x, p.z)).toBe(true);
    const out = safeLanding(level1, p.x, p.z);
    expect(walkable(level1, out.x, out.z)).toBe(true);
    expect(Math.hypot(out.x - p.x, out.z - p.z)).toBeLessThan(2 * CELL); // una de las dos celdas pegadas a la pared
  });

  it('si cae dentro de un pilar, va a la celda caminable más cercana', () => {
    const { rx, ry } = find((x, y) => level1.pillar(x, y));
    const p = { x: rx * CELL, z: ry * CELL }; // el centro del pilar
    expect(solidAt(level1, p.x, p.z)).toBe(true);
    const out = safeLanding(level1, p.x, p.z);
    expect(walkable(level1, out.x, out.z)).toBe(true);
    expect(Math.hypot(out.x - p.x, out.z - p.z)).toBeLessThan(CELL); // una de las cuatro celdas de la esquina
  });

  it('si cae en una celda encerrada, sale a una vecina caminable', () => {
    // Nivel de mentira: todo abierto salvo una celda con las cuatro paredes.
    const box = new Set(['10,10,0', '10,10,1', '10,10,2', '10,10,3', '9,10,1', '11,10,0', '10,9,3', '10,11,2']);
    const edge = (x: number, y: number, d: Dir) => (box.has(`${x},${y},${d}`) ? Edge.WALL : Edge.OPEN);
    const fake = {
      edge,
      open: (x: number, y: number, d: Dir) => edge(x, y, d) === Edge.OPEN,
      noclip: () => false,
      pillar: () => false,
    } as unknown as Level;
    const p = { x: 10.5 * CELL, z: 10.5 * CELL };
    expect(walkable(fake, p.x, p.z)).toBe(false);
    const out = safeLanding(fake, p.x, p.z);
    expect(walkable(fake, out.x, out.z)).toBe(true);
    expect(Math.hypot(out.x - p.x, out.z - p.z)).toBeCloseTo(CELL); // una celda al costado
  });
});
