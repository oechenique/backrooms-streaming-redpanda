// Deja video/public/ apuntando a clips/, audio/ y al Gold del consumer (data/gold, para los rastros), con junctions en
// Windows y symlinks en el resto, para que Remotion los sirva sin exponer el resto de video/ (por ejemplo el .env).
// Avisa qué clips y audios faltan.

import { existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(resolve(root, 'src/escenas.json'), 'utf8'));

for (const dir of ['clips', 'audio', 'out', 'public']) mkdirSync(resolve(root, dir), { recursive: true });
const links = { clips: resolve(root, 'clips'), audio: resolve(root, 'audio'), gold: resolve(root, '../data/gold') };
for (const [dir, target] of Object.entries(links)) {
  const link = resolve(root, 'public', dir);
  if (!existsSync(link) && !isLink(link) && existsSync(target)) symlinkSync(target, link, 'junction');
}
if (!existsSync(links.gold)) console.log('Falta data/gold (lo exporta el consumer): el visual de rastros queda vacío.');

const faltanClips = Object.entries(data.clips).filter(([id]) => !existsSync(resolve(root, 'clips', `${id}.mp4`)));
if (faltanClips.length) {
  console.log(`Faltan ${faltanClips.length} clips en video/clips/ (se ven como placa de prueba en el Studio):`);
  for (const [id, desc] of faltanClips) console.log(`  ${id}.mp4  ${desc}`);
}
const ids = [...data.video.map((e) => e.id), data.reel.id];
const faltanAudios = ids.filter((id) => !existsSync(resolve(root, 'audio', `${id}.mp3`)));
if (faltanAudios.length) console.log(`Faltan narraciones (npm run narrar): ${faltanAudios.join(', ')}`);

function isLink(p) {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}
