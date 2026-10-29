// Música de fondo del Reel Senpai: pistas originales generadas con ElevenLabs Music (reel_senpai.musica en
// src/escenas.json: prompt y largo), en video/music/<archivo>.mp3. Si el plan no incluye Music, avisa y hay que dejar
// a mano pistas libres de derechos con esos nombres. Nunca canciones con derechos.
// La key sale de video/.env (ELEVENLABS_API_KEY); nunca se imprime ni se escribe en otro lado.
// Solo genera las que faltan o cambiaron (music/manifest.json); una pista puesta a mano (sin entrada en el manifest)
// no se pisa.
//
//   npm run musica                # lo que falte o haya cambiado
//   npm run musica -- dubstep     # solo esas (se regeneran aunque no hayan cambiado)

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(resolve(root, 'src/escenas.json'), 'utf8'));
const dir = resolve(root, 'music');
const manifestPath = resolve(dir, 'manifest.json');

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
mkdirSync(dir, { recursive: true });
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};

let made = 0;
for (const m of data.reel_senpai.musica) {
  if (solo.length && !solo.includes(m.id)) continue;
  const out = resolve(dir, `${m.archivo}.mp3`);
  const hash = createHash('sha256').update(JSON.stringify([m.prompt, m.largo_s])).digest('hex');
  if (!solo.length && existsSync(out) && (manifest[m.id] === hash || !manifest[m.id])) {
    console.log(`= ${m.id} (${manifest[m.id] ? 'sin cambios' : 'puesta a mano'})`);
    continue;
  }
  const res = await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ prompt: m.prompt, music_length_ms: Math.round(m.largo_s * 1000), model_id: 'music_v1', force_instrumental: true }),
  });
  if (!res.ok) {
    console.error(`✗ ${m.id}: ElevenLabs Music respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
    console.error(`  Si el plan no incluye Music, dejá una pista libre de derechos en video/music/${m.archivo}.mp3.`);
    process.exitCode = 1;
    break;
  }
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  manifest[m.id] = hash;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  made++;
  console.log(`✓ ${m.id} → music/${m.archivo}.mp3`);
}
console.log(`${made} pista(s) generada(s).`);
