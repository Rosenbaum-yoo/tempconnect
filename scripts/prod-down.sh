#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

COMPOSE_FILES="-f docker-compose.prod.yml"
[ "${MANAGED_REDIS:-0}" = "1" ] && COMPOSE_FILES="$COMPOSE_FILES -f docker-compose.prod.managed.yml"

echo "[prod-down] Stopping TempConnect Production..."
docker compose $COMPOSE_FILES down
echo "[prod-down] Done."
