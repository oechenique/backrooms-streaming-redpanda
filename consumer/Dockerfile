# Se construye desde la raíz del repo (docker-compose.yml), igual que el collector.
FROM python:3.12-slim

WORKDIR /app/consumer
COPY consumer/requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY consumer/app.py consumer/bronze.py consumer/silver.py consumer/silver.sql consumer/consulta.py ./

ENV PYTHONUNBUFFERED=1 \
    BRONZE_DIR=/data/bronze \
    SILVER_DB=/data/silver/backrooms.duckdb
USER nobody
CMD ["python", "app.py"]
