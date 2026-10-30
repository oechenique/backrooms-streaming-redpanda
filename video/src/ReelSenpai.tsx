// El reel de Senpai (@dev.tenshi) para Instagram (9:16): la variante calma del Reel Insta, con tomas largas, sin
// subtítulos (el único texto propio es la tarjeta final con el link). La voz es una sola toma continua
// (audio/senpai.mp3) que suena entera desde que termina el gancho: no se corta, y cada bloque dura lo que tarda en
// llegar la primera frase del siguiente (audio/senpai-bloques.json, de scripts/narrar-senpai.mjs, que también da los
// tiempos de cada frase para anclar cortes y bajar la música). Los clips van sin su sonido salvo en el gancho, que no
// tiene voz. La música de fondo (music/<reel_senpai.musica.archivo>.mp3, si está) va durante todo el reel, por
// debajo de la voz. Ningún texto del juego queda cortado: las tomas con texto van con un recorte del cuadro
// horizontal que lo contiene entero, a todo el ancho y sobre el mismo clip desenfocado. Los bloques y cortes están en
// escenas.json (reel_senpai).

import { AbsoluteFill, Easing, Html5Audio, Html5Video, Img, interpolate, random, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { audioPath, clipPath, existe, FPS, musicPath, SENPAI, type BloqueSenpai, type ClipRef, type TramoSenpai, type Visual } from './medios';
import { Placa } from './Narrado';
import { Laberinto, Semillas } from './visuales/Laberinto';
import { Pipeline } from './visuales/Pipeline';
import { Rastros } from './visuales/Rastros';

const VISUALES: Record<Visual, React.FC<{ frames: number }>> = { laberinto: Laberinto, semillas: Semillas, pipeline: Pipeline, rastros: Rastros };

/** Las grabaciones: 1920 × ~868. */
const ANCHO_CLIPS = 1920;
const ASPECTO_CLIPS = ANCHO_CLIPS / 868;
const AMARILLO = '#f3e6a2';
const VOZ = audioPath('senpai');

export interface ReelSenpaiProps extends Record<string, unknown> {
  bloques: BloqueSenpai[];
  frames: number[];
  /** Dónde cae cada bloque narrado en la voz (sin el json todavía, ninguno). */
  tramos: Record<string, TramoSenpai>;
}

/** Frame (dentro del bloque) en que arranca cada corte: los que tienen `en_frase`, con su frase; el resto, por peso. */
function iniciosCortes(bloque: BloqueSenpai, frames: number, tramo?: TramoSenpai): number[] {
  const anclas = bloque.cortes.map((c, i) => {
    if (i === 0) return 0;
    const f = c.en_frase !== undefined && tramo?.frases[c.en_frase];
    return f ? Math.max(1, Math.round((f.desde - 0.08) * FPS)) : null;
  });
  const out: number[] = [];
  for (let i = 0; i < anclas.length; ) {
    // Del ancla i a la siguiente, los cortes sin ancla se reparten el tramo según su peso.
    let j = i + 1;
    while (j < anclas.length && anclas[j] === null) j++;
    const desde = anclas[i]!;
    const hasta = anclas[j] ?? frames;
    const pesos = bloque.cortes.slice(i, j).map((c) => c.s ?? 1);
    const total = pesos.reduce((a, b) => a + b, 0);
    pesos.forEach((_, k) => out.push(desde + Math.round((pesos.slice(0, k).reduce((a, b) => a + b, 0) / total) * (hasta - desde))));
    i = j;
  }
  return out;
}

export const ReelSenpai: React.FC<ReelSenpaiProps> = ({ bloques, frames, tramos }) => {
  const inicios = frames.map((_, i) => frames.slice(0, i).reduce((a, b) => a + b, 0));
  const total = frames.reduce((a, b) => a + b, 0);
  // La voz arranca con el primer bloque narrado.
  const primero = bloques.findIndex((b) => tramos[b.id]);
  // Cuándo habla (frames del reel), para bajar la música.
  const habla = bloques.flatMap((b, i) => (tramos[b.id]?.frases ?? []).map((f) => [inicios[i] + f.desde * FPS, inicios[i] + f.hasta * FPS] as const));
  const musica = musicPath(SENPAI.musica.archivo);
  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {bloques.map((b, i) => (
        <Sequence key={b.id} from={inicios[i]} durationInFrames={frames[i]} name={b.id}>
          <BloqueSenpai bloque={b} frames={frames[i]} tramo={tramos[b.id]} />
        </Sequence>
      ))}
      {primero >= 0 && existe(VOZ) && (
        <Sequence from={inicios[primero]} name="voz">
          <Html5Audio src={staticFile(VOZ)} />
        </Sequence>
      )}
      {existe(musica) && <Html5Audio src={staticFile(musica)} loop volume={(f) => volumenMusica(f, total, habla)} />}
    </AbsoluteFill>
  );
};

