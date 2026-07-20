#!/usr/bin/env bash
# Bootstrap the DGHR demo on a fresh Ubuntu Azure VM. Run this ON the VM, from the repo
# root, after cloning the repo and creating a .env (see .env.prod.example).
# Idempotent: safe to re-run to redeploy after a `git pull`.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

echo "==> [1/4] Ensuring Docker + Compose plugin are installed..."
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER" || true
  echo "    Docker installed. (Group change applies next login; this run uses sudo.)"
fi

# Use sudo only if the current shell can't reach the Docker daemon yet.
DOCKER="docker"
if ! docker info >/dev/null 2>&1; then
  DOCKER="sudo docker"
fi

echo "==> [2/4] Checking .env..."
if [ ! -f .env ]; then
  echo "    ERROR: no .env found. Copy .env.prod.example to .env, fill it in, then re-run." >&2
  exit 1
fi

echo "==> [3/4] Building + starting the stack..."
$DOCKER compose -f docker-compose.prod.yml up -d --build

echo "==> [4/4] Status:"
$DOCKER compose -f docker-compose.prod.yml ps

echo
echo "Done. Follow logs with:"
echo "  $DOCKER compose -f docker-compose.prod.yml logs -f"
