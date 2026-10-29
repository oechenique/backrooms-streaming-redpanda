// Lee los textos de narración de guion-backrooms.md (la fuente de verdad) y los deja en src/escenas.json, que es lo
// que usa Remotion para estimar duraciones mientras falta un audio.
//
// Formato que se espera en el guion: cada escena del video es un "### N. Título" seguido de una línea "> texto";
// el reel es la primera línea "> texto" después de "## Reel".

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const guionPath = resolve(root, 'guion-backrooms.md');
const escenasPath = resolve(root, 'src/escenas.json');

export function leerGuion() {
  const lines = readFileSync(guionPath, 'utf8').split(/\r?\n/);
  const escenas = new Map();
  let reel = null;
  let escena = null;
  let enReel = false;
  for (const line of lines) {
    const h = line.match(/^###\s+(\d+)\./);
    if (h) {
      escena = Number(h[1]);
      continue;
    }
    if (/^##\s+Reel/.test(line)) {
      enReel = true;
      escena = null;
      continue;
    }
    if (/^##\s/.test(line)) enReel = false;
    const q = line.match(/^>\s*(.+)$/);
    if (!q) continue;
    if (escena !== null && !escenas.has(escena)) escenas.set(escena, q[1].trim());
    else if (enReel && reel === null) reel = q[1].trim();
  }
  return { escenas, reel };
}

/** Copia los textos del guion a escenas.json (por número de escena). Devuelve los datos actualizados. */
export function sincronizar() {
  const data = JSON.parse(readFileSync(escenasPath, 'utf8'));
  const { escenas, reel } = leerGuion();
  if (escenas.size !== data.video.length || reel === null) {
    throw new Error(`El guion tiene ${escenas.size} escenas${reel === null ? ' y no tiene reel' : ''}; escenas.json espera ${data.video.length} y un reel.`);
  }
  const cambios = [];
  data.video.forEach((e, i) => {
    const texto = escenas.get(i + 1);
    if (texto === undefined) throw new Error(`Falta la escena ${i + 1} en el guion.`);
    if (e.texto !== texto) cambios.push(e.id);
    e.texto = texto;
  });
  if (data.reel.texto !== reel) cambios.push(data.reel.id);
  data.reel.texto = reel;
  if (cambios.length) writeFileSync(escenasPath, JSON.stringify(data, null, 2) + '\n');
  return { data, cambios };
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('guion.mjs')) {
  const { cambios } = sincronizar();
  console.log(cambios.length ? `escenas.json actualizado: ${cambios.join(', ')}` : 'escenas.json ya estaba al día');
}
