#!/usr/bin/env bash
set -e

echo "[entrypoint] Waiting for database + running migrations..."
alembic upgrade head

echo "[entrypoint] Seeding canonical demo data (only if DB is empty)..."
python -m app.seed_clean --if-empty

echo "[entrypoint] Running consistency checks (informational only)..."
python -m app.checks || echo "[entrypoint] NOTE: DB diverges from canonical demo numbers (expected once real data is authored)"

# Dev uses --reload (hot reload via the source bind mount). Production sets
# UVICORN_RELOAD=false to run multiple workers with no reloader. Default = reload,
# so the dev docker-compose.yml behavior is unchanged.
if [ "${UVICORN_RELOAD:-true}" = "false" ]; then
  echo "[entrypoint] Starting API on :8000 (production, ${WEB_CONCURRENCY:-2} workers)"
  exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers "${WEB_CONCURRENCY:-2}"
else
  echo "[entrypoint] Starting API on :8000 (dev, --reload)"
  exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
fi
