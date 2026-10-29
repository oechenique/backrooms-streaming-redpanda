"""Consultas rápidas a Silver, en solo lectura.

    docker compose exec consumer python consulta.py                       # sesiones y persecuciones
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
    "distancia_inicial_m FROM persecuciones ORDER BY inicio",
]

if __name__ == "__main__":
    con = duckdb.connect(os.environ.get("SILVER_DB", "/data/silver/backrooms.duckdb"), read_only=True)
    con.execute("SET TimeZone = 'UTC'")
    for q in sys.argv[1:] or DEFAULT:
        con.sql(q).show(max_rows=200, max_width=200)
