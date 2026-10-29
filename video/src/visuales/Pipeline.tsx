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
  const margen = width * 0.06;
  const paso = (width - 2 * margen) / (ETAPAS.length - 1);
  const y = height * 0.45;
  const x = (i: number) => margen + i * paso;
  const r = Math.min(46, paso * 0.22);
  const dlq = { x: x(1), y: y + height * 0.25 };

  // Eventos en vuelo: posición continua sobre la línea (en etapas) según cuánto hace que salieron.
  const eventos: React.ReactNode[] = [];
  const n = Math.floor(t / CADA_S);
  for (let k = Math.max(0, n - 60); k <= n; k++) {
    const edad = t - k * CADA_S;
    if (edad < 0) continue;
    const pos = edad / TRAMO_S;
    if (pos > ETAPAS.length - 1) continue;
    const i = Math.floor(pos);
    const ex = x(i) + paso * (pos - i);
    eventos.push(
      <circle key={k} cx={ex} cy={y} r={6} fill={EVENTO} style={{ filter: `drop-shadow(0 0 8px ${EVENTO})` }} />,
    );
  }

  const fade = interpolate(frame, [0, 10, frames - 10, frames], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ backgroundColor: FONDO, opacity: fade }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <line x1={x(0)} y1={y} x2={x(ETAPAS.length - 1)} y2={y} stroke={LINEA} strokeWidth={3} />
        <line x1={x(1)} y1={y} x2={dlq.x} y2={dlq.y} stroke={LINEA} strokeWidth={3} strokeDasharray="8 8" />
        {eventos}
        {ETAPAS.map((e, i) => {
          // La etapa se enciende cuando llega el primer evento.
          const llega = i * TRAMO_S;
          const on = interpolate(t, [llega, llega + 0.3], [0.25, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return (
            <g key={e.id} opacity={on}>
              <circle cx={x(i)} cy={y} r={r} fill={FONDO} stroke={NODO} strokeWidth={3} />
              <text x={x(i)} y={y - r - 26} textAnchor="middle" fill={TEXTO} fontSize={30} fontFamily="Consolas, monospace">
                {e.nombre}
              </text>
              <text x={x(i)} y={y + r + 40} textAnchor="middle" fill={TEXTO_SUAVE} fontSize={20} fontFamily="Consolas, monospace">
                {e.detalle}
              </text>
            </g>
          );
        })}
        <g opacity={interpolate(t, [1.5 * TRAMO_S, 1.5 * TRAMO_S + 0.3], [0.25, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}>
          <rect x={dlq.x - r} y={dlq.y - r * 0.6} width={2 * r} height={1.2 * r} rx={8} fill={FONDO} stroke={DLQ} strokeWidth={3} />
          <text x={dlq.x + r + 18} y={dlq.y + 10} fill={TEXTO} fontSize={26} fontFamily="Consolas, monospace">
            DLQ
          </text>
          <text x={dlq.x + r + 18} y={dlq.y + 40} fill={TEXTO_SUAVE} fontSize={20} fontFamily="Consolas, monospace">
            no cumple el contrato
          </text>
        </g>
      </svg>
    </AbsoluteFill>
  );
};
