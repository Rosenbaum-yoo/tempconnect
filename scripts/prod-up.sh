#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# TempConnect – Production Start
# Nutzt IMMER docker-compose.prod.yml (kein override, kein dev-compose).
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

COMPOSE_FILES="-f docker-compose.prod.yml"

# Optional: Managed Redis overlay (kein lokaler Redis-Container)
if [ "${MANAGED_REDIS:-0}" = "1" ]; then
  COMPOSE_FILES="$COMPOSE_FILES -f docker-compose.prod.managed.yml"
  echo "[prod-up] Managed Redis aktiv – lokaler Redis-Container deaktiviert."
fi

echo "[prod-up] Starting TempConnect Production..."
echo "[prod-up] Compose files: $COMPOSE_FILES"
docker compose $COMPOSE_FILES up -d --build

echo ""
echo "[prod-up] Warte auf Healthchecks..."
sleep 10
docker compose $COMPOSE_FILES ps

echo ""
echo "[prod-up] Healthcheck:"
curl -sf http://127.0.0.1:${FRONTEND_PORT:-8080}/health && echo " → OK" || echo " → FAIL (API evtl. noch nicht ready, warte 15s)"
