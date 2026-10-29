import { describe, expect, it } from 'vitest';
import { fit, MAX_SCALE, toCell, toScreen, visibleCells, zoomAt } from './view';

const W = 800;
const H = 600;
// Coordenadas globales reales: del orden de 2^39, tienen que seguir exactas.
const G = 368_421_000_000;

describe('view', () => {
  it('toScreen y toCell son inversas', () => {
    const v = { cx: G + 0.5, cy: G + 10, scale: 7 };
    const [sx, sy] = toScreen(v, W, H, G + 3.25, G + 4);
    expect(toCell(v, W, H, sx, sy)).toEqual([G + 3.25, G + 4]);
  });

  it('el zoom deja quieta la celda bajo el cursor y respeta la escala máxima', () => {
    const v = { cx: G, cy: G, scale: 10 };
    const before = toCell(v, W, H, 100, 50);
    const z = zoomAt(v, W, H, 100, 50, 2);
    const after = toCell(z, W, H, 100, 50);
    expect(after[0]).toBeCloseTo(before[0], 6);
    expect(after[1]).toBeCloseTo(before[1], 6);
    expect(zoomAt(v, W, H, 0, 0, 1000).scale).toBe(MAX_SCALE);
  });

  it('fit encuadra todos los puntos', () => {
    const pts: [number, number][] = [[G, G], [G + 80, G + 30]];
    const v = fit(pts, W, H, [0, 0]);
    const r = visibleCells(v, W, H);
    expect(r.gx0).toBeLessThanOrEqual(G);
    expect(r.gx1).toBeGreaterThanOrEqual(G + 80);
    expect(r.gy0).toBeLessThanOrEqual(G);
    expect(r.gy1).toBeGreaterThanOrEqual(G + 30);
  });

  it('fit sin puntos usa el fallback', () => {
    expect(fit([], W, H, [G, G + 1])).toMatchObject({ cx: G, cy: G + 1 });
  });
});
