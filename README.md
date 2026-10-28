# backrooms-streaming-redpanda

Un Backrooms jugable donde cada paso, cada persecución y cada vez que te atrapan es un evento que viaja por un pipeline de streaming.

**La Interferencia** vive en la señal: no te ve, te oye. Si corrés, te encuentra.

## Cómo funciona
```
Juego (navegador / celu)
   │  eventos en batch (JSON, contrato v1)
   ▼
Collector FastAPI ── inválidos ──► nivel0.eventos.dlq
   │  válidos
   ▼
Redpanda ── nivel0.eventos
   │
   ▼
Consumer Python ──► Bronze (Parquet) ──► Silver (sesiones, persecuciones)
                                              │
                                              ▼
                                       dbt-duckdb ──► Gold
                                              │
                                              ▼
                                  El mapa de los perdidos
```

El mundo no se guarda: es una función de `seed` y coordenadas. Con los eventos alcanza para reconstruir el mapa de cualquier partida.

## Estado
- [x] F0 Investigación de repos → [docs/RELEVAMIENTO.md](docs/RELEVAMIENTO.md). Motor: TypeScript + Vite + Three.js
- [x] F1 Juego jugable
  - [x] F1a Generador `world/` (port de TediusTimmy con seed y `world_v`) + render Three.js con teclado y táctil
  - [x] F1b Worker, puertas de capa, laberinto que cambia, La Interferencia, audio y eventos a consola
  - [x] F1c Noclip al Nivel 1 (Habitable Zone) con el mismo `world/` y otros parámetros
  - [x] F1d Noclip más frecuente y visible, llegada segura, cuerpo y grito nuevos de La Interferencia
- [ ] F2 Contrato + collector + Redpanda
- [ ] F3 Procesamiento (Bronze / Silver)
- [ ] F4 Gold con dbt
- [ ] F5 El mapa de los perdidos
- [ ] F6 Mobile y deploy

## Correr
Requiere Node 20 o más nuevo.

```bash
npm install
npm run dev        # juego en http://localhost:5173 (también expuesto en la red local, para probar en el celu)
npm test           # tests: generador (determinismo, costuras, golden), oído, director, colisión y puertas
npm run build      # typecheck + build estático en dist/
```

- **Seed**: `?seed=123` en la URL (entero de 0 a 4294967295). Sin seed se sortea una y queda escrita en la URL:
  recargar da el mismo mundo.
- **Desktop**: click para entrar, WASD o flechas, mouse para mirar (si el navegador niega el pointer lock, se mira
  arrastrando), Shift para correr, C para caminar en silencio, Esc para pausar.
- **Celu**: mitad izquierda = joystick analógico (poco recorrido = en silencio, a fondo = corre), mitad derecha = mirar.
- El HUD muestra seed, `world_v`, nivel, zona, capa y celda global. Con `?debug=1` suma ms por frame, draw calls y el
  estado del director. Solo para revisar: `?debug=1&nivel=1` arranca en el Nivel 1 y `?debug=1&caza=1` arranca con
  La Interferencia cazando (no emite `persecucion_inicio`). Los eventos de una partida con `debug` llevan
  `client.debug: true`.
- Los eventos salen a la consola del navegador como `[evento] {…}` (en F2 van al collector).

Estructura:
```
world/   generador puro (sin DOM ni Three): zonas de 256×256 celdas, World con caché, getStart(seed)
game/    render Three.js por bloques de 16×16 celdas, input, colisión, texturas procedurales
  zone-worker.ts, zones.ts   generación de zonas en un Web Worker, con precarga de vecinas y capas cercanas
  shifter.ts                 bloques fuera de vista que toman su interior de otra capa (bordes fijos)
  entity/                    La Interferencia: oído y director (de liminal, MIT) + movimiento y silueta propios
  audio.ts                   zumbido, pasos, respiración y estática, todo sintetizado con WebAudio
  events.ts                  eventos con el contrato borrador
```

### Cómo se juega
- **Puertas de capa**: los marcos con hueco oscuro llevan a otra capa del mundo (z ± 1). Del otro lado está la misma
  puerta, pero volver por ella no siempre te deja donde estabas.
  La Interferencia tarda unos segundos (4–7 s) en encontrarte en la capa nueva y vuelve más lejos.
