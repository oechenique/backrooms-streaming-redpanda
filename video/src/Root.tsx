import { Composition, Still } from 'remotion';
import { duracion, FPS, REEL, VIDEO, type Item } from './medios';
import { Miniatura } from './Miniatura';
import { Narrado } from './Narrado';

// La duración de cada composición sale de las narraciones (calculateMetadata), escena por escena.
const metadata = (items: Item[]) => async () => {
  const d = await Promise.all(items.map(duracion));
  const frames = d.map((x) => x.frames);
  return { durationInFrames: frames.reduce((a, b) => a + b, 0), props: { items, frames } };
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
    <Still id="Miniatura" component={Miniatura} width={1280} height={720} />
  </>
);
