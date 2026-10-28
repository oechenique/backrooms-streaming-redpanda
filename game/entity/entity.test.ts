import { describe, expect, it } from 'vitest';
import { Dir, Edge } from '../../world';
import { CELL, type Level } from '../level';
import { SNEAK, WALK, RUN } from '../player';
import { canLeave } from '../shifter';
import { makeDirector, NOISE_GATE, tickDirector, HUNT_MAX_S } from './director';
import { footstepNoise, heardLoudness, wallsBetween } from './hearing';

// Grilla de mentira: todo abierto salvo los bordes listados como "x,y,dir" (se cargan de los dos lados).
function fakeLevel(walls: Array<[number, number, Dir]>): Level {
  const closed = new Set<string>();
  const back = { [Dir.W]: [-1, 0, Dir.E], [Dir.E]: [1, 0, Dir.W], [Dir.N]: [0, -1, Dir.S], [Dir.S]: [0, 1, Dir.N] } as const;
  for (const [x, y, d] of walls) {
    const [dx, dy, b] = back[d];
    closed.add(`${x},${y},${d}`);
    closed.add(`${x + dx},${y + dy},${b}`);
  }
  const edge = (x: number, y: number, d: Dir) => (closed.has(`${x},${y},${d}`) ? Edge.WALL : Edge.OPEN);
  return { edge, open: (x: number, y: number, d: Dir) => edge(x, y, d) === Edge.OPEN } as unknown as Level;
}
const at = (cx: number, cy: number) => ({ x: (cx + 0.5) * CELL, z: (cy + 0.5) * CELL });

describe('oído', () => {
  it('el sigilo no se oye, caminar sí, correr fuerte', () => {
    expect(footstepNoise(0)).toBe(0);
    expect(footstepNoise(SNEAK)).toBeLessThan(NOISE_GATE);
    expect(footstepNoise(WALK)).toBeGreaterThan(NOISE_GATE);
    expect(footstepNoise(RUN)).toBeCloseTo(0.8);
  });

  it('cuenta las paredes en medio, con tope de 2', () => {
    const level = fakeLevel([
      [0, 0, Dir.E],
      [1, 0, Dir.E],
      [2, 0, Dir.E],
      [0, 0, Dir.S],
    ]);
    expect(wallsBetween(level, at(0, 0), at(0, 0))).toBe(0);
    expect(wallsBetween(level, at(0, 0), at(1, 0))).toBe(1);
    expect(wallsBetween(level, at(0, 0), at(3, 0))).toBe(2);
    expect(wallsBetween(level, at(0, 0), at(0, 1))).toBe(1);
    expect(wallsBetween(level, at(5, 5), at(9, 5))).toBe(0);
  });

  it('atenúa por distancia y por paredes', () => {
    const open = fakeLevel([]);
    const walled = fakeLevel([[0, 0, Dir.E]]);
    const near = heardLoudness(open, at(0, 0), at(1, 0), RUN);
    expect(heardLoudness(walled, at(0, 0), at(1, 0), RUN)).toBeCloseTo(near / 2);
    expect(heardLoudness(open, at(0, 0), at(20, 0), RUN)).toBe(0); // 44 m: fuera de rango
  });
});

describe('director', () => {
  const rng = { next: () => 0.5 };
  const tick = (d: ReturnType<typeof makeDirector>, seconds: number, noise: number, distM = 20) => {
    for (let t = 0; t < seconds; t += 0.1) tickDirector(d, { distM, noise, exposed: false, dtS: 0.1 }, rng);
  };

  it('en silencio no caza: acecha y vuelve a la calma', () => {
    const d = makeDirector();
    tick(d, 39, 0);
    expect(d.mood).toBe('calm');
    tick(d, 2, 0);
    expect(d.mood).toBe('stalk');
    tick(d, 46, 0);
    expect(d.mood).toBe('calm');
  });

  it('el ruido fuerte dispara la cacería, que termina en retirada', () => {
    const d = makeDirector();
    tick(d, 4, 0.7);
    expect(d.mood).toBe('hunt');
    tick(d, HUNT_MAX_S + 0.5, 0);
    expect(d.mood).toBe('retreat');
  });
});

describe('cambios del laberinto', () => {
  it('no aceptan dejar al jugador encerrado', () => {
    const p = at(20, 20);
    expect(canLeave(fakeLevel([]), p.x, p.z)).toBe(true);
    const box = fakeLevel([
      [20, 20, Dir.W],
      [20, 20, Dir.E],
      [20, 20, Dir.N],
      [20, 20, Dir.S],
    ]);
    expect(canLeave(box, p.x, p.z)).toBe(false);
  });
});
