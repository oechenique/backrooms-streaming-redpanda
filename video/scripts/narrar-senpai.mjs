// Narración del Reel Senpai: toda la voz sale de UN solo pedido a ElevenLabs con los tiempos de cada letra, con las
// pausas metidas en el texto ([pausa] → <break>) y una pausa entre bloques. Después se corta por bloques con esos
// tiempos: audio/senpai.mp3 queda entero y audio/senpai-bloques.json dice dónde empieza y termina cada bloque y cada
// frase. Remotion toca cada bloque como un tramo del mp3 (los tramos no se pisan).
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

/** Frases de un texto (anclan cortes y bajan la música): corta en . ? ! y, si la frase es larga, también en las comas. */
function frases(texto) {
  const out = [];
  for (const f of texto.replace(/\s*\[pausa( larga)?\]/g, '').split(/(?<=[.?!])\s+/)) {
    if (f.split(/\s+/).length <= 8) {
      out.push(f);
      continue;
    }
    // Se juntan las partes entre comas hasta tener unas cuatro palabras.
    let actual = '';
    for (const parte of f.split(/(?<=,)\s+/)) {
      actual = actual ? `${actual} ${parte}` : parte;
      if (actual.split(/\s+/).length >= 4) {
        out.push(actual);
        actual = '';
      }
    }
    // Lo que sobra al final va con la parte anterior.
    if (actual) out.push(out.length ? `${out.pop()} ${actual}` : actual);
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

const pausas = (t) => t.replace(/\s*\[(pausa(?: larga)?)\]\s*/g, (_, p) => ` <break time="${voz.pausas[p]}s" /> `);
const texto = hablados.map((b) => pausas(b.voz)).join(` <break time="${voz.entre_bloques_s}s" /> `);

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

// El corte: cada frase de la voz se busca, en orden, en el texto que devolvió ElevenLabs con sus tiempos.
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
// Cada bloque arranca un poco antes de su primera letra y termina un poco después de la última, sin pisar al siguiente.
const ids = Object.keys(out);
ids.forEach((id, k) => {
  const b = out[id];
  const siguiente = out[ids[k + 1]]?.desde ?? Infinity;
  const desde = Math.max(0, b.desde - 0.06);
  const hasta = Math.min(b.hasta + 0.2, (b.hasta + siguiente) / 2);
  out[id] = {
    desde: +desde.toFixed(3),
    hasta: +hasta.toFixed(3),
    frases: b.frases.map((f) => ({ texto: f.texto, desde: +(f.desde - desde).toFixed(3), hasta: +(f.hasta - desde).toFixed(3) })),
  };
});
writeFileSync(resolve(audioDir, 'senpai-bloques.json'), JSON.stringify(out, null, 2));
for (const [id, b] of Object.entries(out)) console.log(`  ${id}: ${(b.hasta - b.desde).toFixed(2)} s, ${b.frases.length} frase(s)`);
const total = Object.values(out).reduce((s, b) => s + b.hasta - b.desde, 0);
console.log(`Voz: ${total.toFixed(1)} s en ${ids.length} bloques → audio/senpai-bloques.json`);
