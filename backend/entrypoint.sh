#!/usr/bin/env bash
set -e

echo "[entrypoint] Waiting for database + running migrations..."
alembic upgrade head

echo "[entrypoint] Seeding canonical demo data (idempotent)..."
python -m app.seed

echo "[entrypoint] Running consistency checks..."
python -m app.checks || echo "[entrypoint] WARNING: consistency checks reported issues"

echo "[entrypoint] Starting API on :8000"
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
