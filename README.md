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
- [ ] F1 Juego jugable
  - [x] F1a Generador `world/` (port de TediusTimmy con seed y `world_v`) + render Three.js con teclado y táctil
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
npm test           # tests del generador: determinismo, costuras, conectividad, golden
npm run build      # typecheck + build estático en dist/
```

- **Seed**: `?seed=123` en la URL (entero de 0 a 4294967295). Sin seed se sortea una y queda escrita en la URL:
  recargar da el mismo mundo.
- **Desktop**: click para entrar, WASD o flechas, mouse para mirar, Shift para correr, Esc para salir.
- **Celu**: mitad izquierda de la pantalla = joystick (a fondo corre), mitad derecha = mirar.
- El HUD muestra seed, `world_v`, zona, capa y celda global.

Estructura:
```
world/   generador puro (sin DOM ni Three): zonas de 256×256 celdas, World con caché, getStart(seed)
game/    render Three.js por bloques de 16×16 celdas, input, colisión, texturas procedurales
```

Pendiente para F1b: cruzar las puertas que cambian de capa (hoy se ven como puertas cerradas), mutación de zonas
fuera de vista, La Interferencia y audio. La generación de zonas (≈ 20 ms) todavía corre en el hilo principal.

## Créditos
El generador del mundo es un port del de [TediusTimmy/BackRooms](https://github.com/TediusTimmy/BackRooms)
(Thomas DiModica, BSD-3-Clause). El oído y el director de La Interferencia parten de
[liminal](https://github.com/yerdaulet-damir/liminal) (MIT). Lore comunitario bajo CC BY-SA 3.0.
Detalle completo en [docs/ATRIBUCIONES.md](docs/ATRIBUCIONES.md).
