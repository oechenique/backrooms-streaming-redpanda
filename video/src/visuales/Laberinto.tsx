// El laberinto desde arriba, reconstruido con world/ y dibujado con el mismo código que el mapa de los perdidos
// (dashboard/render.ts). Dos variantes:
// - Laberinto: arranca encima del punto de partida de la seed y se aleja hasta que no se ve el final.
// - Semillas: el mismo lugar con otras seeds, una tras otra (cada seed es otro mundo, siempre el mismo).

import { useLayoutEffect, useMemo, useRef } from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { drawMap } from '../../../dashboard/render';
import { getStart, World } from '../../../world';
import { FPS, VISUALES } from '../medios';

const worlds = new Map<number, World>();
const world = (seed: number) => {
  let w = worlds.get(seed);
  if (!w) worlds.set(seed, (w = new World(seed, 64)));
  return w;
};

const Mapa: React.FC<{ seed: number; cx: number; cy: number; z: number; scale: number }> = ({ seed, cx, cy, z, scale }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const { width, height } = useVideoConfig();
  useLayoutEffect(() => {
    const ctx = ref.current!.getContext('2d')!;
    drawMap(ctx, { cx, cy, scale }, { world: world(seed), level: 0, z, capa: null });
  }, [seed, cx, cy, z, scale]);
  return <canvas ref={ref} width={width} height={height} style={{ width: '100%', height: '100%' }} />;
};

/** Viñeta oscura, como el resto del video. */
const Vineta = () => (
  <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgb(0 0 0 / 0.7) 100%)' }} />
);

export const Laberinto: React.FC<{ frames: number }> = ({ frames }) => {
  const frame = useCurrentFrame();
  const start = useMemo(() => getStart(VISUALES.seed), []);
  // De 28 px por celda (se ven las puertas) a 2,4 (cientos de celdas por lado), más rápido al final.
  const scale = interpolate(frame, [0, Math.max(1, frames - FPS / 2)], [28, 2.4], {
    easing: Easing.in(Easing.cubic),
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill>
      <Mapa seed={VISUALES.seed} cx={start.gx + 0.5} cy={start.gy + 0.5} z={start.z} scale={scale} />
      <Vineta />
    </AbsoluteFill>
  );
};

export const Semillas: React.FC<{ frames: number }> = ({ frames }) => {
  const frame = useCurrentFrame();
  const seeds: number[] = VISUALES.semillas;
  const start = useMemo(() => getStart(VISUALES.seed), []);
  // Un tramo por seed; la cámara avanza despacio en diagonal sobre las mismas coordenadas.
  const tramo = Math.max(1, Math.floor(frames / seeds.length));
  const seed = seeds[Math.min(seeds.length - 1, Math.floor(frame / tramo))];
  const avance = frame / FPS;
  return (
    <AbsoluteFill>
      <Mapa seed={seed} cx={start.gx + avance * 1.2} cy={start.gy + avance * 0.5} z={start.z} scale={16} />
      <Vineta />
    </AbsoluteFill>
  );
};
