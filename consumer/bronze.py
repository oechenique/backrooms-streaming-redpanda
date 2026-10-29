"""Bronze: los mensajes de Redpanda, crudos, en Parquet.

Cada mensaje se guarda tal cual llegó (el JSON en `valor`) con su metadata de Kafka. Los eventos se particionan por
fecha (UTC, del `ts` del evento) y nivel; la DLQ va aparte, por fecha de recepción:

    bronze/eventos/fecha=2026-10-29/nivel=0/p0-000120-000245.parquet
    bronze/dlq/fecha=2026-10-29/p0-000003-000007.parquet

El nombre sale de la partición y el rango de offsets: si el consumer se cae entre escribir y hacer commit, al releer
el mismo lote pisa el mismo archivo. Cada archivo se escribe como .tmp y se renombra, así nadie lee uno a medias.
"""

from __future__ import annotations

import json
import os
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

SCHEMA = pa.schema(
    [
        ("topic", pa.string()),
        ("particion", pa.int32()),
        ("offset", pa.int64()),
        ("kafka_ts", pa.timestamp("ms", tz="UTC")),
        ("key", pa.string()),
        ("recibido", pa.string()),
        ("contrato", pa.string()),
        ("valor", pa.string()),
    ]
)


@dataclass(frozen=True)
class Msg:
    """Lo que Bronze necesita de un mensaje de Kafka (así se prueba sin broker)."""

    topic: str
    partition: int
    offset: int
    timestamp_ms: int
    key: bytes | None
    value: bytes | None
    headers: dict[str, bytes]


def _fecha(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, timezone.utc).date().isoformat()


def _destino(msg: Msg, dlq_topic: str) -> tuple[str, ...]:
    """Carpeta de la partición Hive. Si el valor no se puede leer, cae en la fecha de Kafka y nivel=-1."""
    if msg.topic == dlq_topic:
        recibido = msg.headers.get("recibido", b"").decode("utf-8", "replace")
        return ("dlq", f"fecha={recibido[:10] if len(recibido) >= 10 else _fecha(msg.timestamp_ms)}")
    fecha, nivel = _fecha(msg.timestamp_ms), -1
    try:
        ev = json.loads(msg.value or b"")
        fecha = datetime.fromisoformat(ev["ts"].replace("Z", "+00:00")).astimezone(timezone.utc).date().isoformat()
        nivel = ev["level"] if ev["level"] in (0, 1) else -1
    except (ValueError, KeyError, TypeError, AttributeError):
        pass
    return ("eventos", f"fecha={fecha}", f"nivel={nivel}")


def _texto(b: bytes | None) -> str | None:
    return None if b is None else b.decode("utf-8", "replace")


def write(msgs: list[Msg], root: Path, dlq_topic: str) -> list[Path]:
    """Escribe el lote en Bronze y devuelve los archivos escritos."""
    grupos: dict[tuple[tuple[str, ...], int], list[Msg]] = defaultdict(list)
    for m in msgs:
        grupos[(_destino(m, dlq_topic), m.partition)].append(m)

    escritos = []
    for (carpeta, particion), grupo in sorted(grupos.items()):
        grupo.sort(key=lambda m: m.offset)
        tabla = pa.table(
            {
                "topic": [m.topic for m in grupo],
                "particion": [m.partition for m in grupo],
                "offset": [m.offset for m in grupo],
                "kafka_ts": [m.timestamp_ms for m in grupo],
                "key": [_texto(m.key) for m in grupo],
                "recibido": [_texto(m.headers.get("recibido")) for m in grupo],
                "contrato": [_texto(m.headers.get("contrato")) for m in grupo],
                "valor": [_texto(m.value) for m in grupo],
            },
            schema=SCHEMA,
        )
        dest = root.joinpath(*carpeta)
        dest.mkdir(parents=True, exist_ok=True)
        path = dest / f"p{particion}-{grupo[0].offset:06d}-{grupo[-1].offset:06d}.parquet"
        tmp = path.with_suffix(".parquet.tmp")
        pq.write_table(tabla, tmp)
        os.replace(tmp, path)
        escritos.append(path)
    return escritos
