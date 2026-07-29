#!/usr/bin/env bash
# Pull latest main and rebuild the Docker Compose stack.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log() {
  echo "[deploy $(date -Iseconds)] $*"
}

log "Fetching origin/main..."
git fetch origin main
git reset --hard origin/main

log "Building and restarting containers..."
docker compose up -d --build --remove-orphans

log "Waiting for health check..."
for _ in $(seq 1 45); do
  if curl -sf http://127.0.0.1:4321/health >/dev/null; then
    log "Deploy successful."
    exit 0
  fi
  sleep 2
done

log "Health check failed."
docker compose ps
docker compose logs --tail=80 api web
exit 1
