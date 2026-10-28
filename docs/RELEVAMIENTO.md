# Relevamiento de repos — Fase 0

Fecha: 2026-10-16. Repos clonados con `--depth 1` en `research/` (fuera de git). Se leyeron README, LICENSE y los
archivos clave de cada uno; no se volcaron repos enteros.

Licencias verificadas **leyendo el archivo LICENSE y las cabeceras de los fuentes**, no el campo que muestra GitHub
(la API devolvió "sin licencia" para varios que sí la tienen, y al revés).

## Resumen

| # | Repo | Motor / lenguaje | Licencia real | Veredicto |
|---|---|---|---|---|
| 1 | TediusTimmy/BackRooms | C++ · raycaster olcPixelGameEngine | **BSD-3-Clause** en los fuentes (sin archivo LICENSE) + OLC-3 en el motor | **Base**: se puede portar el generador con aviso |
| 2 | yerdaulet-damir/liminal | TypeScript · Three.js · Vite · PartyKit | MIT (assets CC0, ver NOTICE) | **Reutilizable**: oído de la criatura, director, tests de determinismo |
| 3 | pablostanley/vackrooms | TypeScript · Next.js · Three.js · Rapier · WebGPU/WebGL2 | MIT (código); audio con términos propios | **Reutilizable**: chunks con compuertas, mutación de zonas no vistas, versión del generador |
| 4 | tanuu5/sofa-ga-aru | JS vanilla · WebGL | MIT | **Reutilizable**: texturas y audio 100 % procedurales, sin archivos |
| 5 | ViciousSquid/Fio | Python · PyQt5 · PyOpenGL · NumPy | MIT | Solo ideas (desktop, no web) |
| 6 | zodiepupper/backrooms | Godot 4 · GDScript | MIT | Poco aporte (prototipo de 120 líneas) |
| 7 | wuisabel-gif/backroom_level_0 | Three.js · HTML | Apache-2.0 (código); música con derechos de terceros | Referencia visual; no tomar assets |
| 8 | AgenteMaxo/backrooms-noclip | JS vanilla · Canvas | **PolyForm Noncommercial 1.0.0** | **No copiar código**. Solo ideas |
| 9 | aebrer/deep-yellow | Godot 4 · GDScript | Sin licencia | Solo ideas |
| 10 | bbKurt11/backrooms-vr-quest3 | Unity 6 · C# · Quest 3 | Sin licencia | Solo ideas; usa estética del film (A24) → evitar |
| 11 | fmatsch/the-backrooms-reddit | TypeScript · Phaser 3 · raycaster | Sin licencia | Solo ideas (seed diaria compartida, controles táctiles) |
| 12 | lakshyabuilds/Quantum-Backrooms-Maze | Three.js | Sin licencia | Solo ideas (paredes que cambian si no las mirás) |
| 13 | kernelshreyak/backrooms-procedural | Godot 4.6 | Sin licencia | Solo ideas |
| 14 | H1an1/backrooms | Three.js · ES modules | MIT | **Evitar**: declara copiar mecánicas de la película de A24 (regla 2) |
| 15 | Simon-du06/wolf3D-backrooms | C · CSFML · raycaster | Sin licencia | Poco aporte |
| 16 | Serkali-sudo/the-backrooms-threejs | Three.js | Sin licencia; modelo de Sketchfab | Poco aporte |
| 17 | dabardibid/Budget-Backrooms | Unreal Engine 4 · C++ | GPL-3.0 | Descartado (niveles no procedurales, 3,7 GB, GPL) |

Búsqueda: topic `backrooms` en GitHub ordenado por estrellas (60 resultados). Se descartaron sin clonar los que no
son juegos o no aportan al port: mods de Minecraft/FiveM/CS2, gestores de saves de *Escape the Backrooms*,
subtítulos de la película, generadores de wallpapers, bots y datapacks. Varios de esos son además IP de terceros.

---

## 1. TediusTimmy/BackRooms — base principal

| Campo | Detalle |
|---|---|
| Autor | Thomas DiModica (generador y adaptación); motor de David Barr / javidx9 (OneLoneCoder) |
| Motor / lenguaje | C++17, `olcPixelGameEngine.h` + `olcPGEX_RayCastWorld.h`. ~1.250 líneas propias |
| Licencia | **No hay archivo LICENSE, pero `MazeGen8.cpp`, `MakeMap.h` y `Zone.h` llevan cabecera BSD-3-Clause** (© 2022 Thomas DiModica). `StaffordMix.h` y `JAVA.h` dicen "No rights applicable" (algoritmos públicos). `main.cpp` y la extensión del motor: OLC-3 (BSD-3 con otro nombre) |
| Último push | 2022-05-09, 0 estrellas |

