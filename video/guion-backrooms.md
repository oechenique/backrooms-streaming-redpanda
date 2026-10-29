# Guion: Backrooms + streaming

Voz: Enrique González (ElevenLabs) · voice ID `pC0w7bOSDTlgiOCrNBX3`
Formato: 16:9, ~3 min, narración sin texto en pantalla.

---

## Video de YouTube (~3 min)

### 1. Gancho (0:00–0:15)
**Clip:** pasillo amarillo del Nivel 0, las luces titilan, silencio y arranca el grito.
> Esta cosa no puede verte. Solo te escucha. Y cada paso que das, cada vez que corres y cada vez que te atrapa queda registrado en un pipeline de datos en tiempo real. Esta es la historia de cómo un chiste de Halloween terminó en un juego de verdad.

### 2. El origen (0:15–0:35)
**Clip:** caminata lenta por el laberinto, de noche.
> Todo empezó con una pregunta absurda: ¿se puede detectar un fantasma con la señal del wifi? Resulta que sí se puede detectar movimiento con wifi. Pero en vez de cazar fantasmas en mi casa, decidí meterme en el lugar más inquietante de internet: los Backrooms.

### 3. El repo olvidado (0:35–1:00)
**Clip:** el repo TediusTimmy/BackRooms en GitHub (0 estrellas, 0 forks), después el juego generando pasillos.
> Buscando proyectos abiertos encontré un repositorio de hace cuatro años. Tres commits. Cero estrellas. Nadie lo había visto. Su autor, Thomas DiModica, había resuelto algo brillante: el mundo no se guarda en ningún lado. Es una función de las coordenadas. Un laberinto que existe solo cuando lo miras: según sus propios cálculos, unas nueve unidades astronómicas por lado.

### 4. El port (1:00–1:25)
**Clip:** el juego en Three.js recorriendo pasillos, cruzando una puerta de capa.
> Revisé diecisiete repositorios, verifiqué cada licencia y porté su generador a TypeScript con Three.js. Le agregué una semilla para que cada mundo sea reproducible y una versión del generador. En el camino encontré que el original podía quedarse colgado: el once por ciento de las zonas nunca terminaba de generarse. Ahora tiene un límite.

### 5. La Interferencia (1:25–1:45)
**Clip:** una cacería: luces que titilan, silencio, grito, la silueta de estática acercándose.
> La criatura se llama La Interferencia. Su oído y su forma de cazar vienen de otro proyecto abierto, liminal. Si caminas en silencio, no te encuentra. Si corres, te escucha desde lejos. Y cuando las luces empiezan a parpadear, ya es tarde.

### 6. Noclip (1:45–1:55)
**Clip:** atravesar una pared que titila y aparecer en el estacionamiento; termina con la caminata tranquila por el estacionamiento.
> Si encuentras una pared rota, puedes atravesarla y caer al Nivel 1: un estacionamiento infinito. La única zona segura.

### 7. El pipeline (1:55–2:25)
**Clip:** eventos entrando en Redpanda Console, después la terminal con consulta.py.
> Cada partida emite eventos: posición, persecuciones, escapes, capturas. Un colector valida cada evento contra un contrato y los envía a Redpanda. Un consumidor los guarda en Parquet en la capa bronce, los limpia en DuckDB en la capa plata y genera la capa oro. Todo corre en contenedores, en mi computadora, a costo cero.

### 8. Los datos no mienten (2:25–2:45)
**Clip:** el mapa de los perdidos con la tabla de captura por versión.
> Con las primeras partidas los datos fueron claros: dos persecuciones, dos capturas. Cien por ciento. La criatura arrancaba a seis metros y me atrapaba en segundos; una vez, en un segundo y medio. Pero los datos mostraron otra cosa: en la mitad de mis partidas nunca llegó a cazarme, y en esas dos partidas atravesé una pared rota y llegué al Nivel 1. Con esa evidencia ajusté el juego: ahora la cacería no puede arrancar a menos de diez metros, y la criatura corre a dos coma seis metros por segundo, contra mis tres coma cuatro. ¿Alcanza para escapar? Eso lo van a decir las próximas partidas.

### 9. El mapa de los perdidos (2:45–3:00)
**Clip:** zoom sobre el mapa: rastros, capturas, escapes y noclips.
> Como el mundo es una función, no hace falta guardarlo. Con los eventos alcanza para reconstruir el mapa de cada partida: por dónde se perdió la gente y dónde la atraparon.

### 10. Cierre (3:00–3:15)
**Clip:** vuelta al pasillo; la luz se apaga.
> Gracias a Thomas DiModica por un repo que merecía mucho más que cero estrellas. El código está en mi GitHub. Feliz Halloween. Y si escuchas algo detrás de ti… no corras.

---

## Reel 9:16 (~40 s)

**Clips:** cacería con grito → Redpanda Console → mapa de los perdidos → pasillo oscuro.
> Esta criatura no puede verte, solo te escucha. Hice un juego de los Backrooms donde cada paso es un evento en tiempo real: va a Redpanda, se guarda en Parquet y DuckDB y termina en un mapa de dónde se pierde la gente. Las primeras partidas dieron cien por ciento de capturas: me atrapaba en segundos. Las únicas veces que no me cazó, atravesé una pared rota. Ajusté el juego con esos datos; las próximas partidas van a decir si alcanza. Todo empezó con un repo de cero estrellas que merecía mucho más. ¿Te animas a entrar?

---

## Clips para grabar con OBS (1080p, 60 fps)
1. Pasillo del Nivel 0 con luces titilando (10 s)
2. Cacería completa: titileo, silencio, grito, persecución (20 s)
3. Una captura (10 s)
4. Un escape (10 s)
5. Cruce de una puerta de capa (5 s)
6. Noclip a una pared rota y llegada al estacionamiento (15 s)
7. Estacionamiento, caminata tranquila (10 s)
8. Repo de TediusTimmy en GitHub (5 s)
9. Redpanda Console con eventos entrando (10 s)
10. Terminal con `docker compose exec consumer python consulta.py` (10 s)
11. Mapa de los perdidos: zoom, tooltip y tabla por versión (20 s)

## Miniatura
Fotograma de la cacería (clip 2) donde se vea la silueta de La Interferencia, con título corto: **"ME PERDÍ EN LOS BACKROOMS"**.
