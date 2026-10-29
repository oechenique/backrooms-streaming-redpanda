// El reel para Instagram (9:16): bloques cortos con cortes rápidos, cada uno con su narración, y subtítulos grandes
// palabra por palabra (mucha gente lo mira sin sonido). Arranca con el gancho del juego, sin voz y con el sonido alto,
// y cierra con el mapa y el link del juego. Los cortes y los textos están en escenas.json (reel_insta).

import { AbsoluteFill, Easing, Html5Audio, Html5Video, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { audioPath, clipPath, existe, FPS, INSTA, VOLUMEN_JUEGO, type Bloque, type ClipRef, type Palabra, type Visual } from './medios';
import { Placa } from './Narrado';
import { Laberinto, Semillas } from './visuales/Laberinto';
import { Pipeline } from './visuales/Pipeline';
import { Rastros } from './visuales/Rastros';

const VISUALES: Record<Visual, React.FC<{ frames: number }>> = { laberinto: Laberinto, semillas: Semillas, pipeline: Pipeline, rastros: Rastros };

/** Ancho sobre alto de las grabaciones (1920 × ~868). */
const ASPECTO_CLIPS = 1920 / 868;
const FONDO = '#1a170c';
const AMARILLO = '#f3e6a2';

export interface ReelInstaProps extends Record<string, unknown> {
  bloques: Bloque[];
  frames: number[];
  palabras: Palabra[][];
}

export const ReelInsta: React.FC<ReelInstaProps> = ({ bloques, frames, palabras }) => {
  const inicios = frames.map((_, i) => frames.slice(0, i).reduce((a, b) => a + b, 0));
  // Un bloque que `sigue` no tiene cortes: su voz va sobre el último corte del anterior, que se estira hasta cubrirlo.
  const extra = bloques.map((_, i) => {
    let n = 0;
    for (let k = i + 1; bloques[k]?.sigue; k++) n += frames[k];
    return bloques[i].sigue ? 0 : n;
  });
  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {bloques.map((b, i) => (
        <Sequence key={b.id} from={inicios[i]} durationInFrames={frames[i] + extra[i]} name={b.id}>
          <BloqueInsta bloque={b} frames={frames[i]} extra={extra[i]} palabras={palabras[i]} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

const BloqueInsta: React.FC<{ bloque: Bloque; frames: number; extra: number; palabras: Palabra[] }> = ({ bloque, frames, extra, palabras }) => {
  // Los cortes se reparten el bloque según su peso.
  const pesos = bloque.cortes.map((c) => c.s ?? 1);
  const total = pesos.reduce((a, b) => a + b, 0);
  const inicios = pesos.map((_, i) => Math.round((pesos.slice(0, i).reduce((a, b) => a + b, 0) / total) * frames));
  // El link entra cuando se fue el último subtítulo.
  const finVoz = palabras.length ? Math.round((palabras[palabras.length - 1].hasta + 0.4) * FPS) : frames;
  return (
    <AbsoluteFill>
      {bloque.cortes.map((c, i) => {
        const dur = (inicios[i + 1] ?? frames + extra) - inicios[i];
        const V = c.visual && VISUALES[c.visual];
        return (
          <Sequence key={i} from={inicios[i]} durationInFrames={dur} name={c.clip ?? c.visual}>
            {V ? <V frames={dur} /> : <Corte corte={c} frames={dur} volumen={bloque.volumen ?? VOLUMEN_JUEGO} />}
            <Titileo />
          </Sequence>
        );
      })}
      {bloque.texto && existe(audioPath(bloque.id)) && <Html5Audio src={staticFile(audioPath(bloque.id))} />}
      {/* Los subtítulos no pasan al bloque siguiente, aunque el último corte siga. */}
      <Sequence durationInFrames={frames}>
        <Subtitulos palabras={palabras} />
      </Sequence>
      {bloque.link && (
        <Sequence from={finVoz}>
          <Link />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};

/** Un clip con su encuadre vertical y un acercamiento lento (o un golpe de zoom al arrancar, en el gancho). */
const Corte: React.FC<{ corte: ClipRef; frames: number; volumen: number }> = ({ corte, frames, volumen }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const path = clipPath(corte.clip!);
  if (!existe(path)) return <Placa texto={`falta ${path}`} />;
  const [ex, ey] = corte.encuadre ?? [50, 50];
  const deriva = interpolate(frame, [0, frames], [1, 1.06]);
  const video = (style: React.CSSProperties) => (
    <Html5Video
      src={staticFile(path)}
      loop
      volume={volumen}
      playbackRate={corte.velocidad ?? 1}
      trimBefore={Math.round((corte.desde ?? 0) * FPS)}
      style={{ width: '100%', height: '100%', objectFit: 'cover', ...style }}
    />
  );

  if (corte.contener) {
    // El clip a lo ancho, agrandado: el punto del encuadre queda en el centro sin dejar bordes a los costados.
    const w = width * (corte.zoom ?? 1) * deriva;
    const h = w / ASPECTO_CLIPS;
    const left = Math.min(0, Math.max(width - w, width / 2 - (ex / 100) * w));
    const top = height / 2 - (ey / 100) * h;
    return (
      <AbsoluteFill style={{ backgroundColor: FONDO }}>
        <div style={{ position: 'absolute', left, top, width: w, height: h }}>{video({})}</div>
        <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgb(0 0 0 / 0.6) 100%)' }} />
      </AbsoluteFill>
    );
  }
  const golpe = interpolate(frame, [0, 0.25 * FPS], [1, corte.zoom ?? 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {video({ objectPosition: `${ex}% ${ey}%`, transform: `scale(${golpe * deriva})`, transformOrigin: `${ex}% ${ey}%` })}
    </AbsoluteFill>
  );
};

/** Cada corte entra con un titileo, como las luces del Nivel 0. */
const Titileo: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = [0.9, 0, 0.55, 0][frame] ?? 0;
  return <AbsoluteFill style={{ backgroundColor: 'black', opacity }} />;
};

const FIN_FRASE = /[.,:;?!]$/;

/** Hasta tres palabras por vez (cuatro si así termina la frase y no queda una sola colgando); corta antes si la frase termina. */
function grupos(palabras: Palabra[]): Palabra[][] {
  const out: Palabra[][] = [];
  let actual: Palabra[] = [];
  for (const [i, p] of palabras.entries()) {
    actual.push(p);
    const cuelga = actual.length === 3 && FIN_FRASE.test(palabras[i + 1]?.texto ?? '');
    if ((actual.length >= 3 && !cuelga) || FIN_FRASE.test(p.texto)) {
      out.push(actual);
      actual = [];
    }
  }
  if (actual.length) out.push(actual);
  return out;
}

const Subtitulos: React.FC<{ palabras: Palabra[] }> = ({ palabras }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const t = frame / FPS;
  const gs = grupos(palabras);
  const i = gs.findIndex((g, k) => t >= g[0].desde && t < (gs[k + 1]?.[0].desde ?? g[g.length - 1].hasta + 0.4));
  if (i < 0) return null;
  const g = gs[i];
  const entra = interpolate(t - g[0].desde, [0, 0.12], [0.8, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.back(2)) });
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: 'center', paddingTop: height * 0.6, pointerEvents: 'none' }}>
      <div
        style={{
          transform: `scale(${entra})`,
          maxWidth: width * 0.88,
          textAlign: 'center',
          fontFamily: '"Arial Black", Impact, sans-serif',
          fontWeight: 900,
          fontSize: 92,
          lineHeight: 1.1,
          textTransform: 'uppercase',
          WebkitTextStroke: '14px black',
          paintOrder: 'stroke fill',
          textShadow: '0 6px 18px rgb(0 0 0 / 0.7)',
        }}
      >
        {g.map((p, k) => (
          <span key={k} style={{ color: t >= p.desde ? (t < p.hasta + 0.05 ? AMARILLO : 'white') : 'rgb(255 255 255 / 0.55)' }}>
            {p.texto.replace(/[.,:;]+$/, '')}
            {k < g.length - 1 ? ' ' : ''}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/** El cierre: el link del juego. */
const Link: React.FC = () => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const entra = interpolate(frame, [0, 0.3 * FPS], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', backgroundColor: `rgb(0 0 0 / ${0.55 * entra})` }}>
      <div
        style={{
          opacity: entra,
          transform: `translateY(${(1 - entra) * 40}px)`,
          width: width * 0.88,
          padding: '48px 32px',
          border: `4px solid ${AMARILLO}`,
          borderRadius: 24,
          backgroundColor: 'rgb(26 23 12 / 0.92)',
          textAlign: 'center',
          color: AMARILLO,
          fontFamily: 'Consolas, monospace',
        }}
      >
        <div style={{ fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 64, color: 'white', marginBottom: 24 }}>JUEGA GRATIS</div>
        <div style={{ fontSize: 50, fontWeight: 700 }}>{INSTA.link}</div>
      </div>
    </AbsoluteFill>
  );
};