**Cómo genera el laberinto** (`MazeGen8.cpp`):
- El mundo se divide en **zonas** de 256×256 celdas, direccionadas por `(x, y, z)` de 32 bits sin signo. Ninguna zona
  se guarda: se genera al vuelo y se cachea (LRU de 100 zonas en `main.cpp`).
- **Hash**: `Mix(a,b,c,d)` aplica el finalizador de Stafford (variante 13, el de `SplittableRandom` de Java) a cada
  coordenada y las combina por restas. El resultado siembra un **LCG de 48 bits de Java** (`JAVA.h`).
- **Varios RNG independientes por zona**: uno por cada borde (`left`, `right`, `up`, `down`), uno para puertas y uno
  para el interior. El RNG del borde derecho de la zona `x` usa `Mix(x, x+1, …)`, el mismo que el borde izquierdo de
  la zona `x+1` → **las dos zonas vecinas abren los mismos huecos sin conocerse**. Esa es la clave para que el mundo
  sea infinito y conexo.
- Interior: oficinas rectangulares (128–224 por zona, de 8–24 celdas), relleno con DFS (laberinto perfecto),
  `ensureConnectedness` (flood fill que abre paredes hasta conectar todo), 8–16 aberturas por borde y luego
  1.024–3.072 paredes extra abiertas para que no sea un laberinto perfecto (bucles).
- Capa `z = 0`: todo abierto (un salón infinito sin paredes).
- Tamaño: 2³² zonas × 256 celdas por lado ≈ 9 UA de lado según el autor.

**Cómo "cambia la geometría"**: no hay timer ni mutación. Hay **puertas-portal** (`u`, `U`, `d`, `D`) en paredes del
interior. El raycaster lleva un `Path` con la capa `z` **por rayo**: cuando un rayo atraviesa una puerta, sigue
viajando en otra capa `z±1`. Lo que ves a través de la puerta no coincide con lo que hay detrás de la pared. Al
cruzarla, el jugador pasa a esa capa. Es geometría no euclidiana barata, y solo es posible porque el render es un
raycaster 2,5D.

**Seed**: `getStart(time(nullptr))` usa la seed **solo para elegir la zona inicial y la posición**. Las zonas no
dependen de la seed: el mundo es uno solo para todos. Para nosotros la seed tiene que entrar en el hash.

**Qué se puede reutilizar y cómo**: el generador entero se puede **portar a TypeScript** (BSD-3 lo permite)
conservando el aviso de copyright de Thomas DiModica en el archivo portado y en `docs/ATRIBUCIONES.md`. Cambios
necesarios en el port: meter `seed` en `Mix`, reemplazar el LCG de 48 bits por uno que no necesite `BigInt` (o usar
`BigInt` solo al sembrar), y versionar el algoritmo (`world_v`). El motor OLC no se porta: se cambia de motor.

> ⚠️ `docs/ATRIBUCIONES.md` hoy dice que este repo "no tiene licencia publicada, así que no se copia". Eso no es
> exacto: el código del generador es BSD-3-Clause. Hay que corregir esa entrada (pendiente de tu OK).

---

## 2. yerdaulet-damir/liminal

| Campo | Detalle |
|---|---|
| Autor | "Liminal contributors" (yerdaulet-damir) |
| Motor / lenguaje | TypeScript estricto, monorepo pnpm: `client` (Three.js 0.169 + Vite), `shared` (lógica pura), `party` (servidor PartyKit en Cloudflare) |
| Licencia | MIT. `NOTICE`: assets de terceros CC0; algunas texturas generadas con IA para el proyecto |
| Último push | 2026-10-01, 3 estrellas |

**Qué tiene de bueno**:
- **La criatura caza por sonido**, igual que La Interferencia. `shared/src/hearing.ts` (78 líneas): ruido de pasos
  continuo en la velocidad (agacharse 0,2 = inaudible, caminar 0,4, correr 0,8), atenuación por distancia y por
  paredes (intersección segmento-AABB, tope de 2 paredes).
- **Director de IA** (`shared/src/director.ts`, ~100 líneas, estilo *Alien: Isolation*): estados
  `calm → stalk → hunt → retreat` con medidores de `menace` y `suspicion`. Esos estados mapean directo a nuestros
  eventos de aparición, detección, persecución, escape y captura.
