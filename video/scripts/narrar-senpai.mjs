// Narración del Reel Senpai: una sola toma continua, de UN solo pedido a ElevenLabs con los tiempos de cada letra; las
// pausas son las naturales de la puntuación. El audio no se corta: audio/senpai.mp3 suena de punta a punta y es el video
// el que se ajusta a la voz. audio/senpai-bloques.json dice, en segundos de la narración, dónde empieza y termina cada
// bloque (de su primera frase a la primera del siguiente) y dónde cae cada frase, para anclar cortes y bajar la música.
// Los textos salen de guion-backrooms.md ("## Reel Senpai"); la voz y sus ajustes, de reel_senpai.voz.
// La key sale de video/.env (ELEVENLABS_API_KEY); nunca se imprime ni se escribe en otro lado.
// Solo vuelve a pedir si cambió algún texto, la voz o los ajustes (audio/manifest.json, id "senpai").
//
//   npm run narrar:senpai              # si cambió algo
//   npm run narrar:senpai -- --forzar  # siempre

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
const { voz, bloques } = data.reel_senpai;
const hablados = bloques.filter((b) => b.voz);

/** Frases de un texto (anclan cortes y bajan la música): corta en . ? ! y, si la frase es larga, también en , y :. */
function frases(texto) {
  const out = [];
  for (const f of texto.split(/(?<=[.?!])\s+/)) {
    if (f.split(/\s+/).length <= 8) {
      out.push(f);
      continue;
    }
    // Se juntan las partes entre comas (o dos puntos) hasta tener unas cuatro palabras.
    let actual = '';
    for (const parte of f.split(/(?<=[,:])\s+/)) {
      actual = actual ? `${actual} ${parte}` : parte;
      if (actual.split(/\s+/).length >= 4) {
        out.push(actual);
        actual = '';
      }
    }
    // Lo que sobra al final, si son una o dos palabras, va con la parte anterior.
    if (actual) out.push(out.length && actual.split(/\s+/).length < 3 ? `${out.pop()} ${actual}` : actual);
  }
  return out.filter(Boolean);
}

function readKey() {
  const path = resolve(root, '.env');
  if (!existsSync(path)) return null;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*ELEVENLABS_API_KEY\s*=\s*(.*?)\s*$/);
    if (m && m[1]) return m[1].replace(/^["']|["']$/g, '');
  }
  return null;
}

const texto = hablados.map((b) => b.voz).join(' ');

mkdirSync(audioDir, { recursive: true });
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
const hash = createHash('sha256').update(JSON.stringify([voz, texto])).digest('hex');
const mp3 = resolve(audioDir, 'senpai.mp3');
const alineacionPath = resolve(audioDir, 'senpai.json');

if (!process.argv.includes('--forzar') && existsSync(mp3) && existsSync(alineacionPath) && manifest.senpai === hash) {
  console.log('= senpai (sin cambios)');
} else {
  const key = readKey();
  if (!key) {
    console.error('Falta ELEVENLABS_API_KEY en video/.env (copiá video/.env.example).');
    process.exit(1);
  }
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voz.voice_id}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ text: texto, model_id: voz.model_id, voice_settings: voz.ajustes }),
  });
  if (!res.ok) {
    console.error(`✗ senpai: ElevenLabs respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
    process.exit(1);
  }
  const { audio_base64, alignment } = await res.json();
  writeFileSync(mp3, Buffer.from(audio_base64, 'base64'));
  writeFileSync(alineacionPath, JSON.stringify(alignment));
  manifest.senpai = hash;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('✓ senpai → audio/senpai.mp3');
}

// Los tiempos: cada frase de la voz se busca, en orden, en el texto que devolvió ElevenLabs.
const a = JSON.parse(readFileSync(alineacionPath, 'utf8'));
let unido = '';
const letra = []; // posición en `unido` → índice en a.characters
a.characters.forEach((c, i) => {
  for (const _ of c) letra.push(i);
  unido += c;
});
let cursor = 0;
const out = {};
for (const b of hablados) {
  const fs = frases(b.voz).map((f) => {
    const i = unido.indexOf(f, cursor);
    if (i < 0) throw new Error(`${b.id}: no encuentro "${f}" en los tiempos de ElevenLabs.`);
    cursor = i + f.length;
    return { texto: f, desde: a.character_start_times_seconds[letra[i]], hasta: a.character_end_times_seconds[letra[cursor - 1]] };
  });
  out[b.id] = { desde: fs[0].desde, hasta: fs[fs.length - 1].hasta, frases: fs };
}
// Cada bloque arranca un poco antes de su primera letra (el primero, con la narración) y dura hasta que arranca el
// siguiente; el último, hasta un poco después de su última letra. Así los bloques cubren la voz entera, sin huecos.
const ids = Object.keys(out);
const inicio = ids.map((id, k) => (k === 0 ? 0 : Math.max(out[ids[k - 1]].hasta, out[id].desde - 0.12)));
const fin = inicio.slice(1).concat(out[ids[ids.length - 1]].hasta + 0.35);
const huecos = [];
let anterior = null;
ids.forEach((id, k) => {
  const b = out[id];
  for (const f of b.frases) {
    if (anterior !== null) huecos.push({ id, s: f.desde - anterior });
    anterior = f.hasta;
  }
  out[id] = {
    desde: +inicio[k].toFixed(3),
    hasta: +fin[k].toFixed(3),
    frases: b.frases.map((f) => ({ texto: f.texto, desde: +(f.desde - inicio[k]).toFixed(3), hasta: +(f.hasta - inicio[k]).toFixed(3) })),
  };
});
writeFileSync(resolve(audioDir, 'senpai-bloques.json'), JSON.stringify(out, null, 2));
for (const [id, b] of Object.entries(out)) console.log(`  ${id}: ${(b.hasta - b.desde).toFixed(2)} s, ${b.frases.length} frase(s)`);
const mayor = huecos.reduce((m, h) => (h.s > m.s ? h : m));
console.log(`Voz: ${fin[fin.length - 1].toFixed(1)} s en ${ids.length} bloques → audio/senpai-bloques.json`);
console.log(`Pausas entre frases: de ${Math.min(...huecos.map((h) => h.s)).toFixed(2)} a ${mayor.s.toFixed(2)} s (la mayor, en ${mayor.id}).`);
