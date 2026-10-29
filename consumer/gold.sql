-- Gold liviano para el mapa de los perdidos: lo corre gold.py sobre la base Silver recién armada, antes de
-- reemplazarla, y lo exporta a JSON y Parquet. Así el dashboard nunca abre la base.

-- Rastros: cada evento deja un punto y los tramos entre eventos seguidos (mismo nivel y capa, menos de 30 celdas;
-- más es un salto) se rellenan cada media celda. Se cuentan por celda.
CREATE TEMP TABLE gold_rastros AS
WITH pasos AS (
    SELECT session, seed, world_v, level, z, x, y,
           lag(x) OVER w AS px, lag(y) OVER w AS py, lag(level) OVER w AS pl, lag(z) OVER w AS pz
    FROM eventos
    WINDOW w AS (PARTITION BY session ORDER BY ts, kafka_offset)
),
tramos AS (
    SELECT *, ceil(sqrt((x - px) ** 2 + (y - py) ** 2) * 2)::BIGINT AS pasos
    FROM pasos
    WHERE pl = level AND pz = z AND sqrt((x - px) ** 2 + (y - py) ** 2) BETWEEN 0.5 AND 30
),
intermedios AS (
    SELECT session, seed, world_v, level, z, x, y, px, py, pasos, unnest(range(1, pasos)) AS i FROM tramos
),
puntos AS (
    SELECT session, seed, world_v, level, z, x, y FROM eventos
    UNION ALL
    SELECT session, seed, world_v, level, z, px + (x - px) * i / pasos, py + (y - py) * i / pasos FROM intermedios
)
SELECT seed, world_v, level, z, floor(x)::BIGINT AS cx, floor(y)::BIGINT AS cy,
       count(*) AS peso, count(DISTINCT session) AS sesiones
FROM puntos
GROUP BY ALL;

-- Marcas: dónde atrapó, dónde se escaparon (con su via) y dónde hicieron noclip (en el nivel de origen).
CREATE TEMP TABLE gold_marcas AS
SELECT seed, world_v, level, z, x, y, ts, session,
       type AS tipo,
       CASE type WHEN 'escape' THEN data->>'via'
                 WHEN 'captura' THEN data->>'humor'
                 WHEN 'noclip' THEN 'al nivel ' || (data->>'nivel_destino') END AS detalle
FROM eventos
WHERE type IN ('captura', 'escape', 'noclip');

-- Resumen por mundo (seed + versión del generador). El % de captura es sobre las persecuciones terminadas.
CREATE TEMP TABLE gold_resumen AS
WITH p AS (
    SELECT seed, world_v,
           count(*) AS persecuciones,
           count(*) FILTER (WHERE resultado = 'captura') AS capturas,
           count(*) FILTER (WHERE resultado = 'escape') AS escapes,
           count(*) FILTER (WHERE resultado = 'perdida') AS perdidas,
           count(*) FILTER (WHERE resultado = 'en_curso') AS en_curso,
           avg(duracion_s) FILTER (WHERE resultado <> 'en_curso') AS duracion_media_persecucion_s
    FROM persecuciones
    GROUP BY ALL
)
SELECT s.seed, s.world_v,
       count(*) AS sesiones,
       round(avg(s.duracion_s), 1) AS duracion_media_s,
       min(s.inicio) AS primera,
       max(s.fin) AS ultima,
       coalesce(any_value(p.persecuciones), 0) AS persecuciones,
       coalesce(any_value(p.capturas), 0) AS capturas,
       coalesce(any_value(p.escapes), 0) AS escapes,
       coalesce(any_value(p.perdidas), 0) AS perdidas,
       coalesce(any_value(p.en_curso), 0) AS en_curso,
       round(100.0 * any_value(p.capturas) / nullif(any_value(p.capturas + p.escapes + p.perdidas), 0), 1) AS pct_captura,
       round(any_value(p.duracion_media_persecucion_s), 1) AS duracion_media_persecucion_s
FROM sesiones s
LEFT JOIN p USING (seed, world_v)
GROUP BY s.seed, s.world_v;
