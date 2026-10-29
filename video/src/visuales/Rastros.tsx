// Los rastros del Gold (data/gold/mapa/<seed>-v<world_v>.json, servido en public/gold) sobre el laberinto: el
// heatmap aparece de a poco desde el punto de partida hacia afuera y al final las marcas (captura, escape, noclip).

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Capa, Mapa } from '../../../dashboard/gold';
import { drawMap } from '../../../dashboard/render';
import { fit } from '../../../dashboard/view';
import { World } from '../../../world';
import { VISUALES } from '../medios';

const world = new World(VISUALES.seed, 64);

export const Rastros: React.FC<{ frames: number }> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ref = useRef<HTMLCanvasElement>(null);
  const [capa, setCapa] = useState<Capa | null>(null);
  const [handle] = useState(() => delayRender('Gold del mapa'));

  useEffect(() => {
    fetch(staticFile(`gold/mapa/${VISUALES.seed}-v${VISUALES.world_v}.json`))
      .then((r) => (r.ok ? (r.json() as Promise<Mapa>) : null))
      // La capa del Nivel 0 con más rastro (la de la partida en la que más se caminó).
      .then((m) => setCapa(m?.capas.filter((c) => c.level === 0).sort((a, b) => b.rastros.length - a.rastros.length)[0] ?? null))
      .catch(() => setCapa(null))
      .finally(() => continueRender(handle));
  }, [handle]);

  // Rastros ordenados del centro hacia afuera, para revelarlos como una mancha que crece.
  const orden = useMemo(() => {
    if (!capa) return null;
    const n = capa.rastros.length;
    const mx = capa.rastros.reduce((s, r) => s + r[0], 0) / n;
    const my = capa.rastros.reduce((s, r) => s + r[1], 0) / n;
    return [...capa.rastros].sort((a, b) => Math.hypot(a[0] - mx, a[1] - my) - Math.hypot(b[0] - mx, b[1] - my));
  }, [capa]);

  useLayoutEffect(() => {
    if (!capa || !orden) return;
    const ctx = ref.current!.getContext('2d')!;
    const base = fit(orden.map((r) => [r[0], r[1]]), width, height, [orden[0][0], orden[0][1]], 120);
    // Acercamiento lento y la mancha que crece en los primeros dos tercios.
    const scale = base.scale * interpolate(frame, [0, frames], [0.85, 1.1]);
    const visibles = Math.ceil(orden.length * interpolate(frame, [0, frames * 0.65], [0.02, 1], { extrapolateRight: 'clamp' }));
    const marcas = frame > frames * 0.7 ? capa.marcas : [];
    drawMap(ctx, { ...base, scale }, { world, level: capa.level, z: capa.z, capa: { ...capa, rastros: orden.slice(0, visibles), marcas } });
  }, [capa, orden, frame, frames, width, height]);

  return (
    <AbsoluteFill style={{ backgroundColor: '#1a170c' }}>
      <canvas ref={ref} width={width} height={height} style={{ width: '100%', height: '100%' }} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 45%, rgb(0 0 0 / 0.65) 100%)' }} />
    </AbsoluteFill>
  );
};
