"""Consultas rápidas a Silver, en solo lectura.

    docker compose exec consumer python consulta.py                       # sesiones, persecuciones y captura por versión
    docker compose exec consumer python consulta.py "SELECT * FROM noclips"
"""

from __future__ import annotations

import os
import sys

import duckdb

DEFAULT = [
    "SELECT session[:8] AS session, seed, inicio, round(duracion_s) AS duracion_s, distancia_m, niveles_visitados, "
    "como_termino, persecuciones, escapes, capturas, perdidas, en_curso, noclips FROM sesiones ORDER BY inicio",
    "SELECT session[:8] AS session, inicio, round(duracion_s, 1) AS duracion_s, resultado, via, level, "
    "distancia_inicial_m, client_version FROM persecuciones ORDER BY inicio",
    # % de captura sobre las terminadas (escape, captura o pérdida de rastro), para comparar el balance entre versiones.
    "SELECT client_version, count(*) AS persecuciones, "
    "count(*) FILTER (WHERE resultado = 'captura') AS capturas, count(*) FILTER (WHERE resultado = 'escape') AS escapes, "
    "count(*) FILTER (WHERE resultado = 'perdida') AS perdidas, count(*) FILTER (WHERE resultado = 'en_curso') AS en_curso, "
    "round(100.0 * count(*) FILTER (WHERE resultado = 'captura') / nullif(count(*) FILTER (WHERE resultado <> 'en_curso'), 0), 1) "
    "AS pct_captura, round(avg(distancia_inicial_m), 1) AS distancia_inicial_media_m "
    "FROM persecuciones GROUP BY client_version ORDER BY string_split(client_version, '.')::INTEGER[]",
]

if __name__ == "__main__":
    con = duckdb.connect(os.environ.get("SILVER_DB", "/data/silver/backrooms.duckdb"), read_only=True)
    con.execute("SET TimeZone = 'UTC'")
    for q in sys.argv[1:] or DEFAULT:
        con.sql(q).show(max_rows=200, max_width=200)
