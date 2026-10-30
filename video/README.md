# Video del proyecto (Remotion)

El video de YouTube (16:9, ~3 min), el reel (9:16), el Reel Insta (9:16, ~45 s, cortes rápidos y subtítulos), el
Reel Senpai (9:16, ~49 s, la variante calma para @dev.tenshi, con la voz de Senpai, música de fondo y sin subtítulos) y
la miniatura,
armados con [Remotion](https://www.remotion.dev/).
Solo se versiona el código y el guion: las grabaciones, los clips, la narración y los renders quedan afuera de git.

| Qué | Dónde |
|---|---|
| Guion (fuente de los textos de la narración) | `guion-backrooms.md` |
| Escenas, clips por escena, miniatura y seed de los visuales | `src/escenas.json` |
| Grabaciones crudas (CapCut) | `raw/` (ignorada) |
| Clips cortados y fotograma de la miniatura | `clips/` (ignorada) |
| Narración de ElevenLabs | `audio/` (ignorada) |
| Música del Reel Senpai (original o libre de derechos) | `music/` (ignorada) |
| Visuales generados: laberinto, seeds, pipeline y rastros del Gold | `src/visuales/` |
| Renders | `out/` (ignorada) |

## Preparar
```bash
cd video
npm install
cp .env.example .env    # ELEVENLABS_API_KEY=... (no se commitea)
npm run cortar          # clips/ desde raw/ (scripts/cortar.mjs dice de dónde sale cada corte) y la miniatura
npm run narrar          # una narración por escena; solo rehace las que cambiaron en el guion
npm run narrar:senpai   # la voz del Reel Senpai: una sola toma continua, con los tiempos de cada frase
python scripts/capturar-mapa.py   # el mapa del Reel Senpai: captura del dashboard (corriendo en :5174) con Playwright
```
La música del Reel Senpai va a mano en `music/liminal.mp3` (original o libre de derechos); sin el archivo, sale sin
música.
Los rastros de la escena 9 salen de `../data/gold`, que exporta el consumer: con `docker compose up` y partidas jugadas.

## Revisar
```bash
npm run studio          # http://localhost:3010
```
El Studio escucha en toda la red local. Lee `remotion.env` (sin secretos) en lugar de `.env`, para no inyectar la key
de ElevenLabs en la página, y sirve solo `public/`, que apunta a `clips/`, `audio/`, `music/` y `data/gold`.

## Renderizar
```bash
npx remotion render src/index.ts Video out/video.mp4 --timeout=120000 --concurrency=2
npx remotion render src/index.ts Reel out/reel.mp4 --timeout=120000 --concurrency=2
npx remotion render src/index.ts ReelInsta out/reel-insta.mp4 --timeout=120000 --concurrency=2
npx remotion render src/index.ts ReelSenpai out/reel-senpai.mp4 --timeout=120000 --concurrency=2
npx remotion still src/index.ts Miniatura out/miniatura.jpg
```
`--timeout=120000 --concurrency=2` hacen falta: con los valores por defecto (28 s y más páginas en paralelo) los clips
no terminan de cargar y el render corta con `delayRender() ... was not cleared after 28000ms`.
