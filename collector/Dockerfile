# Se construye desde la raíz del repo (docker-compose.yml): necesita collector/ y contracts/.
FROM python:3.12-slim

WORKDIR /app
COPY collector/requirements.txt collector/requirements.txt
RUN pip install --no-cache-dir -r collector/requirements.txt

COPY contracts contracts
COPY collector/app.py collector/app.py

ENV SCHEMA_PATH=/app/contracts/event.schema.json \
    PYTHONUNBUFFERED=1
WORKDIR /app/collector
USER nobody
EXPOSE 8000
# Sin access log: no se registra la IP de quien manda eventos (regla de privacidad).
CMD ["uvicorn", "app:main", "--factory", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
