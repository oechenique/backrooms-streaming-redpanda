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
- [ ] F2 Contrato + collector + Redpanda
- [ ] F3 Procesamiento (Bronze / Silver)
- [ ] F4 Gold con dbt
- [ ] F5 El mapa de los perdidos
- [ ] F6 Mobile y deploy

## Correr
Se completa al cerrar cada fase. La F0 no tiene nada para correr: su entregable es el relevamiento.

## Créditos
El generador del mundo es un port del de [TediusTimmy/BackRooms](https://github.com/TediusTimmy/BackRooms)
(Thomas DiModica, BSD-3-Clause). El oído y el director de La Interferencia parten de
[liminal](https://github.com/yerdaulet-damir/liminal) (MIT). Lore comunitario bajo CC BY-SA 3.0.
Detalle completo en [docs/ATRIBUCIONES.md](docs/ATRIBUCIONES.md).
