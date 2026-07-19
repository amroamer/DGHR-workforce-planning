#!/usr/bin/env bash
set -e

echo "[entrypoint] Waiting for database + running migrations..."
alembic upgrade head

echo "[entrypoint] Seeding canonical demo data (only if DB is empty)..."
python -m app.seed_clean --if-empty

echo "[entrypoint] Running consistency checks (informational only)..."
python -m app.checks || echo "[entrypoint] NOTE: DB diverges from canonical demo numbers (expected once real data is authored)"

echo "[entrypoint] Starting API on :8000"
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
