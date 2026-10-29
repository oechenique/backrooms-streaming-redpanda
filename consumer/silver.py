"""Silver: construye silver/backrooms.duckdb desde Bronze con silver.sql, y de paso exporta el Gold liviano.

Se reconstruye entero en un archivo aparte y se reemplaza al final: quien esté leyendo la base vieja no ve una a
medias, y correrlo dos veces da lo mismo. Uso manual: `python silver.py [bronze] [db] [gold]`.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import duckdb

import gold as gold_export

SQL = Path(__file__).resolve().parent / "silver.sql"
TABLES = ("eventos", "sesiones", "persecuciones", "noclips")


def build(bronze: Path, db: Path, gold: Path | None = None) -> dict[str, int] | None:
    """Reconstruye Silver (y Gold, si se pasa `gold`) y devuelve las filas por tabla; None si Bronze no tiene eventos."""
    eventos = bronze / "eventos"
    if not any(eventos.glob("**/*.parquet")):
        return None
    db.parent.mkdir(parents=True, exist_ok=True)
    tmp = db.with_suffix(".duckdb.tmp")
    tmp.unlink(missing_ok=True)
    glob = (eventos / "**" / "*.parquet").as_posix().replace("'", "''")
    con = duckdb.connect(str(tmp))
    try:
        con.execute("SET TimeZone = 'UTC'")
        con.execute(f"CREATE TEMP VIEW bronze_eventos AS SELECT * FROM read_parquet('{glob}', hive_partitioning = true)")
        con.execute(SQL.read_text(encoding="utf-8"))
        filas = {t: con.execute(f"SELECT count(*) FROM {t}").fetchone()[0] for t in TABLES}
        if gold is not None:
            filas["gold_mundos"] = gold_export.export(con, gold)
    finally:
        con.close()
    os.replace(tmp, db)
    return filas


if __name__ == "__main__":
    bronze = Path(sys.argv[1] if len(sys.argv) > 1 else os.environ.get("BRONZE_DIR", "/data/bronze"))
    db = Path(sys.argv[2] if len(sys.argv) > 2 else os.environ.get("SILVER_DB", "/data/silver/backrooms.duckdb"))
    gold = Path(sys.argv[3] if len(sys.argv) > 3 else os.environ.get("GOLD_DIR", "/data/gold"))
    print(build(bronze, db, gold) or "Bronze sin eventos todavía")
