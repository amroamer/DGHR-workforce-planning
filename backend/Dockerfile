FROM python:3.11-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# System deps (psycopg build not needed with binary wheels, but keep curl for debugging)
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
RUN pip install --upgrade pip && pip install \
    "fastapi>=0.115" "uvicorn[standard]>=0.32" "sqlalchemy>=2.0" "alembic>=1.13" \
    "psycopg[binary]>=3.2" "pydantic>=2.9" "pydantic-settings>=2.5" "python-multipart>=0.0.12" \
    "pandas>=2.2" "openpyxl>=3.1" "rapidfuzz>=3.10" "reportlab>=4.2" "anthropic>=0.39"

COPY . .

RUN chmod +x /app/entrypoint.sh || true

EXPOSE 8000

CMD ["/app/entrypoint.sh"]
