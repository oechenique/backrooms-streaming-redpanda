// Narración con ElevenLabs: un mp3 por escena del video, uno para el reel y uno por bloque narrado del Reel Insta, en
// video/audio/<id>.mp3. Los del Reel Insta salen con más energía (reel_insta.voz_ajustes) y con los tiempos de cada
// letra (audio/<id>.json), de donde salen los subtítulos.
// Los textos salen de guion-backrooms.md (se copian a src/escenas.json, ver guion.mjs).
// La key sale de video/.env (ELEVENLABS_API_KEY); nunca se imprime ni se escribe en otro lado.
// Solo regenera lo que cambió (su texto, la voz o el modelo): audio/manifest.json guarda un hash por escena. El texto
// de las escenas vecinas se manda para la entonación, pero no entra en el hash: cambiar una escena no rehace las otras.
//
//   npm run narrar                 # lo que falte o haya cambiado
//   npm run narrar -- 08-datos     # solo esas escenas (se regeneran aunque no hayan cambiado)

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sincronizar } from './guion.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { data, cambios } = sincronizar();
if (cambios.length) console.log(`Guion → escenas.json: cambió ${cambios.join(', ')}`);
const audioDir = resolve(root, 'audio');
const manifestPath = resolve(audioDir, 'manifest.json');

function readKey() {
  const path = resolve(root, '.env');
  if (!existsSync(path)) return null;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*ELEVENLABS_API_KEY\s*=\s*(.*?)\s*$/);
    if (m && m[1]) return m[1].replace(/^["']|["']$/g, '');
  }
  return null;
}

const key = readKey();
if (!key) {
  console.error('Falta ELEVENLABS_API_KEY en video/.env (copiá video/.env.example).');
  process.exit(1);
}

const solo = process.argv.slice(2);
const { voice_id, model_id } = data.voz;
const items = [
  // Las escenas del video llevan el texto vecino para que la entonación siga de una a otra.
  ...data.video.map((e, i, all) => ({ ...e, previous_text: all[i - 1]?.texto, next_text: all[i + 1]?.texto })),
  data.reel,
  ...data.reel_insta.bloques
    .filter((b) => b.texto)
    .map((b, i, all) => ({ ...b, ajustes: data.reel_insta.voz_ajustes, previous_text: all[i - 1]?.texto, next_text: all[i + 1]?.texto })),
];
mkdirSync(audioDir, { recursive: true });
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};

let made = 0;
for (const item of items) {
  if (solo.length && !solo.includes(item.id)) continue;
  const hash = createHash('sha256')
    .update(JSON.stringify(item.ajustes ? [voice_id, model_id, item.texto, item.ajustes] : [voice_id, model_id, item.texto]))
    .digest('hex');
  const out = resolve(audioDir, `${item.id}.mp3`);
  if (!solo.length && existsSync(out) && manifest[item.id] === hash) {
    console.log(`= ${item.id} (sin cambios)`);
    continue;
  }
  const body = { text: item.texto, model_id };
  if (item.previous_text) body.previous_text = item.previous_text;
  if (item.next_text) body.next_text = item.next_text;
  if (item.ajustes) body.voice_settings = item.ajustes;
  const ruta = item.ajustes ? 'with-timestamps' : '';
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice_id}${ruta && '/' + ruta}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: ruta ? 'application/json' : 'audio/mpeg' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`✗ ${item.id}: ElevenLabs respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
    process.exit(1);
  }
  if (ruta) {
    const { audio_base64, alignment } = await res.json();
    writeFileSync(out, Buffer.from(audio_base64, 'base64'));
    writeFileSync(resolve(audioDir, `${item.id}.json`), JSON.stringify(alignment));
  } else {
    writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  }
  manifest[item.id] = hash;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  made++;
  console.log(`✓ ${item.id} → audio/${item.id}.mp3`);
}
console.log(`${made} audio(s) generado(s).`);
