#!/usr/bin/env bash
# Back up the running Postgres DB to backups/dghr-<timestamp>.sql
# Plain SQL with --clean/--if-exists so it restores cleanly over an existing DB.
# Usage:  scripts/db-backup.sh
set -euo pipefail
cd "$(dirname "$0")/.."

DB_USER="${POSTGRES_USER:-dghr}"
DB_NAME="${POSTGRES_DB:-dghr}"
mkdir -p backups
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="backups/dghr-${STAMP}.sql"

echo "Backing up database '${DB_NAME}' -> ${OUT}"
docker compose exec -T postgres pg_dump --clean --if-exists -U "${DB_USER}" -d "${DB_NAME}" > "${OUT}"
echo "Done: ${OUT} ($(wc -c < "${OUT}") bytes)"
