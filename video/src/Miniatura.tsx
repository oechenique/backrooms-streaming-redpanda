// Miniatura de YouTube: un fotograma de la cacería donde se ve la silueta, oscurecido hacia los bordes, con el título.
// El fotograma lo extrae `npm run cortar` (clips/miniatura.jpg, del clip y el segundo de escenas.json): en un Still,
// el video con trimBefore mostraba siempre el último fotograma.

import { AbsoluteFill, Img, staticFile } from 'remotion';
import { existe, MINIATURA } from './medios';

export const MINIATURA_PATH = 'clips/miniatura.jpg';

export const Miniatura: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: '#1a170c' }}>
    {existe(MINIATURA_PATH) && (
      <Img
        src={staticFile(MINIATURA_PATH)}
        // Agrandado hacia la esquina inferior derecha: el HUD del juego (arriba a la izquierda) queda afuera.
        style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.18)', transformOrigin: 'right bottom' }}
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
