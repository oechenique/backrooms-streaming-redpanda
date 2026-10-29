"""Consumer de F3: Redpanda → Bronze (Parquet) → Silver (DuckDB).

Lee `backrooms.eventos` y `backrooms.eventos.dlq` en lotes (hasta BATCH_MAX mensajes o BATCH_S segundos), escribe el
lote en Bronze y recién después hace commit de los offsets: si se cae en el medio, al volver relee y reescribe el
mismo lote (Silver deduplica por event_id). Con datos nuevos reconstruye Silver, como mucho cada SILVER_EVERY_S.
"""

from __future__ import annotations

import logging
import os
import signal
import time
from pathlib import Path

from confluent_kafka import Consumer, KafkaException, TopicPartition

import bronze
import silver

log = logging.getLogger("consumer")


def to_msg(m) -> bronze.Msg:
    return bronze.Msg(
        topic=m.topic(),
        partition=m.partition(),
        offset=m.offset(),
        timestamp_ms=m.timestamp()[1],
        key=m.key(),
        value=m.value(),
        headers={k: v for k, v in (m.headers() or []) if v is not None},
    )


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    topic = os.environ.get("TOPIC", "backrooms.eventos")
    dlq_topic = os.environ.get("DLQ_TOPIC", "backrooms.eventos.dlq")
    bronze_dir = Path(os.environ.get("BRONZE_DIR", "/data/bronze"))
    silver_db = Path(os.environ.get("SILVER_DB", "/data/silver/backrooms.duckdb"))
    batch_max = int(os.environ.get("BATCH_MAX", "1000"))
    batch_s = float(os.environ.get("BATCH_S", "5"))
    silver_every_s = float(os.environ.get("SILVER_EVERY_S", "10"))

    consumer = Consumer(
        {
            "bootstrap.servers": os.environ.get("KAFKA_BROKERS", "localhost:19092"),
            "group.id": os.environ.get("GROUP_ID", "backrooms-consumer"),
            "auto.offset.reset": "earliest",
            "enable.auto.commit": False,
            "client.id": "backrooms-consumer",
        }
    )
    consumer.subscribe([topic, dlq_topic])

    stop = False

    def on_signal(*_):
        nonlocal stop
        stop = True

    signal.signal(signal.SIGTERM, on_signal)
    signal.signal(signal.SIGINT, on_signal)

    # Al arrancar se reconstruye Silver con lo que ya haya en Bronze (por si cambió silver.sql).
    dirty, last_silver = True, 0.0
    log.info("leyendo %s y %s → %s, %s", topic, dlq_topic, bronze_dir, silver_db)
    try:
        while not stop:
            batch, deadline = [], time.monotonic() + batch_s
            while not stop and len(batch) < batch_max and time.monotonic() < deadline:
                for m in consumer.consume(num_messages=batch_max - len(batch), timeout=0.5):
                    if m.error():
                        log.warning("error de Kafka: %s", m.error())
                    else:
                        batch.append(to_msg(m))
            if batch:
                files = bronze.write(batch, bronze_dir, dlq_topic)
                last = {}
                for m in batch:
                    last[(m.topic, m.partition)] = max(last.get((m.topic, m.partition), -1), m.offset)
                consumer.commit(offsets=[TopicPartition(t, p, o + 1) for (t, p), o in last.items()], asynchronous=False)
                log.info("bronze: %d mensajes en %d archivos, offsets confirmados", len(batch), len(files))
                dirty = True
            if dirty and time.monotonic() - last_silver >= silver_every_s:
                try:
                    filas = silver.build(bronze_dir, silver_db)
                    if filas:
                        log.info("silver: %s", filas)
                    dirty = False
                except Exception:  # noqa: BLE001 — Silver se reintenta en la próxima vuelta; Bronze ya está a salvo.
                    log.exception("no se pudo reconstruir silver")
                last_silver = time.monotonic()
    except KafkaException:
        log.exception("Kafka falló")
        raise
    finally:
        consumer.close()


if __name__ == "__main__":
    main()
