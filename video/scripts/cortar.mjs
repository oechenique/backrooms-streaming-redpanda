// Corta los clips del guion (video/clips/NN-nombre.mp4) de las grabaciones crudas de video/raw/ con el ffmpeg que
// trae Remotion. Ni las grabaciones ni los cortes van a git.
//
// Cómo se ubicaron los cortes: las grabaciones no tienen la hora en el nombre, así que el inicio se estimó como
// fecha de modificación menos la duración (ffprobe). Con ese inicio, el segundo de cada evento de Bronze dentro de
// la grabación es ts - inicio. En las tres primeras el inicio estimado cae a menos de un segundo del sesion_inicio,
// así que la estimación cierra. Los segundos que siguen ya son del archivo crudo.
//
//   npm run cortar            # corta lo que falte
//   npm run cortar -- --todo  # vuelve a cortar todo

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** id del clip → [grabación cruda, desde (s), hasta (s)]. */
const CORTES = {
  // 1-caminata-random: sesión b0fec770, inicio estimado 15:59:50 UTC (sesion_inicio 15:59:50.9). Pasillo abierto
  // del Nivel 0, sin la criatura cerca.
  '01-pasillo': ['1-caminata-random', 110, 120],
  // 3-escape-atrapa-final: sesión b8a47ebd, inicio estimado 16:24:22.6 (sesion_inicio 16:24:22.7). Bronze tiene
  // eventos solo hasta 16:24:50 (s 28): el apagón (s 48), la silueta (s 64.6) y "TE ENCONTRÓ" (s 65.3) se ubicaron
  // mirando los fotogramas, porque la persecución y la captura de esa partida nunca llegaron al pipeline.
  '02-caceria': ['3-escape-atrapa-final', 45.3, 65.3],
  '03-captura': ['3-escape-atrapa-final', 59, 69],
  // 04-escape: ninguna grabación tiene un escape. Los dos escapes de 0.5.0 (sesiones ae8738a9 y 670369c5, entre
  // 15:11 y 15:17 UTC) no se grabaron.
  // 1-caminata-random: zona_cambio por puerta a las 16:01:01.4 (s 71.3).
  '05-puerta': ['1-caminata-random', 68.5, 73.5],
  // 4-no-clip-nivel1: sesión e554fd8a, inicio estimado 16:26:16.8; noclip a las 16:28:15.3 (s 118.5). Los primeros
  // 20 s son navegación (sesion_inicio a las 16:26:37).
  '06-noclip': ['4-no-clip-nivel1', 106, 121],
  '07-estacionamiento': ['4-no-clip-nivel1', 124, 134],
  // Pantallas fuera del juego: se descartan los primeros segundos (CapCut y navegación).
  '08-repo': ['5-repo', 8, 13],
  '09-console': ['6-redpanda', 2, 12],
  // consulta.py: el comando a los 6 s, las tablas (sesiones, persecuciones, captura por versión) desde los 8 s.
  '10-terminal': ['7-docker', 6, 20],
  // El mapa: capas, niveles y, desde el s 30 de la grabación, la seed del día con las partidas 0.5.0.
  '11-mapa': ['8-mapa-perdidos', 14.5, 34.5],
};

const todo = process.argv.includes('--todo');
const ffmpeg = (args) => {
  const cmd = ['npx', 'remotion', 'ffmpeg', '-v', 'error', '-y', ...args].map((a) => (/[\s"]/.test(a) ?`"${a}"` : a)).join(' ');
  return spawnSync(cmd, { cwd: root, shell: true, stdio: 'inherit' }).status;
};
mkdirSync(resolve(root, 'clips'), { recursive: true });
for (const [id, [raw, desde, hasta]] of Object.entries(CORTES)) {
  const src = resolve(root, 'raw', `${raw}.mp4`);
  const out = resolve(root, 'clips', `${id}.mp4`);
  if (!existsSync(src)) {
    console.error(`✗ ${id}: falta raw/${raw}.mp4`);
    continue;
  }
  if (existsSync(out) && !todo) {
    console.log(`= ${id} (ya estaba)`);
    continue;
  }
  // -ss antes de -i con recodificación: corte exacto al fotograma.
  const status = ffmpeg(['-ss', String(desde), '-i', src, '-t', String(hasta - desde),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k',
    '-movflags', '+faststart', out]);
  if (status !== 0) {
    console.error(`✗ ${id}: ffmpeg terminó con ${status}`);
    process.exit(1);
  }
  console.log(`✓ ${id} ← raw/${raw}.mp4 [${desde}–${hasta} s]`);
}

// La miniatura: el fotograma de escenas.json (miniatura.clip, miniatura.segundo) como imagen.
const { miniatura } = JSON.parse(readFileSync(resolve(root, 'src/escenas.json'), 'utf8'));
const clip = resolve(root, 'clips', `${miniatura.clip}.mp4`);
const jpg = resolve(root, 'clips', 'miniatura.jpg');
if (existsSync(clip) && (todo || !existsSync(jpg))) {
  if (ffmpeg(['-ss', String(miniatura.segundo), '-i', clip, '-frames:v', '1', '-q:v', '2', jpg]) !== 0) process.exit(1);
  console.log(`✓ miniatura.jpg ← clips/${miniatura.clip}.mp4 [${miniatura.segundo} s]`);
}
