# Video del proyecto (Remotion)

El video de YouTube (16:9, ~3 min), el reel (9:16), el Reel Insta (9:16, ~45 s, cortes rápidos y subtítulos) y la
miniatura, armados con [Remotion](https://www.remotion.dev/).
Solo se versiona el código y el guion: las grabaciones, los clips, la narración y los renders quedan afuera de git.

| Qué | Dónde |
|---|---|
| Guion (fuente de los textos de la narración) | `guion-backrooms.md` |
| Escenas, clips por escena, miniatura y seed de los visuales | `src/escenas.json` |
| Grabaciones crudas (CapCut) | `raw/` (ignorada) |
| Clips cortados y fotograma de la miniatura | `clips/` (ignorada) |
| Narración de ElevenLabs | `audio/` (ignorada) |
| Visuales generados: laberinto, seeds, pipeline y rastros del Gold | `src/visuales/` |
| Renders | `out/` (ignorada) |

## Preparar
```bash
cd video
npm install
cp .env.example .env    # ELEVENLABS_API_KEY=... (no se commitea)
npm run cortar          # clips/ desde raw/ (scripts/cortar.mjs dice de dónde sale cada corte) y la miniatura
npm run narrar          # una narración por escena; solo rehace las que cambiaron en el guion
```
Los rastros de la escena 9 salen de `../data/gold`, que exporta el consumer: con `docker compose up` y partidas jugadas.

## Revisar
```bash
npm run studio          # http://localhost:3010
```
El Studio escucha en toda la red local. Lee `remotion.env` (sin secretos) en lugar de `.env`, para no inyectar la key
de ElevenLabs en la página, y sirve solo `public/`, que apunta a `clips/`, `audio/` y `data/gold`.

## Renderizar
```bash
npx remotion render src/index.ts Video out/video.mp4 --timeout=120000 --concurrency=2
npx remotion render src/index.ts Reel out/reel.mp4 --timeout=120000 --concurrency=2
npx remotion render src/index.ts ReelInsta out/reel-insta.mp4 --timeout=120000 --concurrency=2
npx remotion still src/index.ts Miniatura out/miniatura.jpg
```
`--timeout=120000 --concurrency=2` hacen falta: con los valores por defecto (28 s y más páginas en paralelo) los clips
no terminan de cargar y el render corta con `delayRender() ... was not cleared after 28000ms`.
