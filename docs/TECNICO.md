# Detalle técnico

Todo lo que no entra en el [README](../README.md): cómo correr cada parte, Bronze, Silver y Gold, el contrato de eventos y cómo se juega.

## Estado
- [x] F0 Investigación de repos → [RELEVAMIENTO.md](RELEVAMIENTO.md). Motor: TypeScript + Vite + Three.js
- [x] F1 Juego jugable
  - [x] F1a Generador `world/` (port de TediusTimmy con seed y `world_v`) + render Three.js con teclado y táctil
  - [x] F1b Worker, puertas de capa, laberinto que cambia, La Interferencia, audio y eventos a consola
  - [x] F1c Noclip al Nivel 1 (Habitable Zone) con el mismo `world/` y otros parámetros
  - [x] F1d Noclip más frecuente y visible, llegada segura, cuerpo y grito nuevos de La Interferencia
- [x] F2 Contrato + collector + Redpanda
- [x] F3 Procesamiento (Bronze / Silver)
- [ ] F4 Gold con dbt — **pendiente, post-Halloween** (F5 se adelantó con un Gold liviano que exporta el consumer)
- [x] F5 El mapa de los perdidos
- [ ] F6 Mobile y deploy
  - [ ] **Antes de la telemetría pública:** investigar la pérdida de eventos de la sesión `b8a47ebd` (0.5.0, 29/10).
    Bronze tiene sus eventos solo hasta las 16:24:50 UTC; la grabación muestra después una persecución y una captura
    ("TE ENCONTRÓ") que nunca llegaron: ni persecución, ni captura, ni `sesion_fin`, nada en la DLQ, y el collector no
    recibió nada hasta la sesión siguiente. Mientras tanto, el % de captura de 0.5.0 puede estar subestimado.

## Correr
Requiere Node 20.19+ o 22.12+ y Docker (Docker Desktop en Windows/Mac).

```bash
docker compose up --build -d   # Redpanda + Console + collector + consumer (primera vez: baja imágenes y construye)
npm install
npm run dev                    # juego en http://localhost:5173 (también en la red local, para el celu)
npm run dash                   # el mapa de los perdidos en http://localhost:5174
```

Jugá un rato y mirá los eventos en **Redpanda Console**: http://localhost:8080 → Topics → `backrooms.eventos`
(los que no cumplen el contrato, con el motivo, en `backrooms.eventos.dlq`).

> Si Redpanda Console queda en blanco, es por una extensión del navegador que bloquea el portapapeles (en la consola
> del navegador aparece `Cannot assign to read only property 'writeText'`). Abrila en una ventana de incógnito, sin
> extensiones.

