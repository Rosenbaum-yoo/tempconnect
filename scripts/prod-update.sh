#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# TempConnect – Production Update (Zero-Downtime-Friendly)
# optional git pull → rebuild → restart → healthcheck
# Funktioniert sowohl aus einem Git-Checkout als auch aus einem entpackten Release-Artefakt.
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

COMPOSE_FILES="-f docker-compose.prod.yml"
[ "${MANAGED_REDIS:-0}" = "1" ] && COMPOSE_FILES="$COMPOSE_FILES -f docker-compose.prod.managed.yml"

echo "============================================="
echo "[prod-update] TempConnect Production Update"
echo "============================================="

# 0) Pre-Deploy Backup (Sicherheitsnetz — Rollback-Punkt vor Schema-Änderungen)
if [ -x "$PROJECT_DIR/scripts/backup.sh" ]; then
  echo "[prod-update] Pre-Deploy Backup (DB only)..."
  "$PROJECT_DIR/scripts/backup.sh" --db-only || {
    echo "[prod-update] FEHLER: Pre-Deploy Backup fehlgeschlagen. Deploy abgebrochen."
    echo "[prod-update] Backup manuell prüfen: ./scripts/backup.sh --db-only"
    exit 1
  }
  echo "[prod-update] Pre-Deploy Backup erfolgreich."
  if [ -x "$PROJECT_DIR/scripts/backup-verify.sh" ]; then
    BACKUP_ROOT="${BACKUP_DIR:-$PROJECT_DIR/backups}"
    LATEST_BACKUP="$(ls -td "$BACKUP_ROOT"/*/ 2>/dev/null | head -1 || true)"
    if [ -z "$LATEST_BACKUP" ]; then
      echo "[prod-update] FEHLER: Kein Backup zur Verifikation gefunden in $BACKUP_ROOT. Deploy abgebrochen."
      exit 1
    fi
    LATEST_BACKUP="${LATEST_BACKUP%/}"
    echo "[prod-update] Verifiziere Pre-Deploy Backup: $LATEST_BACKUP"
    "$PROJECT_DIR/scripts/backup-verify.sh" "$LATEST_BACKUP" || {
      echo "[prod-update] FEHLER: Backup-Verifikation fehlgeschlagen. Deploy abgebrochen."
      exit 1
    }
    echo "[prod-update] Backup-Verifikation erfolgreich."
  else
    echo "[prod-update] WARN: backup-verify.sh nicht gefunden — Backup wurde nicht verifiziert"
  fi
else
  echo "[prod-update] WARN: backup.sh nicht gefunden — Deploy ohne Backup (nicht empfohlen)"
fi

# 1) Git pull (falls Git-Repo)
if [ -d .git ]; then
  echo "[prod-update] Git pull..."
  git pull --ff-only || { echo "[prod-update] WARN: git pull fehlgeschlagen (kein fast-forward). Manuell prüfen."; }
else
  echo "[prod-update] Kein Git-Repo erkannt — verwende bereitgestelltes Release-Artefakt."
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