- **El laberinto cambia**: cada 15–30 s, un bloque de 16×16 celdas que no estás mirando cambia su interior. Antes de
  aplicar el cambio se verifica que no te deje encerrado.
- **La Interferencia** no te ve: te oye. Caminar se oye de cerca, correr desde lejos y caminar en silencio no se oye.
  Las paredes atenúan el ruido. Cuando acecha, las luces titilan; si te caza, corré o escondete en silencio.
  Una cacería dura hasta 30 s; si no te atrapa, se retira.
  Es un humanoide estirado y flaco, de brazos que le pasan las rodillas y cabeza sin rasgos, hecho de carne podrida y
  estática. Cuando te caza, **grita**: un alarido sintético en tritono con quiebres de voz, gruñido, feedback de
  radio y zumbido eléctrico. Una sola variable de proximidad maneja el grito y el cuerpo: al acercarse, el grito se
  agudiza, se desafina y se satura, y el cuerpo se deforma, se desgarra en bandas y salta, con los cortes del audio y de
  la imagen sincronizados.
- **Noclip**: algunas paredes del Nivel 0 (≈ 1 de cada 300, siempre las mismas para una seed) titilan con destellos que
  atraviesan la niebla. Si te metés en una, caés al **Nivel 1**, en la misma posición y capa; si ahí hay una pared, un
  pilar o una celda encerrada, aparecés en la celda caminable más cercana. Las puertas siguen siendo el cambio de capa
  dentro de un nivel.
- **Nivel 1 — Habitable Zone** ([wiki](https://backrooms-wiki.wikidot.com/level-1), CC BY-SA 3.0): un
  estacionamiento subterráneo infinito. Techo bajo, grilla regular de pilares cuadrados con códigos pintados, muy
  pocas paredes, cemento liso con líneas de cajones, filas de tubos fluorescentes (algunos muertos, otros titilando),
  caños y bandejas de cables, y charcos que reflejan los tubos (un reflejo falso, sin costo en el celu). Es **zona
  segura**: La Interferencia no aparece, y si te venía cazando, el noclip cuenta como escape. Se oye goteo lejano,
  el zumbido de los tubos y algún golpe en las cañerías. No tiene puertas de capa ni noclip (por ahora es el último
  nivel).
- **Puerta de capa o noclip**: la puerta es un hueco angosto y negro con marco de madera clara; la pared de noclip es
  el paño entero, con bandas de estática y color que se corren, destellos y transparencias.

### Eventos (contrato borrador)
Comunes: `event_id`, `ts` (UTC), `session` (UUID por partida), `seed`, `world_v`, `level`, `type`, `x`, `y`
(celda global con decimales), **`z`** (capa; propuesta nueva para el contrato), `client` (`platform`, `version`,
`debug`), `data`. `world_v` es 3 desde que el Nivel 1 pasó a ser un estacionamiento.

| `type` | `data` |
|---|---|
| `sesion_inicio` / `sesion_fin` | `zona` / `motivo` (`captura` o `salida`) |
| `posicion` (cada 2 s) | `velocidad`, `humor` de la entidad |
| `zona_cambio` | `zona` (`x,y,capa`), `via` (`caminando` o `puerta`) |
| `laberinto_cambio` | `bloque_x`, `bloque_y`, `bloque_lado`, `capa_antes`, `capa_despues` |
| `aparicion` / `deteccion` | `distancia_m` (`null` si la entidad todavía no volvió después de una puerta) |
| `persecucion_inicio` | `persecucion_id`, `distancia_m` |
| `escape` / `captura` | `persecucion_id`, `duracion_s`; `escape` suma `via` (`retirada` o `noclip`), `captura` suma `humor` |
| `noclip` | `nivel_origen`, `nivel_destino` (el campo común `level` es el de origen; los eventos siguientes ya llevan el de destino) |

`zona_cambio.via` también puede ser `noclip`.

## Créditos
El generador del mundo es un port del de [TediusTimmy/BackRooms](https://github.com/TediusTimmy/BackRooms)
(Thomas DiModica, BSD-3-Clause). El oído y el director de La Interferencia parten de
[liminal](https://github.com/yerdaulet-damir/liminal) (MIT). Lore comunitario bajo CC BY-SA 3.0.
Detalle completo en [docs/ATRIBUCIONES.md](docs/ATRIBUCIONES.md).