```bash
npm test           # tests TS: generador, oído, director, colisión, puertas, cola de envío y contrato
npm run build      # typecheck + build estático en dist/
npm run dash:build # el mapa, estático en dist-dashboard/ (lee /gold/: servilo con `vite preview --config dashboard/vite.config.ts`)
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
  [`consumer/silver.sql`](../consumer/silver.sql). Las partidas con `client.debug` quedan en Bronze pero no pasan a Silver.

| Tabla | Qué tiene |
|---|---|
| `eventos` | eventos únicos por `event_id` (gana la primera copia en Kafka), con columnas tipadas y `data` como JSON |
| `sesiones` | inicio, fin, `duracion_s`, `distancia_m` (tramos dentro del mismo nivel y capa; celda = 2.2 m), `niveles_visitados`, `como_termino` (`captura`, `salida` o `sin_cierre` si no llegó `sesion_fin`), conteos de persecuciones por resultado y noclips |
| `persecuciones` | inicio, fin, `duracion_s`, `resultado` (`escape` con su `via`, `captura`, `perdida` = pérdida de rastro: sin cierre en una sesión que ya cerró, o `en_curso`: sin cierre y la sesión sigue abierta), distancia inicial, celdas de inicio y fin |
| `noclips` | origen, destino, celda y, si fue un escape, el `persecucion_id` |

Cada vez que reconstruye Silver, el consumer exporta además un **Gold liviano** en `data/gold/` (así el mapa no abre
la base mientras se reemplaza): `index.json` con el resumen por mundo (seed + `world_v`), `mapa/<seed>-v<world_v>.json`
con los rastros por celda (los tramos entre eventos seguidos se rellenan) y las marcas por capa, y los mismos datos en
`rastros.parquet`, `marcas.parquet` y `resumen.parquet`. El % de captura es sobre las persecuciones terminadas.

Consultas (en el contenedor, en solo lectura):
```bash
docker compose exec consumer python consulta.py                        # sesiones y persecuciones
docker compose exec consumer python consulta.py "SELECT * FROM noclips"
```
Cambiar `CONSUMER_GROUP` en `.env` (o, con el consumer parado, borrar `./data` y el grupo con
`docker compose exec redpanda rpk group delete backrooms-consumer`) relee los tópicos desde el principio.

### El mapa de los perdidos (F5)
`npm run dash` → http://localhost:5174. Elegís seed (por defecto la del día; si nadie la jugó, la última jugada), nivel
y capa. El laberinto se reconstruye en el navegador con `world/`, el mismo generador del juego, solo si el `world_v`
de los datos es el actual (si no, se ven los rastros sin paredes y un aviso). Encima: heatmap de rastros, capturas (✕),
escapes (▲) y noclips (◆), con tooltip y una tabla de marcas; arriba, sesiones, persecuciones, % de captura y duración
media de la sesión. Se arrastra, se hace zoom con la rueda o pellizcando, y la URL guarda seed, nivel y capa. Muestra
la capa tal como la genera el mundo: los bloques que cambian durante la partida (`laberinto_cambio`) no se reflejan.
Lee solo `/gold/*.json`: el servidor de Vite no expone Bronze ni Silver.

Debajo de los contadores, el **% de captura por versión del cliente** (todas las seeds) compara el balance antes y
después de cada cambio; `consulta.py` muestra la misma tabla. `client.version` sube con cada cambio de balance.

Las limitaciones conocidas del mapa están en el [README](../README.md#limitaciones-conocidas).

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
- En un build (`npm run build`, el deploy de Vercel) los eventos van a `VITE_COLLECTOR_URL` + `/events`; sin esa
  variable la telemetría queda apagada y el HUD de debug dice "telemetría apagada". `npm run dev` usa siempre el proxy.

- **Seed**: `?seed=123` en la URL (entero de 0 a 4294967295). Sin seed se juega la **seed del día** (hash de la fecha
  UTC, `daySeed` en `world/`): todos los que entran ese día caen en el mismo mundo.
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
consumer/    Redpanda → Bronze (Parquet) → Silver (DuckDB) → Gold liviano (JSON / Parquet)
dashboard/   el mapa de los perdidos: world/ en canvas 2D + Gold
```

### Cómo se juega
- **Puertas de capa**: los marcos con hueco oscuro llevan a otra capa del mundo (z ± 1). Del otro lado está la misma
  puerta, pero volver por ella no siempre te deja donde estabas.
  La Interferencia tarda unos segundos (4–7 s) en encontrarte en la capa nueva y vuelve más lejos.
- **El laberinto cambia**: cada 15–30 s, un bloque de 16×16 celdas que no estás mirando cambia su interior. Antes de
  aplicar el cambio se verifica que no te deje encerrado.
- **La Interferencia** no te ve: te oye. Caminar se oye de cerca, correr desde lejos y caminar en silencio no se oye.
  Las paredes atenúan el ruido. Cuando acecha, las luces titilan; si te caza, corré o escondete en silencio.
  Una cacería dura hasta 30 s; si no te atrapa, se retira. Nunca arranca a menos de 10 m: si te descubre más cerca,
  la señal la corre hacia atrás, así el titileo de las luces avisa antes de que llegue. Cazando va a 2,6 m/s;
  corriendo vas a 3,4 m/s (desde el cliente 0.5.0; antes arrancaba a cualquier distancia y cazaba a 2,9 m/s).
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

