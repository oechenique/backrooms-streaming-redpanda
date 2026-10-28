"""Collector de eventos del juego.

Recibe lotes de eventos (POST /events), valida cada uno contra contracts/event.schema.json y lo publica en Redpanda:
los válidos en `backrooms.eventos` (key = session, para que una partida quede ordenada en una partición) y los
inválidos en `backrooms.eventos.dlq` con el motivo. Si Redpanda no confirma la escritura responde 503 y el juego
reintenta más tarde: la entrega es at-least-once y se deduplica por `event_id` aguas abajo.

Privacidad: no se registra la IP ni ningún dato de la conexión (uvicorn corre sin access log).
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from jsonschema import Draft202012Validator, FormatChecker

log = logging.getLogger("collector")

DEFAULT_SCHEMA = Path(__file__).resolve().parent.parent / "contracts" / "event.schema.json"
MAX_BODY_BYTES = 1_000_000
MAX_EVENTS = 500
CONTRACT_VERSION = b"v1"


class DeliveryError(Exception):
    """Redpanda no confirmó la escritura de algún mensaje."""


class Producer(Protocol):
    def send(self, topic: str, key: str | None, value: bytes, headers: list[tuple[str, bytes]]) -> None: ...

    def flush(self, timeout: float) -> None:
        """Espera las confirmaciones; levanta DeliveryError si alguna falló o no llegó a tiempo."""


class KafkaProducer:
    """Productor real (confluent-kafka). Los mensajes que no se confirman en 5 s fallan en vez de quedar en cola."""

    def __init__(self, brokers: str) -> None:
        from confluent_kafka import Producer as _Producer

        self._p = _Producer(
            {
                "bootstrap.servers": brokers,
                "acks": "all",
                "enable.idempotence": True,
                "message.timeout.ms": 5000,
                "client.id": "backrooms-collector",
            }
        )
        self._errors: list[str] = []

    def _on_delivery(self, err: Any, _msg: Any) -> None:
        if err is not None:
            self._errors.append(str(err))

    def send(self, topic: str, key: str | None, value: bytes, headers: list[tuple[str, bytes]]) -> None:
        self._p.produce(topic, value=value, key=key, headers=headers, on_delivery=self._on_delivery)
        self._p.poll(0)

    def flush(self, timeout: float) -> None:
        pending = self._p.flush(timeout)
        errors, self._errors = self._errors, []
        if pending or errors:
            raise DeliveryError(f"sin confirmar: {pending}; errores: {errors[:3]}")


def load_validator(path: Path) -> Draft202012Validator:
    schema = json.loads(path.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema, format_checker=FormatChecker())


def reasons(validator: Draft202012Validator, event: Any) -> list[str]:
    """Motivos por los que el evento no cumple el contrato (vacío = válido), en un orden estable."""
    out = []
    for e in sorted(validator.iter_errors(event), key=lambda e: list(map(str, e.absolute_path))):
        where = "/".join(str(p) for p in e.absolute_path) or "(raíz)"
        out.append(f"{where}: {e.message}")
    return out


def create_app(producer: Producer, validator: Draft202012Validator, topic: str, dlq_topic: str) -> FastAPI:
    app = FastAPI(title="backrooms collector", docs_url=None, redoc_url=None)

    def to_dlq(motivo: list[str], recibido: str, evento: Any = None, crudo: str | None = None) -> None:
        key = evento.get("event_id") if isinstance(evento, dict) and isinstance(evento.get("event_id"), str) else None
        body = {"motivo": motivo, "recibido": recibido, "evento": evento, "crudo": crudo}
        producer.send(dlq_topic, key, json.dumps(body, ensure_ascii=False).encode(), [("recibido", recibido.encode())])

    def flushed(payload: dict[str, Any], status: int = 200) -> JSONResponse:
        try:
            producer.flush(6)
        except DeliveryError as e:
            log.warning("Redpanda no confirmó: %s", e)
            return JSONResponse({"error": "redpanda no disponible"}, status_code=503)
        return JSONResponse(payload, status_code=status)

    @app.get("/health")
    def health() -> dict[str, bool]:
        return {"ok": True}

    @app.post("/events")
    async def events(request: Request) -> JSONResponse:
        raw = await request.body()
        if len(raw) > MAX_BODY_BYTES:
            return JSONResponse({"error": f"lote de más de {MAX_BODY_BYTES} bytes"}, status_code=413)
        recibido = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        try:
            body = json.loads(raw)
        except ValueError as e:
            # Ni siquiera es JSON: va entero a la DLQ (recortado) y el cliente no lo reintenta.
            to_dlq([f"(lote): no es JSON: {e}"], recibido, crudo=raw[:10_000].decode("utf-8", "replace"))
            return flushed({"error": "el cuerpo no es JSON"}, 400)

        batch = body if isinstance(body, list) else [body]
        if len(batch) > MAX_EVENTS:
            return JSONResponse({"error": f"lote de más de {MAX_EVENTS} eventos"}, status_code=413)

        accepted = rejected = 0
        for event in batch:
            motivo = reasons(validator, event)
            if motivo:
                to_dlq(motivo, recibido, evento=event)
                rejected += 1
            else:
                value = json.dumps(event, ensure_ascii=False, separators=(",", ":")).encode()
                producer.send(topic, event["session"], value, [("recibido", recibido.encode()), ("contrato", CONTRACT_VERSION)])
                accepted += 1
        return flushed({"aceptados": accepted, "rechazados": rejected})

    return app


def main() -> FastAPI:
    """App de producción, configurada por variables de entorno (ver .env.example)."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    validator = load_validator(Path(os.environ.get("SCHEMA_PATH", DEFAULT_SCHEMA)))
    producer = KafkaProducer(os.environ.get("KAFKA_BROKERS", "localhost:19092"))
    return create_app(
        producer,
        validator,
        os.environ.get("TOPIC", "backrooms.eventos"),
        os.environ.get("DLQ_TOPIC", "backrooms.eventos.dlq"),
    )
