/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { Dir, Edge, generateZone, getStart, World, WORLD_V, ZONE_SIZE, type Zone } from './index';
import { Lcg } from './lcg';

const N = ZONE_SIZE;
const at = (zone: Zone, cx: number, cy: number, d: Dir) => zone.edges[(cy * N + cx) * 4 + d];
const isPortal = (t: number) => t === Edge.DOOR_UP || t === Edge.DOOR_DOWN;

// FNV-1a de 32 bits sobre los bordes: huella estable de una zona.
function fingerprint(zone: Zone): string {
  let h = 0x811c9dc5;
  for (const b of zone.edges) h = Math.imul(h ^ b, 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

describe('Lcg', () => {
  it('da lo mismo que el LCG de java.util.Random calculado con BigInt', () => {
    let s = 0x123456789abcn;
    const rng = new Lcg(s);
    for (let i = 0; i < 100_000; i++) {
      s = (0x5deece66dn * s + 0xbn) & 0xffffffffffffn;
      const max = (i % 2048) + 1;
      expect(rng.rand(max)).toBe(Number((s * BigInt(max)) >> 48n));
    }
  });
});

describe('generateZone', () => {
  const seed = 20261028;
  const zone = generateZone(seed, 1000, 2000, 7);

  it('es determinístico', () => {
    expect(generateZone(seed, 1000, 2000, 7).edges).toEqual(zone.edges);
  });

  it('cambia con la seed', () => {
    expect(fingerprint(generateZone(seed + 1, 1000, 2000, 7))).not.toBe(fingerprint(zone));
  });

  it('las zonas vecinas abren los mismos huecos en el borde que comparten', () => {
    const cases: Array<[number, number, number]> = [
      [1000, 2000, 7],
      [0xffffffff, 5, 3], // la vecina del este es la zona 0
      [12, 0xffffffff, 9], // la vecina del sur es la zona 0
    ];
    for (const [x, y, z] of cases) {
      const here = generateZone(seed, x, y, z);
      const east = generateZone(seed, x + 1, y, z);
      const south = generateZone(seed, x, y + 1, z);
      for (let i = 0; i < N; i++) {
        expect(at(here, N - 1, i, Dir.E)).toBe(at(east, 0, i, Dir.W));
        expect(at(here, i, N - 1, Dir.S)).toBe(at(south, i, 0, Dir.N));
      }
    }
  });

  it('cada borde interior es igual visto desde las dos celdas (salvo el destino de las puertas)', () => {
    for (let cy = 0; cy < N; cy++)
      for (let cx = 0; cx < N; cx++) {
        if (cx + 1 < N) {
          const a = at(zone, cx, cy, Dir.E);
          const b = at(zone, cx + 1, cy, Dir.W);
          if (isPortal(a) || isPortal(b)) expect(isPortal(a) && isPortal(b)).toBe(true);
          else expect(a).toBe(b);
        }
        if (cy + 1 < N) {
          const a = at(zone, cx, cy, Dir.S);
          const b = at(zone, cx, cy + 1, Dir.N);
          if (isPortal(a) || isPortal(b)) expect(isPortal(a) && isPortal(b)).toBe(true);
          else expect(a).toBe(b);
        }
      }
  });

  it('se puede caminar por casi toda la zona sin cruzar puertas', () => {
    for (const [x, y, z] of [
      [1000, 2000, 7],
      [3, 4, 5],
      [77, 1, 0x40000000],
    ]) {
      const zone = generateZone(seed, x, y, z);
      const seen = new Uint8Array(N * N);
      const stack = [0];
      seen[0] = 1;
      let count = 1;
      while (stack.length) {
        const i = stack.pop()!;
        const cx = i % N;
        const cy = (i - cx) / N;
        for (const [dx, dy, d] of [
          [-1, 0, Dir.W],
          [1, 0, Dir.E],
          [0, -1, Dir.N],
          [0, 1, Dir.S],
        ] as const) {
          const nx = cx + dx;
          const ny = cy + dy;
          const t = at(zone, cx, cy, d);
          if (nx < 0 || ny < 0 || nx >= N || ny >= N || seen[ny * N + nx]) continue;
          if (t !== Edge.OPEN && t !== Edge.DOOR) continue;
          seen[ny * N + nx] = 1;
          count++;
          stack.push(ny * N + nx);
        }
      }
      expect(count / (N * N)).toBeGreaterThan(0.99);
    }
  });

  it('la capa z = 0 es un salón sin paredes', () => {
    const hall = generateZone(seed, 10, 10, 0);
    expect(hall.edges.includes(Edge.WALL)).toBe(false);
  });

  it('las puertas son las mismas en todas las capas', () => {
    const a = generateZone(seed, 10, 10, 1);
    const b = generateZone(seed, 10, 10, 2);
    for (let i = 0; i < a.edges.length; i++) if (isPortal(a.edges[i])) expect(b.edges[i]).toBe(a.edges[i]);
  });
});

describe('World', () => {
  it('acepta zonas generadas afuera y no las vuelve a generar', () => {
    const world = new World(9, 2);
    const zone = generateZone(9, 1, 2, 3);
    expect(world.has(1, 2, 3)).toBe(false);
    world.put(zone);
    expect(world.has(1, 2, 3)).toBe(true);
    expect(world.zone(1, 2, 3)).toBe(zone);
    expect(() => world.put(generateZone(8, 1, 2, 3))).toThrow();
  });

  it('descarta la zona más vieja al llenarse', () => {
    const world = new World(9, 2);
    world.zone(1, 1, 1);
    world.zone(2, 1, 1);
    world.zone(1, 1, 1); // la 1 pasa a ser la más reciente
    world.zone(3, 1, 1);
    expect([world.has(1, 1, 1), world.has(2, 1, 1), world.has(3, 1, 1)]).toEqual([true, false, true]);
  });

  it('lee bordes con coordenadas globales, también al dar la vuelta', () => {
    const world = new World(1, 2);
    const zone = generateZone(1, 0xffffffff, 0, 5);
    expect(world.edge(-1, 3, 5, Dir.E)).toBe(at(zone, N - 1, 3, Dir.E));
    expect(world.edge(0xffffffff * N + 17, 3, 5, Dir.S)).toBe(at(zone, 17, 3, Dir.S));
  });
});

describe('golden (world_v 1)', () => {
  it('mantiene una zona que llega al tope de intentos de oficinas', () => {
    // Seed 1, 14 zonas al este del arranque. En el original esta zona no termina de generarse.
    const zone = generateZone(1, 1110350398, 2386010651, 1341430631);
    expect(zone.officesCapped).toBe(true);
    expect(fingerprint(zone)).toMatchInlineSnapshot(`"e0e321db"`);
  });

  // Si este test falla, el generador cambió: o se revierte, o se sube WORLD_V y se actualizan los valores.
  it('mantiene el mundo de las seeds fijas', () => {
    expect(WORLD_V).toBe(1);
    const got = [1, 42, 20261028].map((seed) => {
      const s = getStart(seed);
      return { ...s, zone: fingerprint(generateZone(seed, Math.floor(s.gx / N), Math.floor(s.gy / N), s.z)) };
    });
    expect(got).toMatchInlineSnapshot(`
      [
        {
          "gx": 284249698557,
          "gy": 610818726805,
          "z": 1341430631,
          "zone": "a30cc0cc",
        },
        {
          "gx": 429638660491,
          "gy": 282355261234,
          "z": 1119679029,
          "zone": "51be04d7",
        },
        {
          "gx": 789689212272,
          "gy": 395882298733,
          "z": 2868038737,
          "zone": "0d7e09ef",
        },
      ]
    `);
  });
});

describe('pureza', () => {
  const sources = import.meta.glob(['./*.ts', '!./*.test.ts'], { query: '?raw', import: 'default', eager: true });

  it('world/ no usa azar, reloj, DOM ni Three', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(0);
    for (const [file, src] of Object.entries(sources)) {
      expect(src, file).not.toMatch(/Math\.random|Date\.now|new Date|performance\.|window\.|document\.|from 'three'/);
    }
  });
});
