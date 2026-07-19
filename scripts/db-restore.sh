#!/usr/bin/env bash
# Restore the Postgres DB from a dump made by db-backup.sh.
# OVERWRITES current data (the dump drops and recreates each object).
# Usage:  scripts/db-restore.sh backups/dghr-YYYYMMDD-HHMMSS.sql
set -euo pipefail
cd "$(dirname "$0")/.."

FILE="${1:-}"
if [ -z "${FILE}" ] || [ ! -f "${FILE}" ]; then
  echo "Usage: scripts/db-restore.sh <backup.sql>"
  echo "Available backups:"; ls -1 backups/*.sql 2>/dev/null || echo "  (none in backups/)"
  exit 1
fi

DB_USER="${POSTGRES_USER:-dghr}"
DB_NAME="${POSTGRES_DB:-dghr}"

echo "Restoring '${DB_NAME}' from ${FILE} — this OVERWRITES current data."
docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "${DB_USER}" -d "${DB_NAME}" < "${FILE}"
echo "Restore complete."
