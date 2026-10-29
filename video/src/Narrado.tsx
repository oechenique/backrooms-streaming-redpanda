// Escenas narradas una detrás de otra: el clip (o los clips, en partes iguales) con el audio del juego bajito y la
// narración encima. Sin texto en pantalla; la placa solo aparece si falta un clip, para revisar en el Studio.

import { AbsoluteFill, Html5Audio, Html5Video, interpolate, Sequence, Series, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { audioPath, clipPath, existe, FPS, VOLUMEN_JUEGO, type ClipRef, type Item } from './medios';

export interface NarradoProps extends Record<string, unknown> {
  items: Item[];
  frames: number[];
}

export const Narrado: React.FC<NarradoProps> = ({ items, frames }) => (
  <AbsoluteFill style={{ backgroundColor: 'black' }}>
    <Series>
      {items.map((item, i) => (
        <Series.Sequence key={item.id} durationInFrames={frames[i]} name={item.id}>
          <Escena item={item} frames={frames[i]} />
        </Series.Sequence>
      ))}
    </Series>
  </AbsoluteFill>
);

const Escena: React.FC<{ item: Item; frames: number }> = ({ item, frames }) => {
  const parte = Math.floor(frames / item.clips.length);
  return (
    <AbsoluteFill>
      {item.clips.map((c, i) => (
        <Sequence
          key={i}
          from={i * parte}
          durationInFrames={i === item.clips.length - 1 ? frames - i * parte : parte}
          name={c.clip}
        >
          <Clip refClip={c} />
        </Sequence>
      ))}
      {existe(audioPath(item.id)) && <Html5Audio src={staticFile(audioPath(item.id))} />}
      {item.apagar && <Apagon frames={frames} />}
    </AbsoluteFill>
  );
};

const Clip: React.FC<{ refClip: ClipRef }> = ({ refClip }) => {
  const path = clipPath(refClip.clip);
  if (!existe(path)) return <Placa texto={`falta ${path}`} />;
  return (
    <Html5Video
      src={staticFile(path)}
      loop
      volume={VOLUMEN_JUEGO}
      playbackRate={refClip.velocidad ?? 1}
      trimBefore={Math.round((refClip.desde ?? 0) * FPS)}
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
    />
  );
};

/** La luz se apaga: fundido a negro en el último segundo y medio. */
const Apagon: React.FC<{ frames: number }> = ({ frames }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [frames - 1.5 * FPS, frames - 0.3 * FPS], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return <AbsoluteFill style={{ backgroundColor: 'black', opacity }} />;
};

/** Solo para el Studio: marca dónde falta un clip. */
const Placa: React.FC<{ texto: string }> = ({ texto }) => {
  const { width } = useVideoConfig();
  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#1a170c',
        color: '#8f855d',
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: 'Consolas, monospace',
        fontSize: width / 40,
      }}
    >
      {texto}
    </AbsoluteFill>
  );
};
