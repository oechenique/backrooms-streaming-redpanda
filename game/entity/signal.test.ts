import { describe, expect, it } from 'vitest';
import { Signal, threatOf } from './signal';

// PRNG fijo para que el test no dependa del azar.
function rng(seed: number) {
  return {
    next: () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    },
  };
}

function run(target: number, seconds: number) {
  const s = new Signal(rng(7));
  let bursts = 0;
  let cuts = 0;
  let jumps = 0;
  let wasCut = false;
  for (let t = 0; t < seconds; t += 1 / 60) {
    const before = s.burst;
    s.update(1 / 60, target);
    if (s.burst > before + 0.3) bursts++;
    if (s.cut && !wasCut) cuts++;
    wasCut = s.cut;
    if (s.jump) jumps++;
  }
  return { bursts, cuts, jumps, threat: s.threat };
}

describe('señal de La Interferencia', () => {
  it('la amenaza crece al acercarse y solo cuenta si está presente', () => {
    expect(threatOf('hunt', 25, true)).toBeCloseTo(0.15);
    expect(threatOf('hunt', 1, true)).toBeCloseTo(1);
    expect(threatOf('hunt', 5, true)).toBeGreaterThan(threatOf('hunt', 12, true));
    expect(threatOf('stalk', 3, true)).toBeLessThan(threatOf('hunt', 3, true));
    expect(threatOf('calm', 1, true)).toBe(0);
    expect(threatOf('hunt', 1, false)).toBe(0);
  });

  it('sin amenaza no hay fallas', () => {
    expect(run(0, 20)).toEqual({ bursts: 0, cuts: 0, jumps: 0, threat: 0 });
  });

  it('cerca falla mucho más seguido que lejos: ráfagas, cortes y saltos', () => {
    const far = run(0.2, 30);
    const close = run(1, 30);
    expect(close.threat).toBeGreaterThan(0.95);
    expect(close.bursts).toBeGreaterThan(far.bursts * 3);
    expect(close.cuts).toBeGreaterThan(far.cuts);
    expect(close.jumps).toBeGreaterThan(far.jumps);
  });
});
