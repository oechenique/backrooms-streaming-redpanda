import json
import uuid
from datetime import datetime, timedelta, timezone

import duckdb
import pytest

import bronze
import silver

DLQ = "backrooms.eventos.dlq"
T0 = datetime(2026, 10, 29, 23, 59, 50, tzinfo=timezone.utc)


class Partida:
    """Arma eventos con la forma del contrato v1 y los pasa a mensajes de Kafka."""

    def __init__(self, debug=False):
        self.session = str(uuid.uuid4())
        self.debug = debug
        self.events = []

    def ev(self, s, type, data, level=0, x=100.0, y=100.0, z=0):
        e = {
            "event_id": str(uuid.uuid4()),
            "ts": (T0 + timedelta(seconds=s)).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            "session": self.session,
            "seed": 42,
            "world_v": 3,
            "level": level,
            "type": type,
            "x": x,
            "y": y,
            "z": z,
            "client": {"platform": "desktop", "version": "0.4.0", "debug": self.debug},
            "data": data,
        }
        self.events.append(e)
        return e


def msgs(events, topic="backrooms.eventos", start=0):
    return [
        bronze.Msg(topic, 0, start + i, 0, e["session"].encode(), json.dumps(e).encode(), {"recibido": b"2026-10-30T00:00:00.000Z", "contrato": b"v1"})
        for i, e in enumerate(events)
    ]


@pytest.fixture
def partidas():
    a = Partida()
    a.ev(0, "sesion_inicio", {"zona": "0,0,0"})
    a.ev(2, "posicion", {"velocidad": 3, "humor": "calm"}, x=103, y=104)  # 5 celdas
    hunt1 = str(uuid.uuid4())
    a.ev(4, "persecucion_inicio", {"persecucion_id": hunt1, "distancia_m": 12.5}, x=103, y=104)
    a.ev(9, "escape", {"persecucion_id": hunt1, "duracion_s": 5.0, "via": "retirada"}, x=103, y=104)
    a.ev(10, "zona_cambio", {"zona": "0,0,1", "via": "puerta"}, x=500, y=500, z=1)  # salto: no suma
    a.ev(12, "posicion", {"velocidad": 3, "humor": "calm"}, x=500, y=503, z=1)  # 3 celdas
    hunt2 = str(uuid.uuid4())
    a.ev(14, "persecucion_inicio", {"persecucion_id": hunt2, "distancia_m": 8}, x=500, y=503, z=1)
    a.ev(16, "noclip", {"nivel_origen": 0, "nivel_destino": 1}, x=500, y=503, z=1)
    a.ev(16, "escape", {"persecucion_id": hunt2, "duracion_s": 2.0, "via": "noclip"}, level=1, x=500, y=503, z=1)
    a.ev(20, "sesion_fin", {"motivo": "salida"}, level=1, x=500, y=503, z=1)

    b = Partida()
    b.ev(0, "sesion_inicio", {"zona": "0,0,0"})
    hunt3 = str(uuid.uuid4())
    b.ev(3, "persecucion_inicio", {"persecucion_id": hunt3, "distancia_m": 20})
    b.ev(7, "captura", {"persecucion_id": hunt3, "duracion_s": 4.0, "humor": "hunt"})
    b.ev(7, "sesion_fin", {"motivo": "captura"})

    c = Partida()  # cerró la pestaña en medio de una persecución: sin cierre ni sesion_fin
    c.ev(0, "sesion_inicio", {"zona": "0,0,0"})
    hunt4 = str(uuid.uuid4())
    c.ev(5, "persecucion_inicio", {"persecucion_id": hunt4, "distancia_m": 15})
    c.ev(7, "posicion", {"velocidad": 6, "humor": "hunt"})

    d = Partida(debug=True)
    d.ev(0, "sesion_inicio", {"zona": "0,0,0"})
    return {"a": a, "b": b, "c": c, "d": d, "hunts": (hunt1, hunt2, hunt3, hunt4)}