- `generate(seed)` puro con **test de determinismo** que falla si aparece un `Math.random()` suelto.
- Privacidad bien resuelta: analítica opcional sin cookies, solo eventos explícitos (`PRIVACY.md`).

**Qué se puede reutilizar y cómo**: `hearing.ts` y `director.ts` como punto de partida de La Interferencia
(adaptados, con aviso MIT). El patrón de tests de determinismo. El multijugador y PartyKit no: no son parte del alcance.

> Nota (F1c, 2026-10-28): en la F0 no se registró que liminal tiene **cuatro niveles** (Lobby, Warehouse, Poolrooms,
> Dead Mall). Se revisó `party/src/levels.ts`: es solo una tabla de nombre + regla de la criatura por nivel; la
> geometría la arma su propio generador, que no es compatible con `world/`. No hay código para reutilizar en los
> niveles; el Nivel 1 se armó con el mismo `world/` y otros parámetros (`world/levels.ts`).

---

## 3. pablostanley/vackrooms

| Campo | Detalle |
|---|---|
| Autor | Pablo Stanley |
| Motor / lenguaje | TypeScript, Next.js 16, Three.js 0.186, Rapier (física), WebGPU con fallback WebGL2 |
| Licencia | MIT para el código. Audio: Kenney (CC0) + dos grabaciones de terceros fuera de la MIT |
| Último push | 2026-10, 21 estrellas. Online en vackrooms.vercel.app |

**Qué tiene de bueno**:
- Mundo infinito por **chunks** con **compuertas de borde** compartidas entre vecinos (la misma idea que TediusTimmy,
  en 3D) — `src/lib/game/maze.ts` (552 líneas): `hash(x, z, seed)`, `generateChunk`, `cellAt`, `canStand`.
- **"Las salas cambian cuando no las mirás"**: las secciones fuera de vista se regeneran a otra *profundidad*; los
  bordes y los landmarks quedan fijos para no romper la conectividad. Es la versión 3D del cambio de geometría y
  encaja con nuestro evento "cambio del laberinto".
- **Versiones del generador** documentadas (`docs/GENERATION-VERSIONS.md`): links con `tape` + `generation`,
  goldens de chunks para no romper mundos viejos. Es exactamente nuestro `world_v`.
- Audio espacial con oclusión trazada por paredes. Entidad que se congela si la mirás.

**Qué se puede reutilizar y cómo**: el esquema de compuertas + regeneración de zonas no vistas y el esquema de
versionado (código MIT, con aviso). No traer Next.js ni el pipeline WebGPU: es peso que no necesitamos y complica
celulares de gama baja. No tomar las dos grabaciones de audio sin licencia.

---

## 4. tanuu5/sofa-ga-aru

| Campo | Detalle |
|---|---|
| Autor | たぬ (tanuu5) |
| Motor / lenguaje | JavaScript vanilla, un `index.html` + módulos en `src/` (audio, director, lightmap, lights, input) |
| Licencia | MIT |
| Último push | 2026-10-05 |

**Qué tiene de bueno**: no usa ni un archivo de imagen ni de audio. Empapelado, alfombra, zumbido de los tubos,
pasos y música lejana son procedurales (canvas + WebAudio). Corre en GitHub Pages sin build.

**Qué se puede reutilizar y cómo**: técnicas de textura procedural y síntesis de audio (con aviso MIT). Encaja con
nuestra regla de audio sintetizado y texturas propias.

---

## 5. ViciousSquid/Fio

| Campo | Detalle |
|---|---|
| Autor | Rufus Pearce (ViciousSquid) |
| Motor / lenguaje | Python, PyQt5, PyOpenGL, NumPy, pygame-ce. Editor estilo Radiant/Hammer + runtime |
| Licencia | MIT (© 2025 Rufus Pearce) |
| Último push | 2026-10-16, 149 estrellas (el más popular del topic) |

**Qué tiene de bueno**: portales no euclidianos nativos (`engine/portal_transform.py`,
`engine/renderer/forward/portals.py`), generador procedural (`editor/procedural_map_gen.py`), ~300 tests.

**Qué se puede reutilizar y cómo**: solo como referencia de matemática de portales si algún día los hacemos en 3D.
Es desktop (PyQt + OpenGL de escritorio): no corre en navegador ni en celu.

---

## 6. zodiepupper/backrooms