/**
 * La música de fondo: `volumen` (unos 18 dB por debajo de la voz), `ducking_db` menos mientras habla Senpai (baja y
 * sube de a poco alrededor de cada frase), y fundidos de entrada y de salida.
 */
function volumenMusica(f: number, total: number, habla: (readonly [number, number])[]): number {
  const { volumen, ducking_db, entra_s, sale_s } = SENPAI.musica;
  const cerca = Math.min(...habla.map(([a, b]) => (f < a ? a - f : f > b ? f - b : 0)), Infinity);
  const db = interpolate(cerca, [0.1 * FPS, 0.6 * FPS], [-ducking_db, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const bordes = Math.min(
    interpolate(f, [0, entra_s * FPS], [0, 1], { extrapolateRight: 'clamp' }),
    interpolate(f, [total - sale_s * FPS, total], [1, 0], { extrapolateLeft: 'clamp' }),
  );
  return volumen * 10 ** (db / 20) * bordes;
}

const BloqueSenpai: React.FC<{ bloque: BloqueSenpai; frames: number; tramo?: TramoSenpai }> = ({ bloque, frames, tramo }) => {
  const inicios = iniciosCortes(bloque, frames, tramo);
  // Dónde termina la última frase del bloque (la voz no se corta: sigue sonando por debajo del reel).
  const finVoz = tramo ? Math.round(tramo.frases[tramo.frases.length - 1].hasta * FPS) : frames;
  return (
    <AbsoluteFill>
      {bloque.cortes.map((c, i) => {
        const dur = (inicios[i + 1] ?? frames) - inicios[i];
        const V = c.visual && VISUALES[c.visual];
        return (
          <Sequence key={i} from={inicios[i]} durationInFrames={dur} name={c.clip ?? c.visual}>
            {V ? <V frames={dur} /> : c.imagen ? <Imagen corte={c} frames={dur} /> : <Corte corte={c} frames={dur} volumen={bloque.volumen ?? 0} />}
          </Sequence>
        );
      })}
      {bloque.apagar && <Apagon desde={finVoz} />}
      {bloque.link && (
        <Sequence from={finVoz + Math.round(0.45 * FPS)}>
          <Link />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};

/**
 * Un clip. Recortado al alto, con un acercamiento lento, si no tiene texto del juego a medias (el encuadre deja el
 * HUD afuera entero); con `recorte`, solo ese rectángulo del cuadro horizontal, llevado a todo el ancho y sobre el
 * mismo clip desenfocado (el rectángulo se elige con margen alrededor del texto, para que el acercamiento no lo corte).
 */
const Corte: React.FC<{ corte: ClipRef; frames: number; volumen: number }> = ({ corte, frames, volumen }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const path = clipPath(corte.clip!);
  if (!existe(path)) return <Placa texto={`falta ${path}`} />;
  const [ex, ey] = corte.encuadre ?? [50, 50];
  const video = (style: React.CSSProperties, conSonido = true) => (
    <Html5Video
      src={staticFile(path)}
      loop
      muted={!conSonido}
      volume={conSonido ? volumen : 0}
      playbackRate={corte.velocidad ?? 1}
      trimBefore={Math.round((corte.desde ?? 0) * FPS)}
      style={{ width: '100%', height: '100%', ...style }}
    />
  );

  let contenido: React.ReactNode;
  if (corte.recorte) {
    const [x0, y0, x1, y1] = corte.recorte;
    const k = (width / (x1 - x0)) * interpolate(frame, [0, frames], [1, 1.03]);
    const paneo = interpolate(frame, [0, frames], [1, -1]) * (corte.paneo ?? 0);
    const w = (x1 - x0) * k;
    const h = (y1 - y0) * k;
    const centro = `${(((x0 + x1) / 2 / ANCHO_CLIPS) * 100).toFixed(1)}% ${(((y0 + y1) / 2 / (ANCHO_CLIPS / ASPECTO_CLIPS)) * 100).toFixed(1)}%`;
    contenido = (
      <AbsoluteFill style={{ backgroundColor: 'black', overflow: 'hidden' }}>
        <AbsoluteFill style={{ filter: 'blur(36px) brightness(0.5) saturate(1.2)', transform: 'scale(1.15)' }}>
          {video({ objectFit: 'cover', objectPosition: centro }, false)}
        </AbsoluteFill>
        <div style={{ position: 'absolute', left: (width - w) / 2 + paneo, top: (height - h) / 2, width: w, height: h, overflow: 'hidden', boxShadow: '0 0 60px rgb(0 0 0 / 0.7)' }}>
          {/* El clip a su alto natural: solo se fija el ancho. */}
          <div style={{ position: 'absolute', left: -x0 * k, top: -y0 * k, width: ANCHO_CLIPS * k }}>{video({ height: 'auto', display: 'block' })}</div>
        </div>
      </AbsoluteFill>
    );
  } else {
    const deriva = interpolate(frame, [0, frames], [1, 1.04]);
    contenido = (
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        {video({ objectFit: 'cover', objectPosition: `${ex}% ${ey}%`, transform: `scale(${deriva})`, transformOrigin: `${ex}% ${ey}%` })}
      </AbsoluteFill>
    );
  }
  return corte.glitch ? <Glitch>{contenido}</Glitch> : <>{contenido}</>;
};

/**
 * La Interferencia se mete en la imagen: ráfagas de sacudón, color corrido y franjas de ruido. El sacudón es vertical:
 * uno horizontal correría el texto contra el borde.
 */
const Glitch: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const rafaga = Math.floor(frame / 3);
  const on = frame < 8 || random(`glitch-${rafaga}`) < 0.3;
  const r = (k: string) => random(`${k}-${frame}`);
  const franjas = on ? Array.from({ length: 3 + Math.floor(r('n') * 4) }, (_, k) => ({ y: r(`y${k}`) * height, h: 8 + r(`h${k}`) * 70, x: (r(`x${k}`) - 0.5) * 120, c: Math.floor(r(`c${k}`) * 360) })) : [];
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <AbsoluteFill style={on ? { transform: `translateY(${(r('dy') - 0.5) * 30}px)`, filter: `hue-rotate(${(r('hue') - 0.5) * 120}deg) saturate(1.8) contrast(1.25)` } : undefined}>{children}</AbsoluteFill>
      {franjas.map((f, k) => (
        <div
          key={k}
          style={{
            position: 'absolute',
            left: f.x,
            right: -f.x,
            top: f.y,
            height: f.h,
            mixBlendMode: 'screen',
            opacity: 0.55,
            background: `repeating-linear-gradient(90deg, hsl(${f.c} 90% 50%) 0 14px, hsl(${f.c + 120} 90% 45%) 14px 22px, transparent 22px 40px, hsl(${f.c + 240} 90% 50%) 40px 52px)`,
          }}
        />
      ))}
    </AbsoluteFill>
  );
};

/** Una imagen fija (en clips/) con un acercamiento y un paneo lentos, de `encuadre` a `encuadre_fin` (en %). */
const Imagen: React.FC<{ corte: ClipRef; frames: number }> = ({ corte, frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const path = `clips/${corte.imagen}`;
  if (!existe(path)) return <Placa texto={`falta ${path}`} />;
  const t = interpolate(frame, [0, frames], [0, 1], { easing: Easing.inOut(Easing.sin) });
  const [x0, y0] = corte.encuadre ?? [50, 50];
  const [x1, y1] = corte.encuadre_fin ?? [x0, y0];
  const zoom = interpolate(t, [0, 1], [corte.zoom ?? 1, corte.zoom_fin ?? corte.zoom ?? 1]);
  // La imagen es cuadrada: a lo alto del cuadro por el zoom, con el punto del encuadre en el centro (sin salirse).
  const lado = height * zoom;
  const left = Math.min(0, Math.max(width - lado, width / 2 - (interpolate(t, [0, 1], [x0, x1]) / 100) * lado));
  const top = Math.min(0, Math.max(height - lado, height / 2 - (interpolate(t, [0, 1], [y0, y1]) / 100) * lado));
  return (
    <AbsoluteFill style={{ backgroundColor: 'black', overflow: 'hidden' }}>
      <Img src={staticFile(path)} style={{ position: 'absolute', left, top, width: lado, height: lado }} />
    </AbsoluteFill>
  );
};

/** Fundido a negro. */
const Apagon: React.FC<{ desde: number }> = ({ desde }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [desde - 0.2 * FPS, desde + 0.5 * FPS], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.quad) });
  return <AbsoluteFill style={{ backgroundColor: 'black', opacity }} />;
};

/** La tarjeta final: el link del juego, en minúscula, sobre negro. */
const Link: React.FC = () => {
  const frame = useCurrentFrame();
  const entra = interpolate(frame, [0, 0.4 * FPS], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', backgroundColor: 'black' }}>
      <div style={{ opacity: entra, transform: `translateY(${(1 - entra) * 24}px)`, color: AMARILLO, fontFamily: 'Consolas, monospace', fontSize: 52, fontWeight: 700 }}>
        {SENPAI.link.toLowerCase()}
      </div>
    </AbsoluteFill>
  );
};
