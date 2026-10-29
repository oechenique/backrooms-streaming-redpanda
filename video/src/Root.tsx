import { Composition, Still } from 'remotion';
import { AIRE_FRAMES, duracion, duracionBloque, duracionSenpai, FPS, INSTA, palabras, REEL, SENPAI, tramosSenpai, VIDEO, type Item } from './medios';
import { Miniatura } from './Miniatura';
import { Narrado } from './Narrado';
import { ReelInsta } from './ReelInsta';
import { ReelSenpai } from './ReelSenpai';

// La duración de cada composición sale de las narraciones (calculateMetadata), escena por escena, más el aire entre
// una escena y la siguiente.
const metadata = (items: Item[]) => async () => {
  const d = await Promise.all(items.map(duracion));
  const frames = d.map((x, i) => x.frames + (i < items.length - 1 ? AIRE_FRAMES : 0));
  return { durationInFrames: frames.reduce((a, b) => a + b, 0), props: { items, frames } };
};

// El Reel Insta: cada bloque dura lo que su voz (o sus cortes) y respira un poco antes del siguiente.
const metadataInsta = async () => {
  const { bloques } = INSTA;
  const d = await Promise.all(bloques.map(duracionBloque));
  const frames = d.map((x, i) => x + (bloques[i].texto && i < bloques.length - 1 ? Math.round(INSTA.aire_s * FPS) : 0));
  const p = await Promise.all(bloques.map((b) => (b.texto ? palabras(b.id) : [])));
  return { durationInFrames: frames.reduce((a, b) => a + b, 0), props: { bloques, frames, palabras: p } };
};

// El Reel Senpai: cada bloque dura su tramo de la voz (o sus cortes), más el aire entre bloques narrados.
const metadataSenpai = async () => {
  const { bloques } = SENPAI;
  const tramos = await tramosSenpai();
  const frames = bloques.map((b, i) => duracionSenpai(b, tramos[b.id]) + (b.voz && i < bloques.length - 1 ? Math.round(SENPAI.aire_s * FPS) : 0));
  return { durationInFrames: frames.reduce((a, b) => a + b, 0), props: { bloques, frames, tramos } };
};

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Video"
      component={Narrado}
      width={1920}
      height={1080}
      fps={FPS}
      durationInFrames={1}
      defaultProps={{ items: VIDEO, frames: [] }}
      calculateMetadata={metadata(VIDEO)}
    />
    <Composition
      id="Reel"
      component={Narrado}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={1}
      defaultProps={{ items: [REEL], frames: [] }}
      calculateMetadata={metadata([REEL])}
    />
    <Composition
      id="ReelInsta"
      component={ReelInsta}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={1}
      defaultProps={{ bloques: INSTA.bloques, frames: [], palabras: [] }}
      calculateMetadata={metadataInsta}
    />
    <Composition
      id="ReelSenpai"
      component={ReelSenpai}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={1}
      defaultProps={{ bloques: SENPAI.bloques, frames: [], tramos: {} }}
      calculateMetadata={metadataSenpai}
    />
    <Still id="Miniatura" component={Miniatura} width={1280} height={720} />
  </>
);