| Campo | Detalle |
|---|---|
| Autor | zodiepupper |
| Motor / lenguaje | Godot 4, GDScript, con soporte XR |
| Licencia | MIT (© 2022) |

**Qué tiene de bueno**: carga y descarga de baldosas alrededor del jugador, sembrando el RNG con
`hash(coordenada + seed)`. Script de 120 líneas.

**Qué se puede reutilizar y cómo**: nada que no esté mejor resuelto en 1 y 3.

---

## 7. wuisabel-gif/backroom_level_0

| Campo | Detalle |
|---|---|
| Autor | Isabella Wu |
| Motor / lenguaje | Three.js + HTML/JS a mano, sin build |
| Licencia | Apache-2.0 para el código. La música es de un video de YouTube ("all rights to the original creator") |

**Qué tiene de bueno**: ambiente de Level 0 logrado con poco (tubos que parpadean, NPCs "errantes"). Lore citado de
las wikis con CC BY-SA.

**Qué se puede reutilizar y cómo**: nada de assets (modelos y música, ~900 MB). Ideas de iluminación.

---

## 8. AgenteMaxo/backrooms-noclip

| Campo | Detalle |
|---|---|
| Autor | MeltStudio (AgenteMaxo) |
| Motor / lenguaje | JavaScript vanilla + Canvas, sin dependencias; pipeline en Node |
| Licencia | **PolyForm Noncommercial 1.0.0** |
| Último push | 2026-07, 89 estrellas |

**Qué tiene de bueno**: está en español; un pipeline que baja 1.113 páginas de la wiki de Fandom y las parsea a un
grafo (734 niveles, 197 entidades); semillas reproducibles por URL (`?seed=`); auditoría de 100 semillas fijas como
test de regresión.

**Qué se puede reutilizar y cómo**: **ningún código** (regla 1). Ideas que reimplementamos desde cero: seed por URL y
auditoría de semillas fijas en CI. El lore lo tomamos directo de la wiki con su URL, no de su snapshot.

---

## 9. aebrer/deep-yellow

| Campo | Detalle |
|---|---|
| Autor | aebrer (en itch.io) |
| Motor / lenguaje | Godot 4, GDScript; roguelike por turnos en primera persona estilo PSX |
| Licencia | **Sin licencia** (solo `CREDITS.md` de assets de terceros, varios "not specified") |

**Qué tiene de bueno**: chunks de 128×128 con 8×8 subchunks, generación en un hilo aparte, semilla de chunk =
`hash(offset_x, offset_y, world_seed)`, generador de Level 0 por salas + corredores apuntando a 68–75 % de piso.

**Qué se puede reutilizar y cómo**: solo ideas (el objetivo de densidad de piso como test de calidad del laberinto,
generación fuera del hilo principal → en web sería un Web Worker).

---

## 10. bbKurt11/backrooms-vr-quest3

| Campo | Detalle |
|---|---|
| Autor | bbKurt11 |
| Motor / lenguaje | Unity 6, C#, XR Interaction Toolkit, Meta Quest 3 |
| Licencia | **Sin licencia** |

**Qué tiene de bueno**: generador por grafo de salas/pasillos/conectores con bucles "déjà-vu"; mapa en la muñeca que
se pinta a medida que explorás; `StatsManager` que dispara un evento `RoomMarked` por sala visitada.

**Qué se puede reutilizar y cómo**: solo la idea de evento por zona visitada (ya está en nuestro contrato). Declara
recrear la estética del film de A24 → no tomar nada visual.

---

## 11. fmatsch/the-backrooms-reddit

| Campo | Detalle |
|---|---|
| Autor | fmatsch |
| Motor / lenguaje | TypeScript, Phaser 3 + raycaster propio, Vite; port de su versión en Swift |
| Licencia | **Sin licencia** |

**Qué tiene de bueno**: prueba que un **raycaster en TS corre en celular** con controles táctiles en pantalla.
Seed diaria compartida (todos juegan el mismo mundo), resultado compartible estilo Wordle, audio WebAudio sintetizado.

**Qué se puede reutilizar y cómo**: solo ideas. La seed diaria es interesante para el mapa de los perdidos: muchos
jugadores en el mismo mundo = heatmap más denso.

---

## 12–16. Otros revisados

