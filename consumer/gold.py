"""Gold liviano: lo que necesita el mapa de los perdidos, exportado desde la base Silver recién armada.

    gold/index.json                   mundos (seed + world_v) con su resumen y las capas con rastros
    gold/mapa/<seed>-v<world_v>.json  por capa: rastros [cx, cy, peso] y marcas (captura, escape, noclip)
    gold/rastros.parquet, marcas.parquet, resumen.parquet   lo mismo para análisis

Cada archivo se escribe como .tmp y se renombra; el índice va último, así nunca apunta a un mapa que no existe.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

import duckdb

SQL = Path(__file__).resolve().parent / "gold.sql"
ISO = "%Y-%m-%dT%H:%M:%S.%gZ"


def _replace(path: Path, write) -> None:
    tmp = path.with_name(path.name + ".tmp")
    write(tmp)
    os.replace(tmp, path)


def _json(path: Path, obj) -> None:
    def write(tmp: Path) -> None:
        tmp.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":"), default=str), encoding="utf-8")

    _replace(path, write)


def _dicts(con: duckdb.DuckDBPyConnection, sql: str, params=()) -> list[dict]:
    cur = con.execute(sql, params)
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def export(con: duckdb.DuckDBPyConnection, gold: Path) -> int:
    """Arma las tablas de gold.sql en `con` y las escribe en `gold`. Devuelve la cantidad de mundos."""
    con.execute(SQL.read_text(encoding="utf-8"))
    (gold / "mapa").mkdir(parents=True, exist_ok=True)

    for t in ("rastros", "marcas", "resumen"):
        _replace(gold / f"{t}.parquet", lambda tmp, t=t: con.execute(f"COPY gold_{t} TO '{tmp.as_posix()}' (FORMAT parquet)"))

    # Las fechas salen como texto ISO en UTC (pasar TIMESTAMPTZ a Python pediría pytz).
    mundos = _dicts(
        con,
        f"SELECT * REPLACE (strftime(primera, '{ISO}') AS primera, strftime(ultima, '{ISO}') AS ultima) "
        "FROM gold_resumen ORDER BY ultima DESC",
    )
    vigentes = set()
    for m in mundos:
        clave = (m["seed"], m["world_v"])
        capas: dict[str, dict] = {}
        for r in con.execute(
            "SELECT level, z, list([cx, cy, peso] ORDER BY cx, cy) FROM gold_rastros WHERE seed = ? AND world_v = ? GROUP BY ALL",
            clave,
        ).fetchall():
            capas[f"{r[0]}:{r[1]}"] = {"level": r[0], "z": r[1], "rastros": r[2], "marcas": []}
        for mk in _dicts(
            con,
            f"SELECT level, z, tipo, x, y, detalle, strftime(ts, '{ISO}') AS ts, session[:8] AS session "
            "FROM gold_marcas WHERE seed = ? AND world_v = ? ORDER BY 7",
            clave,
        ):
            capa = capas.setdefault(f"{mk['level']}:{mk['z']}", {"level": mk["level"], "z": mk["z"], "rastros": [], "marcas": []})
            capa["marcas"].append({k: mk[k] for k in ("tipo", "x", "y", "detalle", "ts", "session")})
        m["capas"] = [{"level": c["level"], "z": c["z"], "celdas": len(c["rastros"]), "marcas": len(c["marcas"])} for c in capas.values()]
        nombre = f"{m['seed']}-v{m['world_v']}.json"
        vigentes.add(nombre)
        _json(gold / "mapa" / nombre, {"seed": m["seed"], "world_v": m["world_v"], "capas": list(capas.values())})

    _json(gold / "index.json", {"generado": datetime.now(timezone.utc).isoformat(timespec="seconds"), "mundos": mundos})
    for viejo in (gold / "mapa").glob("*.json"):
        if viejo.name not in vigentes:
            viejo.unlink()
    return len(mundos)
