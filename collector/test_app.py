import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import DEFAULT_SCHEMA, DeliveryError, create_app, load_validator

EXAMPLES = Path(__file__).resolve().parent.parent / "contracts" / "examples"
VALID = json.loads((EXAMPLES / "valid.json").read_text(encoding="utf-8"))
INVALID = json.loads((EXAMPLES / "invalid.json").read_text(encoding="utf-8"))


class FakeProducer:
    def __init__(self) -> None:
        self.sent: list[tuple[str, str | None, dict, dict]] = []
        self.fail = False

    def send(self, topic, key, value, headers):
        self.sent.append((topic, key, json.loads(value), dict(headers)))

    def flush(self, timeout):
        if self.fail:
            raise DeliveryError("caído")

    def on(self, topic):
        return [s for s in self.sent if s[0] == topic]


@pytest.fixture
def setup():
    producer = FakeProducer()
    app = create_app(producer, load_validator(DEFAULT_SCHEMA), "backrooms.eventos", "backrooms.eventos.dlq")
    return TestClient(app), producer


def test_eventos_validos_van_al_topico_con_la_sesion_como_key(setup):
    client, producer = setup
    r = client.post("/events", json=VALID)
    assert r.status_code == 200
    assert r.json() == {"aceptados": len(VALID), "rechazados": 0}
    sent = producer.on("backrooms.eventos")
    assert [s[2] for s in sent] == VALID
    assert all(key == ev["session"] for _, key, ev, _ in sent)
    assert all(h["contrato"] == b"v1" and h["recibido"].endswith(b"Z") for *_, h in sent)
    assert producer.on("backrooms.eventos.dlq") == []


@pytest.mark.parametrize("case", INVALID, ids=[c["caso"] for c in INVALID])
def test_eventos_invalidos_van_a_la_dlq_con_el_motivo(setup, case):
    client, producer = setup
    r = client.post("/events", json=[case["evento"]])
    assert r.status_code == 200
    assert r.json() == {"aceptados": 0, "rechazados": 1}
    assert producer.on("backrooms.eventos") == []
    [(_, _, msg, _)] = producer.on("backrooms.eventos.dlq")
    assert msg["evento"] == case["evento"]
    assert any(case["motivo"] in m for m in msg["motivo"]), msg["motivo"]


def test_lote_mezclado_separa_validos_e_invalidos(setup):
    client, producer = setup
    r = client.post("/events", json=[VALID[0], INVALID[0]["evento"], VALID[1]])
    assert r.json() == {"aceptados": 2, "rechazados": 1}
    assert len(producer.on("backrooms.eventos")) == 2
    assert len(producer.on("backrooms.eventos.dlq")) == 1


def test_un_evento_suelto_tambien_se_acepta(setup):
    client, producer = setup
    assert client.post("/events", json=VALID[0]).json() == {"aceptados": 1, "rechazados": 0}


def test_cuerpo_que_no_es_json_va_a_la_dlq_y_responde_400(setup):
    client, producer = setup
    r = client.post("/events", content=b"{esto no es json", headers={"content-type": "application/json"})
    assert r.status_code == 400
    [(_, key, msg, _)] = producer.on("backrooms.eventos.dlq")
    assert key is None and msg["crudo"] == "{esto no es json" and "no es JSON" in msg["motivo"][0]


def test_lote_demasiado_grande_responde_413(setup):
    client, producer = setup
    assert client.post("/events", json=[VALID[0]] * 501).status_code == 413
    assert producer.sent == []


def test_si_redpanda_no_confirma_responde_503_para_que_el_juego_reintente(setup):
    client, producer = setup
    producer.fail = True
    assert client.post("/events", json=VALID[:2]).status_code == 503


def test_health(setup):
    client, _ = setup
    assert client.get("/health").json() == {"ok": True}
