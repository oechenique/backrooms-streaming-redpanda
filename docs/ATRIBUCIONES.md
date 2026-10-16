# Atribuciones y agradecimientos

Licencias verificadas en la F0 (2026-10-16) leyendo el archivo LICENSE y las cabeceras de los fuentes de cada repo.
Detalle del análisis en [RELEVAMIENTO.md](RELEVAMIENTO.md).

## Código reutilizado

Los textos de licencia completos están en [`third_party/`](../third_party/). Cada archivo portado conserva en su
cabecera el aviso de copyright original, más una línea que indica de qué archivo viene y qué se cambió.

| Origen | Autor | Licencia | Qué se toma | Dónde va | Aviso |
|---|---|---|---|---|---|
| [TediusTimmy/BackRooms](https://github.com/TediusTimmy/BackRooms) (`MazeGen8.cpp`, `Zone.h`), commit `2ed8214` | Thomas DiModica | BSD-3-Clause (cabecera en los fuentes; el repo no tiene archivo LICENSE) | Generador de zonas: hash `Mix`, RNG por borde para que las zonas vecinas coincidan, oficinas, relleno DFS, conectividad, aberturas de borde, puertas que cambian de capa | `world/` (F1) | [`third_party/TediusTimmy-BackRooms.LICENSE.txt`](../third_party/TediusTimmy-BackRooms.LICENSE.txt) |
| [yerdaulet-damir/liminal](https://github.com/yerdaulet-damir/liminal) (`shared/src/hearing.ts`, `shared/src/director.ts`), commit `ff9ee5b` | Liminal contributors | MIT | Base del oído de La Interferencia (ruido por velocidad, atenuación por distancia y paredes) y del director de estados `calm/stalk/hunt/retreat` | `game/` (F1) | [`third_party/liminal.LICENSE.txt`](../third_party/liminal.LICENSE.txt) |

Cambios previstos sobre el código de TediusTimmy: la `seed` entra en el hash de cada zona (en el original solo
elige la zona inicial), el algoritmo se versiona con `world_v`, y se porta de C++ a TypeScript.

Algoritmos de dominio público que usa el generador (no requieren aviso; se citan por honestidad):
- Finalizador de bits de David Stafford, variante 13 (`StaffordMix.h`, "No rights applicable") —
  https://zimbry.blogspot.com/2011/09/better-bit-mixing-improving-on.html
- LCG de 48 bits de `java.util.Random` (`JAVA.h`, "No rights applicable").

No se toma el motor de render de TediusTimmy (`olcPixelGameEngine`, `olcPGEX_RayCastWorld`, licencia OLC-3 de
OneLoneCoder / David Barr): se reemplaza por Three.js.

Pendiente: escribirle a Thomas DiModica para contarle que el generador del juego es un port del suyo y agradecerle.

## Lore
- The Backrooms Wiki (Wikidot) — https://backrooms-wiki.wikidot.com — contenido bajo CC BY-SA 3.0.
- The Backrooms Wiki (Fandom) — https://backrooms.fandom.com — contenido bajo CC BY-SA 3.0.
  Cada nivel o concepto tomado de ahí se lista abajo con su URL exacta.

| Elemento del juego | Página fuente | Licencia |
|---|---|---|
| Nivel 0 (concepto general) | https://backrooms-wiki.wikidot.com/level-0 | CC BY-SA 3.0 |

## Repos de referencia (se estudian, no se copia código)

| Repo | Qué aporta como referencia | Licencia | ¿Se puede copiar código? |
|---|---|---|---|
| [pablostanley/vackrooms](https://github.com/pablostanley/vackrooms) | Bloques con huecos de borde compartidos, regeneración de zonas fuera de vista, versionado del generador | MIT (el código); dos grabaciones de audio de terceros quedan fuera | Sí, con aviso (no se tomó nada todavía) |
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