def test_bronze_particiona_por_fecha_y_nivel_y_separa_la_dlq(tmp_path, partidas):
    events = partidas["a"].events
    dlq = [bronze.Msg(DLQ, 0, 7, 0, None, b'{"motivo": ["x"]}', {"recibido": b"2026-10-30T00:00:01.000Z"})]
    files = bronze.write(msgs(events) + dlq, tmp_path, DLQ)
    rel = sorted(f.relative_to(tmp_path).as_posix() for f in files)
    assert rel == [
        "dlq/fecha=2026-10-30/p0-000007-000007.parquet",
        "eventos/fecha=2026-10-29/nivel=0/p0-000000-000003.parquet",  # la partida cruza la medianoche UTC
        "eventos/fecha=2026-10-30/nivel=0/p0-000004-000007.parquet",
        "eventos/fecha=2026-10-30/nivel=1/p0-000008-000009.parquet",
    ]
    filas = duckdb.sql(f"SELECT valor FROM read_parquet('{tmp_path.as_posix()}/eventos/**/*.parquet') ORDER BY \"offset\"").fetchall()
    assert [json.loads(v) for (v,) in filas] == events  # crudo: el JSON tal cual


def test_bronze_releer_el_mismo_lote_pisa_el_mismo_archivo(tmp_path, partidas):
    batch = msgs(partidas["b"].events)
    assert bronze.write(batch, tmp_path, DLQ) == bronze.write(batch, tmp_path, DLQ)
    assert len(list(tmp_path.glob("**/*.parquet"))) == 1
    assert not list(tmp_path.glob("**/*.tmp"))


@pytest.fixture
def db(tmp_path, partidas):
    todos = [e for k in "abcd" for e in partidas[k].events]
    bronze.write(msgs(todos), tmp_path / "bronze", DLQ)
    bronze.write(msgs(partidas["b"].events, start=100), tmp_path / "bronze", DLQ)  # reentrega: duplicados
    filas = silver.build(tmp_path / "bronze", tmp_path / "silver.duckdb")
    assert filas is not None
    con = duckdb.connect(str(tmp_path / "silver.duckdb"), read_only=True)
    yield con
    con.close()


def test_silver_deduplica_y_filtra_debug(db, partidas):
    assert db.execute("SELECT count(*), count(DISTINCT event_id) FROM eventos").fetchone() == (17, 17)
    assert db.execute(f"SELECT count(*) FROM eventos WHERE session = '{partidas['d'].session}'").fetchone() == (0,)


def test_silver_sesiones(db, partidas):
    rows = {
        r[0]: r[1:]
        for r in db.sql("SELECT session, duracion_s, distancia_m, niveles_visitados, como_termino, persecuciones, escapes, capturas, perdidas, noclips FROM sesiones").fetchall()
    }
    assert rows[partidas["a"].session] == (20.0, round(8 * 2.2, 1), [0, 1], "salida", 2, 2, 0, 0, 1)
    assert rows[partidas["b"].session] == (7.0, 0.0, [0], "captura", 1, 0, 1, 0, 0)
    assert rows[partidas["c"].session] == (7.0, 0.0, [0], "sin_cierre", 1, 0, 0, 1, 0)
    assert len(rows) == 3


def test_silver_persecuciones(db, partidas):
    h1, h2, h3, h4 = partidas["hunts"]
    rows = {r[0]: r[1:] for r in db.sql("SELECT persecucion_id, duracion_s, resultado, via, distancia_inicial_m FROM persecuciones").fetchall()}
    assert rows == {
        h1: (5.0, "escape", "retirada", 12.5),
        h2: (2.0, "escape", "noclip", 8.0),
        h3: (4.0, "captura", None, 20.0),
        h4: (2.0, "perdida", None, 15.0),  # pérdida de rastro: hasta el último evento de la sesión
    }


def test_silver_noclips(db, partidas):
    _, h2, _, _ = partidas["hunts"]
    assert db.sql("SELECT nivel_origen, nivel_destino, persecucion_id_escapada FROM noclips").fetchall() == [(0, 1, h2)]


def test_silver_sin_bronze_no_construye(tmp_path):
    assert silver.build(tmp_path / "bronze", tmp_path / "silver.duckdb") is None
