# CLAUDE.md — backrooms-streaming-redpanda

## Qué es
Proyecto de portfolio de Data Engineering con forma de juego: un Backrooms jugable (web primero, después celu)
armado a partir de lo que ya existe en repos públicos, al que le sumamos ingeniería: cada jugador genera eventos
reales que viajan por un pipeline de streaming.

No reinventamos el juego: partimos de **TediusTimmy/BackRooms** y de lo mejor de otros repos públicos y gratuitos,
y nuestro aporte es la integración, el port a herramientas de juego modernas y la capa de datos.

Idioma del proyecto: español (textos, docs y commits).

## Reglas duras
1. **Licencias primero.** Antes de reutilizar código de cualquier repo, verificar su archivo LICENSE.
   - MIT / Apache / BSD / zlib: se puede usar, conservando el aviso de copyright.
   - GPL: se puede usar, pero el proyecto entero pasa a GPL. Consultarme antes.
   - Sin licencia o no comercial (PolyForm NC, CC BY-NC): **no se copia código**. Se estudia la idea y se reimplementa, o se le pide permiso al autor.
   - Todo lo reutilizado va en `docs/ATRIBUCIONES.md` con autor, repo, licencia y qué se tomó.
2. **IP de terceros.** Nada de la serie de Kane Pixels, *Escape the Backrooms* ni la película (diseños, nombres, sonidos, música). Las entidades del juego son propias.
3. **Lore comunitario con atribución.** Lo tomado de las wikis de Backrooms (Wikidot / Fandom, CC BY-SA 3.0) se cita con la URL exacta en `docs/ATRIBUCIONES.md`.
4. **Datos reales siempre.** Nada de eventos simulados para llenar dashboards.
5. **Privacidad.** IDs de sesión anónimos. No guardar IP ni datos personales.
6. **Costo cero.** Todo local en Docker hasta la fase de deploy.
7. **Paso por paso.** Una fase por vez, con su criterio de aceptación cumplido. No adelantar fases.
8. **Economía de tokens.** Al investigar repos, leer README, LICENSE y los archivos clave; no volcar repos enteros.

## Stack de datos (decidido)
| Capa | Elección |
|---|---|
| Ingesta | Collector FastAPI que valida el contrato de eventos |
| Streaming | Redpanda (Kafka API) + Redpanda Console, en Docker |
| Procesamiento | Consumer en Python → Parquet (Bronze / Silver) |
| Modelado | dbt-duckdb (Gold + tests) |
| Dashboard | "El mapa de los perdidos": heatmap de rastros, capturas y escapes |

Stack del juego (decidido en F0, ver `docs/RELEVAMIENTO.md`): **TypeScript + Vite + Three.js**. El generador vive en
`world/` como módulo puro (sin DOM ni Three), port del de TediusTimmy con la `seed` metida en el hash y versionado con
`world_v`. Los avisos de copyright de lo portado van en la cabecera de cada archivo y en `third_party/`.

## Fases
**F0 — Investigación de repos.** Clonar en `research/` (fuera de git) y analizar:
- TediusTimmy/BackRooms (base principal): cómo genera el laberinto, el hash, las zonas, cómo cambia la geometría.
- Repos del topic `backrooms` en GitHub y otros públicos relevantes: AgenteMaxo/backrooms-noclip, yerdaulet-damir/liminal,
  aebrer/deep-yellow, ViciousSquid/Fio, zodiepupper/backrooms, bbKurt11/backrooms-vr-quest3, más los que encuentres.
Entregable: `docs/RELEVAMIENTO.md` con una tabla por repo (autor, motor/lenguaje, licencia, qué tiene de bueno, qué se puede reutilizar
y cómo) y una propuesta de motor para el port (web y celu). **Frenar acá y esperar mi revisión.**

**F1 — Juego jugable.** Port/integración según lo que decida en F0. Criterio: corre en desktop y celu, misma seed = mismo mundo.
**F2 — Contrato + collector + Redpanda.** `contracts/event.schema.json`, collector, tópicos `backrooms.eventos` y `backrooms.eventos.dlq` (el juego tiene más de un nivel), envío en batch desde el juego.
Criterio: `docker compose up` + jugar = eventos en Redpanda Console.
**F3 — Procesamiento.** Bronze (crudo) y Silver (sesiones, persecuciones con duración y resultado) en Parquet/DuckDB.
**F4 — Gold con dbt.** *Pendiente, post-Halloween (F5 se adelantó con un Gold liviano exportado por el consumer).* Sesiones, supervivencia en persecuciones, zonas más letales, tests de contrato. Criterio: `dbt build` verde.
**F5 — El mapa de los perdidos.** Reconstruye el mundo desde `seed` + versión del generador y pinta el heatmap.
**F6 — Mobile y deploy.** PWA / app y hosting de la ingesta pública. Recién acá se habla de nube.

## Contrato de eventos (v1, cerrado en F2)
Fuente de verdad: `contracts/event.schema.json` (estricto: campos de más o con otro tipo van a la DLQ con el motivo).
Comunes: `event_id`, `ts` (UTC), `session` (anónimo), `seed`, `world_v` (versión del generador), `level` (0 o 1), `type`,
`x`, `y` (celda global), `z` (capa), `client` (`platform`, `version`, `debug`), `data` (según `type`).
Tipos: `sesion_inicio`, `sesion_fin`, `posicion`, `zona_cambio`, `laberinto_cambio`, `aparicion`, `deteccion`,
`persecucion_inicio`, `escape`, `captura`, `noclip`. Tópicos: `backrooms.eventos` (key = `session`) y
`backrooms.eventos.dlq`. Entrega at-least-once: deduplicar por `event_id`. Cambiar el contrato = tocar el schema, los
tipos de `game/events.ts` y `contracts/examples/` a la vez (los tests de los dos lados lo verifican).

## Convenciones
- Commits en español, chicos, uno por cambio lógico.
- `.env.example` siempre, nada de secretos.
- Cada fase cierra actualizando `README.md` con cómo correrla.
