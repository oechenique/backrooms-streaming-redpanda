# Atribuciones y agradecimientos

Licencias verificadas en la F0 (2026-10-16) leyendo el archivo LICENSE y las cabeceras de los fuentes de cada repo.
Detalle del análisis en [RELEVAMIENTO.md](RELEVAMIENTO.md).

## Código reutilizado

Los textos de licencia completos están en [`third_party/`](../third_party/). Cada archivo portado conserva en su
cabecera el aviso de copyright original, más una línea que indica de qué archivo viene y qué se cambió.

| Origen | Autor | Licencia | Qué se toma | Dónde va | Aviso |
|---|---|---|---|---|---|
| [TediusTimmy/BackRooms](https://github.com/TediusTimmy/BackRooms) (`MazeGen8.cpp`, `Zone.h`), commit `2ed8214` | Thomas DiModica | BSD-3-Clause (cabecera en los fuentes; el repo no tiene archivo LICENSE) | Generador de zonas: hash `Mix`, RNG por borde para que las zonas vecinas coincidan, oficinas, relleno DFS, conectividad, aberturas de borde, puertas que cambian de capa | `world/hash.ts`, `world/lcg.ts`, `world/zone.ts` (F1a) | [`third_party/TediusTimmy-BackRooms.LICENSE.txt`](../third_party/TediusTimmy-BackRooms.LICENSE.txt) |
| [yerdaulet-damir/liminal](https://github.com/yerdaulet-damir/liminal) (`shared/src/hearing.ts`, `shared/src/director.ts`), commit `ff9ee5b` | Liminal contributors | MIT | Base del oído de La Interferencia (ruido por velocidad, atenuación por distancia y paredes) y del director de estados `calm/stalk/hunt/retreat` | `game/entity/hearing.ts`, `game/entity/director.ts` (F1b) | [`third_party/liminal.LICENSE.txt`](../third_party/liminal.LICENSE.txt) |

Cambios sobre el código de TediusTimmy (F1a, `world_v = 1`; detalle en la cabecera de cada archivo):
- De C++ a TypeScript. El LCG de 48 bits opera en dos mitades de 24 bits, sin BigInt (idéntico bit a bit; hay test).
- La `seed` entra en el hash de cada zona (en el original solo elegía la zona inicial), junto con un tipo de RNG
  que separa costuras horizontales, verticales, puertas e interior. Eso arregla de paso la coincidencia en
  `(x, x+2)` que el autor deja anotada.
- Costuras norte/sur reordenadas para que la fila 255 de una zona comparta RNG con la fila 0 de la de abajo.
- `addOffices` abandona después de 10.000 intentos. En el original puede quedar en un bucle infinito: medido sobre
  100 zonas, el 11 % llega a ese tope.
- No se portan `MakeMap.h` (mapa en texto para el raycaster) ni `main.cpp`.

Algoritmos de dominio público que usa el generador (no requieren aviso; se citan por honestidad):
- Finalizador de bits de David Stafford, variante 13 (`StaffordMix.h`, "No rights applicable") —
  https://zimbry.blogspot.com/2011/09/better-bit-mixing-improving-on.html
- LCG de 48 bits de `java.util.Random` (`JAVA.h`, "No rights applicable").

No se toma el motor de render de TediusTimmy (`olcPixelGameEngine`, `olcPGEX_RayCastWorld`, licencia OLC-3 de
OneLoneCoder / David Barr): se reemplaza por Three.js.

Cambios sobre el código de liminal (F1b; aviso MIT completo en la cabecera de cada archivo):
- `hearing.ts`: `footstepNoise` y `heardLoudness` casi sin cambios; `wallsBetween` recorre nuestra grilla de celdas
  (DDA) en vez de su lista de cajas; sin micrófono; `SPRINT_SPEED` es nuestra velocidad de carrera.
- `director.ts`: misma máquina de estados y mismos valores; los umbrales de micrófono pasan a ser umbrales de ruido
  de pasos; un solo jugador.
- El movimiento de la criatura (búsqueda de caminos, bandas de distancia, reaparición) es propio
  (`game/entity/interferencia.ts`).

Pendiente: escribirle a Thomas DiModica para contarle que el generador del juego es un port del suyo y agradecerle.

## Lore
- The Backrooms Wiki (Wikidot) — https://backrooms-wiki.wikidot.com — contenido bajo CC BY-SA 3.0.
- The Backrooms Wiki (Fandom) — https://backrooms.fandom.com — contenido bajo CC BY-SA 3.0.
  Cada nivel o concepto tomado de ahí se lista abajo con su URL exacta.

| Elemento del juego | Página fuente | Licencia |
|---|---|---|
| Nivel 0 (concepto general) | https://backrooms-wiki.wikidot.com/level-0 | CC BY-SA 3.0 |
| Nivel 1 "Habitable Zone": salones amplios de concreto con pilares unidos por pasillos estrechos, charcos, caños en el techo, luz artificial escasa con cortes, ruidos en las cañerías; se llega desde el Nivel 0 haciendo noclip por una pared (`world/levels.ts`, `game/themes.ts`) | https://backrooms-wiki.wikidot.com/level-1 (autores: Praetor3005 y DivineAtlas; concepto original de EnderMitten; artículo original de u/ThePizzaEater1000; reescritura previa de etoisle) | CC BY-SA 3.0 |

Del Nivel 1 se toma la descripción como guía de diseño; no se copia texto ni imágenes ni música de la página (que
tienen licencias propias). Geometría, texturas y sonido son propios.

## Repos de referencia (se estudian, no se copia código)

| Repo | Qué aporta como referencia | Licencia | ¿Se puede copiar código? |
|---|---|---|---|
| [pablostanley/vackrooms](https://github.com/pablostanley/vackrooms) | Bloques con huecos de borde compartidos, regeneración de zonas fuera de vista, versionado del generador | MIT (el código); dos grabaciones de audio de terceros quedan fuera | Sí, con aviso. **Idea tomada sin código** (F1b): bloques fuera de vista que cambian con los bordes fijos (`game/shifter.ts`) |
| [tanuu5/sofa-ga-aru](https://github.com/tanuu5/sofa-ga-aru) | Texturas y audio 100 % procedurales | MIT | Sí, con aviso (no se tomó nada todavía) |
| [ViciousSquid/Fio](https://github.com/ViciousSquid/Fio) | Matemática de portales no euclidianos | MIT | Sí, con aviso (no se tomó nada todavía) |
| [zodiepupper/backrooms](https://github.com/zodiepupper/backrooms) | Generación procedural con seeds en Godot | MIT | Sí, con aviso (no se tomó nada todavía) |
| [wuisabel-gif/backroom_level_0](https://github.com/wuisabel-gif/backroom_level_0) | Ambiente de Level 0 en Three.js | Apache-2.0 (el código); música con derechos de terceros | Código sí, con aviso; assets no |
| [AgenteMaxo/backrooms-noclip](https://github.com/AgenteMaxo/backrooms-noclip) | Roguelike fiel al lore, en español; seeds por URL | PolyForm Noncommercial 1.0.0 | **No** |
| [aebrer/deep-yellow](https://github.com/aebrer/deep-yellow) | Mundo por bloques en Godot, densidad de piso | Sin licencia | **No** |
| [bbKurt11/backrooms-vr-quest3](https://github.com/bbKurt11/backrooms-vr-quest3) | Generador por grafo de salas, evento por sala visitada | Sin licencia | **No** |
| [fmatsch/the-backrooms-reddit](https://github.com/fmatsch/the-backrooms-reddit) | Raycaster en TS con controles táctiles, seed diaria compartida | Sin licencia | **No** |
| [lakshyabuilds/Quantum-Backrooms-Maze](https://github.com/lakshyabuilds/Quantum-Backrooms-Maze) | Paredes que cambian si no las mirás | Sin licencia | **No** |
| [kernelshreyak/backrooms-procedural](https://github.com/kernelshreyak/backrooms-procedural) | Salas vecinas con puertas compatibles | Sin licencia | **No** |

Descartados: [H1an1/backrooms](https://github.com/H1an1/backrooms) (MIT, pero copia mecánicas de la película →
regla 2) y [dabardibid/Budget-Backrooms](https://github.com/dabardibid/Budget-Backrooms) (GPL-3.0, UE4).

## Lo que es propio
- La entidad **La Interferencia** (diseño, nombre, comportamiento y sonido). El oído y el director parten del código
  MIT de liminal (ver arriba); la criatura y sus reglas son nuestras.
- Todo el audio (sintetizado en vivo).
- Texturas (procedurales).
- El motor de render (Three.js) y la integración con el pipeline de datos.
