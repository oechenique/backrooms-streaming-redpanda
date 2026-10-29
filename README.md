# backrooms-streaming-redpanda

Un Backrooms jugable donde cada paso, cada persecución y cada vez que te atrapan es un evento que viaja por un pipeline de streaming.

**La Interferencia** vive en la señal: no te ve, te oye. Si corrés, te encuentra.

## Cómo funciona
```
Juego (navegador / celu)
   │  eventos en batch (JSON, contrato v1)
   ▼
Collector FastAPI ── inválidos ──► backrooms.eventos.dlq
   │  válidos
   ▼
Redpanda ── backrooms.eventos
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
- [x] F2 Contrato + collector + Redpanda
- [x] F3 Procesamiento (Bronze / Silver)
- [ ] F4 Gold con dbt
- [ ] F5 El mapa de los perdidos
- [ ] F6 Mobile y deploy

## Correr
Requiere Node 20 o más nuevo y Docker (Docker Desktop en Windows/Mac).

```bash
docker compose up --build -d   # Redpanda + Console + collector + consumer (primera vez: baja imágenes y construye)
npm install
npm run dev                    # juego en http://localhost:5173 (también en la red local, para el celu)
```

Jugá un rato y mirá los eventos en **Redpanda Console**: http://localhost:8080 → Topics → `backrooms.eventos`
(los que no cumplen el contrato, con el motivo, en `backrooms.eventos.dlq`).

> Si Redpanda Console queda en blanco, es por una extensión del navegador que bloquea el portapapeles (en la consola
> del navegador aparece `Cannot assign to read only property 'writeText'`). Abrila en una ventana de incógnito, sin
> extensiones.

```bash
npm test           # tests TS: generador, oído, director, colisión, puertas, cola de envío y contrato
npm run build      # typecheck + build estático en dist/
docker compose down            # apaga todo (los eventos quedan en el volumen; `down -v` los borra)
```

Tests del collector y del consumer (Python 3.12; lo mismo en `consumer/`):
```bash
cd collector
py -3.12 -m venv .venv          # en Linux/Mac: python3.12 -m venv .venv
.venv/Scripts/pip install -r requirements-dev.txt   # Linux/Mac: .venv/bin/pip
.venv/Scripts/python -m pytest -q
```

Puertos y tópicos se cambian copiando `.env.example` a `.env`.

### Bronze y Silver (F3)
El servicio `consumer` lee `backrooms.eventos` y `backrooms.eventos.dlq` y deja todo en `./data`:
```
data/bronze/eventos/fecha=AAAA-MM-DD/nivel=N/p<partición>-<offset inicial>-<offset final>.parquet   (fecha UTC del evento)
data/bronze/dlq/fecha=AAAA-MM-DD/…parquet                                                            (fecha de recepción)
data/silver/backrooms.duckdb
```
- **Bronze** es crudo: el JSON tal cual llegó (`valor`) más tópico, partición, offset, key y los headers `recibido` y
  `contrato`. Lee en lotes (hasta 1000 mensajes o 5 s), escribe y **recién después hace commit de los offsets**. Si
  se cae en el medio, relee el lote y pisa los mismos archivos.
- **Silver** se reconstruye entero desde Bronze (como mucho cada 10 s si hay datos nuevos) con
  [`consumer/silver.sql`](consumer/silver.sql). Las partidas con `client.debug` quedan en Bronze pero no pasan a Silver.

| Tabla | Qué tiene |
|---|---|
| `eventos` | eventos únicos por `event_id` (gana la primera copia en Kafka), con columnas tipadas y `data` como JSON |
| `sesiones` | inicio, fin, `duracion_s`, `distancia_m` (tramos dentro del mismo nivel y capa; celda = 2.2 m), `niveles_visitados`, `como_termino` (`captura`, `salida` o `sin_cierre` si no llegó `sesion_fin`), conteos de persecuciones por resultado y noclips |
| `persecuciones` | inicio, fin, `duracion_s`, `resultado` (`escape` con su `via`, `captura` o `perdida` = pérdida de rastro: sin cierre, termina en la próxima persecución o el fin de la sesión), distancia inicial, celdas de inicio y fin |
| `noclips` | origen, destino, celda y, si fue un escape, el `persecucion_id` |

Consultas (en el contenedor, en solo lectura):
```bash
docker compose exec consumer python consulta.py                        # sesiones y persecuciones
docker compose exec consumer python consulta.py "SELECT * FROM noclips"
```
Cambiar `CONSUMER_GROUP` en `.env` (o, con el consumer parado, borrar `./data` y el grupo con
`docker compose exec redpanda rpk group delete backrooms-consumer`) relee los tópicos desde el principio.

### Cómo viajan los eventos
```
juego ──(cada 2 s, lote JSON; sendBeacon al cerrar)──► /api/events (proxy de Vite, sin X-Forwarded-For)
      ──► collector :8000 ── valida cada evento contra contracts/event.schema.json
                           ├─ válido   ──► backrooms.eventos      (key = session, header recibido)
                           └─ inválido ──► backrooms.eventos.dlq  (motivo + evento original)
```
- Si el collector o Redpanda no responden, el juego sigue: los eventos quedan en una cola (también en localStorage) y
  se reintentan con espera creciente (2 s … 30 s). Con `?debug=1` el HUD muestra el tamaño de la cola.
- Entrega **at-least-once**: un evento puede llegar dos veces; se deduplica por `event_id` en Silver.
- Privacidad: el collector corre sin access log y el proxy no agrega la IP.

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
  events.ts                  eventos con el contrato v1
collector/   FastAPI: valida contra contracts/ y publica en Redpanda
consumer/    Redpanda → Bronze (Parquet) → Silver (DuckDB)
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

### Eventos (contrato v1: `contracts/event.schema.json`)
Comunes: `event_id`, `ts` (UTC), `session` (UUID por partida), `seed`, `world_v`, `level`, `type`, `x`, `y`
(celda global con decimales), `z` (capa), `client` (`platform`, `version`, `debug`), `data`. Todos obligatorios; un
campo de más manda el evento a la DLQ. `world_v` es 3 desde que el Nivel 1 pasó a ser un estacionamiento.
Ejemplos válidos e inválidos en `contracts/examples/`.

| `type` | `data` |
|---|---|
| `sesion_inicio` / `sesion_fin` | `zona` / `motivo` (`captura` o `salida`) |
| `posicion` (cada 2 s) | `velocidad`, `humor` de la entidad |
| `zona_cambio` | `zona` (`x,y,capa`), `via` (`caminando`, `puerta` o `noclip`) |
| `laberinto_cambio` | `bloque_x`, `bloque_y`, `bloque_lado`, `capa_antes`, `capa_despues` |
| `aparicion` / `deteccion` | `distancia_m` (`null` si la entidad todavía no volvió después de una puerta) |
| `persecucion_inicio` | `persecucion_id`, `distancia_m` |
| `escape` / `captura` | `persecucion_id`, `duracion_s`; `escape` suma `via` (`retirada` o `noclip`), `captura` suma `humor` |
| `noclip` | `nivel_origen`, `nivel_destino` (el campo común `level` es el de origen; los eventos siguientes ya llevan el de destino) |

## Créditos
El generador del mundo es un port del de [TediusTimmy/BackRooms](https://github.com/TediusTimmy/BackRooms)
(Thomas DiModica, BSD-3-Clause). El oído y el director de La Interferencia parten de
[liminal](https://github.com/yerdaulet-damir/liminal) (MIT). Lore comunitario bajo CC BY-SA 3.0.
Detalle completo en [docs/ATRIBUCIONES.md](docs/ATRIBUCIONES.md).
