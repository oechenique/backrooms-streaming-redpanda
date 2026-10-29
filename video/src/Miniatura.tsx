// Miniatura de YouTube: un fotograma del pasillo, oscurecido hacia los bordes, con el título del guion.

import { AbsoluteFill, OffthreadVideo, staticFile } from 'remotion';
import { clipPath, existe, FPS, MINIATURA } from './medios';

export const Miniatura: React.FC = () => {
  const path = clipPath(MINIATURA.clip);
  return (
    <AbsoluteFill style={{ backgroundColor: '#1a170c' }}>
      {existe(path) && (
        <OffthreadVideo
          src={staticFile(path)}
          trimBefore={Math.round(MINIATURA.segundo * FPS)}
          muted
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 35%, rgb(0 0 0 / 0.75) 100%)' }} />
      <AbsoluteFill style={{ justifyContent: 'flex-end', padding: '0 64px 56px' }}>
        <div
          style={{
            fontFamily: '"Arial Black", Impact, sans-serif',
            fontSize: 104,
            lineHeight: 0.95,
            color: '#f1e7b8',
            textTransform: 'uppercase',
            letterSpacing: '0.01em',
            textShadow: '0 0 24px rgb(0 0 0 / 0.9), 0 4px 0 #000',
            maxWidth: '80%',
          }}
        >
          {MINIATURA.titulo}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