| Repo | Licencia | Qué aporta | Uso |
|---|---|---|---|
| lakshyabuilds/Quantum-Backrooms-Maze | Sin licencia | Three.js; paredes que se reconfiguran cuando no las mirás | Idea |
| kernelshreyak/backrooms-procedural | Sin licencia | Godot 4.6; vecindario de 3×3 salas con puertas compatibles | Idea |
| H1an1/backrooms | MIT | Three.js; plantas por división recursiva | **Evitar**: copia mecánicas de la película |
| Simon-du06/wolf3D-backrooms | Sin licencia | Raycaster en C, salas hechas a mano | Nada |
| Serkali-sudo/the-backrooms-threejs | Sin licencia | Demo con modelo horneado de Sketchfab | Nada |
| dabardibid/Budget-Backrooms | GPL-3.0 | UE4, niveles hechos a mano | Descartado (no se clonó completo: 3,7 GB) |

---

## Propuesta de motor para el port

### Recomendación: TypeScript + Vite + Three.js, con el generador como módulo puro

```
world/    generador puro en TS (port del de TediusTimmy, con seed y world_v). Sin DOM, sin Three.
game/     render Three.js + input (teclado/mouse y táctil) + audio WebAudio + La Interferencia
```

**Por qué**:
1. **Web y celu con un solo código.** Three.js con WebGL2 anda en cualquier navegador de celular de los últimos años.
   La PWA de F6 es agregarle un manifest y un service worker.
2. **Los dos mejores repos reutilizables ya son TS + Three.js** (liminal y vackrooms, ambos MIT). Podemos tomar
   código de ahí sin reescribirlo de otro lenguaje.
3. **El generador puro es lo que vuelve posible el resto del proyecto.** El mismo módulo `world/` lo usa el juego en
   F1 y el mapa de los perdidos en F5 para reconstruir cualquier partida desde `seed` + `world_v`. Si F5 termina en
   Python, se valida el port contra goldens generados por el módulo TS.
4. **Determinismo comprobable**: tests de golden por `(seed, world_v, zona)`, como hacen liminal y vackrooms.
5. **Costo cero y build liviano**: Vite sirve estático; nada de Next.js ni backend para el juego.

**Cómo se traduce el cambio de geometría de TediusTimmy a 3D**: los portales por rayo son baratos en un raycaster
y caros en 3D (stencil o render-to-texture por puerta, mal en celus de gama baja). Propuesta:
- **Base**: mutación de zonas fuera de vista estilo vackrooms (bordes fijos, interior regenerado a otra capa `z`).
  Cada mutación es un evento `cambio_laberinto` con la capa nueva, así el mapa la puede reconstruir.
- **Puertas-portal de TediusTimmy** como teletransporte a la capa `z±1` al cruzarlas, sin mostrar a través de ellas.
  Si después hay presupuesto de GPU, se prueba el render real del portal.

### Alternativas consideradas

| Opción | A favor | En contra |
|---|---|---|
| **Raycaster 2,5D en TS (Canvas/WebGL)** | Port 1:1 de TediusTimmy, portales gratis, livianísimo en celu (fmatsch lo prueba) | Look Wolfenstein; no se reutiliza nada de liminal/vackrooms; sin alturas ni luz real |
| **Godot 4 con export web** | Editor visual; deep-yellow, zodiepupper y kernelshreyak ya usan Godot | Export web pesado (decenas de MB de wasm), rendimiento flojo en navegadores de celu, el generador queda en GDScript y no se comparte con F5 |
| **Unity / Unreal** | Calidad visual | WebGL pesado, no es costo cero en tiempo, licencias de motor; descartado |
| **Phaser 3** | Bueno para 2D, buen soporte táctil | Para primera persona hay que escribir el raycaster igual |

**Plan B si Three.js no rinde en celus de gama baja en F1**: el mismo `world/` con un raycaster de fallback
(`?render=2d`), sin tocar el generador ni el contrato de eventos.

---

## Decisiones (revisión del 2026-10-16)

1. **Atribuciones corregidas.** TediusTimmy es BSD-3-Clause en los fuentes: el generador se porta conservando el
   aviso de copyright. `docs/ATRIBUCIONES.md` lista la licencia real de cada repo y los textos completos quedan en
   `third_party/`.
2. **Motor: TypeScript + Vite + Three.js**, con `world/` como módulo puro. **La seed entra en el hash de cada zona.**
   El cambio de geometría se resuelve con mutación de zonas fuera de vista más puertas que cambian de capa.
3. **La Interferencia** parte de `hearing.ts` y `director.ts` de liminal, con su aviso MIT.
4. Sigue pendiente escribirle a Thomas DiModica.

F0 cerrada. La F1 arranca en otra sesión.
