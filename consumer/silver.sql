-- Silver: se reconstruye entero desde Bronze en cada corrida (idempotente). silver.py crea antes la vista
-- `bronze_eventos` sobre los Parquet de bronze/eventos.
-- Unidades: x, y son celdas globales; una celda mide 2.2 m (game/level.ts CELL).

-- Eventos únicos (la entrega es at-least-once: gana la primera copia en Kafka) y sin las partidas con ?debug=1.
CREATE TABLE eventos AS
WITH crudo AS (
    SELECT valor::JSON AS v, particion, "offset", recibido
    FROM bronze_eventos
    WHERE json_valid(valor)
)
SELECT
    v->>'event_id' AS event_id,
    (v->>'ts')::TIMESTAMPTZ AS ts,
    v->>'session' AS session,
    (v->>'seed')::BIGINT AS seed,
    (v->>'world_v')::INTEGER AS world_v,
    (v->>'level')::INTEGER AS level,
    v->>'type' AS type,
    (v->>'x')::DOUBLE AS x,
    (v->>'y')::DOUBLE AS y,
    (v->>'z')::BIGINT AS z,
    v->'client'->>'platform' AS platform,
    v->'client'->>'version' AS client_version,
    v->'data' AS data,
    recibido::TIMESTAMPTZ AS recibido,
    particion AS kafka_particion,
    "offset" AS kafka_offset
FROM crudo
WHERE NOT (v->'client'->>'debug')::BOOLEAN
QUALIFY row_number() OVER (PARTITION BY v->>'event_id' ORDER BY particion, "offset") = 1;

-- Persecuciones: arrancan con persecucion_inicio y las cierra un escape (con su via) o una captura con el mismo
-- persecucion_id. Sin cierre: si la sesión ya cerró (sesion_fin) es una pérdida de rastro, y termina en la próxima
-- persecución o el fin de la sesión; si la sesión sigue abierta queda en_curso, hasta el último evento recibido.
CREATE TABLE persecuciones AS
WITH inicios AS (
    SELECT data->>'persecucion_id' AS persecucion_id, session, seed, world_v, level, ts AS inicio, x, y, z,
           (data->>'distancia_m')::DOUBLE AS distancia_inicial_m
    FROM eventos
    WHERE type = 'persecucion_inicio'
    QUALIFY row_number() OVER (PARTITION BY data->>'persecucion_id' ORDER BY ts) = 1
),
cierres AS (
    SELECT data->>'persecucion_id' AS persecucion_id, type, ts, (data->>'duracion_s')::DOUBLE AS duracion_s,
           data->>'via' AS via, data->>'humor' AS humor, x, y, z
    FROM eventos
    WHERE type IN ('escape', 'captura') AND data->>'persecucion_id' IS NOT NULL
    QUALIFY row_number() OVER (PARTITION BY data->>'persecucion_id' ORDER BY ts, kafka_offset) = 1
),
cerradas AS (
    SELECT DISTINCT session FROM eventos WHERE type = 'sesion_fin'
),
cortes AS (
    SELECT i.persecucion_id,
           coalesce(min(e.ts) FILTER (WHERE e.type IN ('persecucion_inicio', 'sesion_fin')), max(e.ts)) AS fin
    FROM inicios i
    JOIN eventos e ON e.session = i.session AND e.ts > i.inicio
    GROUP BY i.persecucion_id
)
SELECT
    i.persecucion_id, i.session, i.seed, i.world_v, i.level,
    i.inicio,
    coalesce(c.ts, k.fin, i.inicio) AS fin,
    coalesce(c.duracion_s, epoch(coalesce(k.fin, i.inicio) - i.inicio)) AS duracion_s,
    CASE WHEN c.type IS NOT NULL THEN c.type
         WHEN i.session IN (SELECT session FROM cerradas) THEN 'perdida'
         ELSE 'en_curso' END AS resultado,
    c.via,
    c.humor AS humor_captura,
    i.distancia_inicial_m,
    i.x AS x_inicio, i.y AS y_inicio, i.z AS z_inicio,
    c.x AS x_fin, c.y AS y_fin, c.z AS z_fin
