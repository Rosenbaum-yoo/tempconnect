#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# TempConnect – Production Update (Zero-Downtime-Friendly)
# git pull → rebuild → restart → healthcheck
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

COMPOSE_FILES="-f docker-compose.prod.yml"
[ "${MANAGED_REDIS:-0}" = "1" ] && COMPOSE_FILES="$COMPOSE_FILES -f docker-compose.prod.managed.yml"

echo "============================================="
echo "[prod-update] TempConnect Production Update"
echo "============================================="

# 1) Git pull (falls Git-Repo)
if [ -d .git ]; then
  echo "[prod-update] Git pull..."
  git pull --ff-only || { echo "[prod-update] WARN: git pull fehlgeschlagen (kein fast-forward). Manuell prüfen."; }
fi

# 2) Rebuild + restart
echo "[prod-update] Rebuild + Restart..."
docker compose $COMPOSE_FILES up -d --build

# 3) Warten
echo "[prod-update] Warte 15s auf Startup..."
sleep 15

# 4) Healthcheck
echo "[prod-update] Healthcheck:"
docker compose $COMPOSE_FILES ps
echo ""
if curl -sf http://127.0.0.1:${FRONTEND_PORT:-8080}/health; then
  echo " → Healthcheck OK"
else
  echo " → WARN: Healthcheck fehlgeschlagen. Logs prüfen:"
  echo "   ./scripts/prod-logs.sh api 50"
fi

# 5) Alte Images aufräumen
echo "[prod-update] Alte Images aufräumen..."
docker image prune -f

echo ""
echo "[prod-update] Update abgeschlossen."
