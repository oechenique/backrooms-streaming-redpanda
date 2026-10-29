// El pipeline animado: los eventos salen del juego y recorren collector → Redpanda → consumer → Bronze → Silver →
// Gold → mapa. La DLQ queda como desvío, sin eventos: en las partidas reales no fue a parar ninguno. Cada etapa se
// enciende cuando le llega el primer evento. Los nombres son los únicos textos: es un diagrama, no una placa.

import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { FPS } from '../medios';

const FONDO = '#1a170c';
const LINEA = 'rgb(176 156 84 / 0.35)';
const NODO = '#b09c54';
const TEXTO = '#f1e7b8';
const TEXTO_SUAVE = '#8f855d';
const EVENTO = '#f3e6a2';
const DLQ = '#e0574a';

interface Etapa {
  id: string;
  nombre: string;
  detalle: string;
}

const ETAPAS: Etapa[] = [
  { id: 'juego', nombre: 'Juego', detalle: 'Three.js' },
  { id: 'collector', nombre: 'Collector', detalle: 'FastAPI + contrato' },
  { id: 'redpanda', nombre: 'Redpanda', detalle: 'backrooms.eventos' },
  { id: 'consumer', nombre: 'Consumer', detalle: 'Python' },
  { id: 'bronze', nombre: 'Bronze', detalle: 'Parquet crudo' },
  { id: 'silver', nombre: 'Silver', detalle: 'DuckDB' },
  { id: 'gold', nombre: 'Gold', detalle: 'JSON + Parquet' },
  { id: 'mapa', nombre: 'Mapa', detalle: 'de los perdidos' },
];

/** Segundos que tarda un evento en pasar de una etapa a la siguiente. */
const TRAMO_S = 0.45;
/** Un evento nuevo sale del juego cada tanto. */
const CADA_S = 0.22;

export const Pipeline: React.FC<{ frames: number }> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const t = frame / FPS;
  // En 16:9 las etapas van de izquierda a derecha con los nombres arriba y abajo; en 9:16 (el Reel Insta), de arriba
  // hacia abajo con los nombres a la derecha, en la parte de arriba: abajo van los subtítulos.
  const vertical = height > width;
  const [inicio, fin] = vertical ? [height * 0.07, height * 0.56] : [width * 0.06, width * 0.94];
  const paso = (fin - inicio) / (ETAPAS.length - 1);
  const linea = vertical ? width * 0.2 : height * 0.45;
  const punto = (pos: number) => (vertical ? { x: linea, y: inicio + pos * paso } : { x: inicio + pos * paso, y: linea });
  const r = Math.min(46, paso * 0.22);
  const letra = vertical ? { nombre: 42, detalle: 28, dlq: 38 } : { nombre: 30, detalle: 20, dlq: 26 };
  // La DLQ cuelga del collector: abajo en 16:9; en 9:16, a la derecha de su nombre.
  const collector = punto(1);
  const dlq = vertical ? { x: width * 0.84, y: collector.y } : { x: collector.x, y: linea + height * 0.25 };
  const desvio = vertical ? { x: width * 0.66, y: collector.y } : collector;

  // Eventos en vuelo: posición continua sobre la línea (en etapas) según cuánto hace que salieron.
  const eventos: React.ReactNode[] = [];
  const n = Math.floor(t / CADA_S);
  for (let k = Math.max(0, n - 60); k <= n; k++) {
    const edad = t - k * CADA_S;
    if (edad < 0) continue;
    const pos = edad / TRAMO_S;
    if (pos > ETAPAS.length - 1) continue;
    const e = punto(pos);
    eventos.push(
      <circle key={k} cx={e.x} cy={e.y} r={vertical ? 9 : 6} fill={EVENTO} style={{ filter: `drop-shadow(0 0 8px ${EVENTO})` }} />,
    );
  }

  const fade = interpolate(frame, [0, 10, frames - 10, frames], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const a = punto(0);
  const b = punto(ETAPAS.length - 1);
  return (
    <AbsoluteFill style={{ backgroundColor: FONDO, opacity: fade }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={LINEA} strokeWidth={3} />
        <line x1={desvio.x} y1={desvio.y} x2={dlq.x} y2={dlq.y} stroke={LINEA} strokeWidth={3} strokeDasharray="8 8" />
        {eventos}
        {ETAPAS.map((e, i) => {
          // La etapa se enciende cuando llega el primer evento.
          const llega = i * TRAMO_S;
          const on = interpolate(t, [llega, llega + 0.3], [0.25, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const c = punto(i);
          const nombre = vertical ? { x: c.x + r + 32, y: c.y - 4, anchor: 'start' as const } : { x: c.x, y: c.y - r - 26, anchor: 'middle' as const };
          const detalle = vertical ? { x: nombre.x, y: c.y + 32, anchor: 'start' as const } : { x: c.x, y: c.y + r + 40, anchor: 'middle' as const };
          return (
            <g key={e.id} opacity={on}>
              <circle cx={c.x} cy={c.y} r={r} fill={FONDO} stroke={NODO} strokeWidth={3} />
              <text x={nombre.x} y={nombre.y} textAnchor={nombre.anchor} fill={TEXTO} fontSize={letra.nombre} fontFamily="Consolas, monospace">
                {e.nombre}
              </text>
              <text x={detalle.x} y={detalle.y} textAnchor={detalle.anchor} fill={TEXTO_SUAVE} fontSize={letra.detalle} fontFamily="Consolas, monospace">
                {e.detalle}
              </text>
            </g>
          );
        })}
        <g opacity={interpolate(t, [1.5 * TRAMO_S, 1.5 * TRAMO_S + 0.3], [0.25, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}>
          <rect x={dlq.x - r} y={dlq.y - r * 0.6} width={2 * r} height={1.2 * r} rx={8} fill={FONDO} stroke={DLQ} strokeWidth={3} />
          {vertical ? (
            <>
              <text x={dlq.x} y={dlq.y + r + 36} textAnchor="middle" fill={TEXTO} fontSize={letra.dlq} fontFamily="Consolas, monospace">
                DLQ
              </text>
              <text x={dlq.x} y={dlq.y + r + 70} textAnchor="middle" fill={TEXTO_SUAVE} fontSize={letra.detalle * 0.8} fontFamily="Consolas, monospace">
                no cumple el contrato
              </text>
            </>
          ) : (
            <>
              <text x={dlq.x + r + 18} y={dlq.y + 10} fill={TEXTO} fontSize={letra.dlq} fontFamily="Consolas, monospace">
                DLQ
              </text>
              <text x={dlq.x + r + 18} y={dlq.y + 40} fill={TEXTO_SUAVE} fontSize={letra.detalle} fontFamily="Consolas, monospace">
                no cumple el contrato
              </text>
            </>
          )}
        </g>
      </svg>
    </AbsoluteFill>
  );
};