FROM inicios i
LEFT JOIN cierres c USING (persecucion_id)
LEFT JOIN cortes k USING (persecucion_id);

-- Noclips: el campo común `level` es el de origen. Si venía cazado y cayó en zona segura, el juego emite un escape
-- con via noclip en el mismo frame: acá queda su persecucion_id.
CREATE TABLE noclips AS
SELECT
    n.event_id, n.session, n.seed, n.world_v, n.ts,
    (n.data->>'nivel_origen')::INTEGER AS nivel_origen,
    (n.data->>'nivel_destino')::INTEGER AS nivel_destino,
    n.x, n.y, n.z,
    e.data->>'persecucion_id' AS persecucion_id_escapada
FROM eventos n
LEFT JOIN eventos e
    ON e.session = n.session AND e.type = 'escape' AND e.data->>'via' = 'noclip'
    AND e.ts BETWEEN n.ts AND n.ts + INTERVAL 1 SECOND
WHERE n.type = 'noclip'
QUALIFY row_number() OVER (PARTITION BY n.event_id ORDER BY e.ts) = 1;

-- Sesiones: de sesion_inicio a sesion_fin (si faltan, primer y último evento). La distancia suma los tramos entre
-- eventos consecutivos dentro del mismo nivel y capa (una puerta o un noclip es un salto, no un recorrido).
CREATE TABLE sesiones AS
WITH pasos AS (
    SELECT session,
           CASE WHEN lag(level) OVER w = level AND lag(z) OVER w = z
                THEN sqrt((x - lag(x) OVER w) ** 2 + (y - lag(y) OVER w) ** 2) ELSE 0 END AS celdas
    FROM eventos
    WINDOW w AS (PARTITION BY session ORDER BY ts, kafka_offset)
),
distancias AS (
    SELECT session, sum(celdas) * 2.2 AS distancia_m FROM pasos GROUP BY session
),
base AS (
    SELECT
        session,
        arg_min(seed, ts) AS seed,
        arg_min(world_v, ts) AS world_v,
        arg_min(platform, ts) AS platform,
        arg_min(client_version, ts) AS client_version,
        coalesce(min(ts) FILTER (WHERE type = 'sesion_inicio'), min(ts)) AS inicio,
        coalesce(max(ts) FILTER (WHERE type = 'sesion_fin'), max(ts)) AS fin,
        list_sort(list(DISTINCT level)) AS niveles_visitados,
        coalesce(arg_max(data->>'motivo', ts) FILTER (WHERE type = 'sesion_fin'), 'sin_cierre') AS como_termino,
        count(*) AS eventos,
        count(*) FILTER (WHERE type = 'noclip') AS noclips
    FROM eventos
    GROUP BY session
),
chases AS (
    SELECT session,
           count(*) AS persecuciones,
           count(*) FILTER (WHERE resultado = 'escape') AS escapes,
           count(*) FILTER (WHERE resultado = 'captura') AS capturas,
           count(*) FILTER (WHERE resultado = 'perdida') AS perdidas,
           count(*) FILTER (WHERE resultado = 'en_curso') AS en_curso
    FROM persecuciones
    GROUP BY session
)
SELECT
    b.session, b.seed, b.world_v, b.platform, b.client_version,
    b.inicio, b.fin, epoch(b.fin - b.inicio) AS duracion_s,
    round(d.distancia_m, 1) AS distancia_m,
    b.niveles_visitados,
    b.como_termino,
    b.eventos,
    coalesce(c.persecuciones, 0) AS persecuciones,
    coalesce(c.escapes, 0) AS escapes,
    coalesce(c.capturas, 0) AS capturas,
    coalesce(c.perdidas, 0) AS perdidas,
    coalesce(c.en_curso, 0) AS en_curso,
    b.noclips
FROM base b
JOIN distancias d USING (session)
LEFT JOIN chases c USING (session);
