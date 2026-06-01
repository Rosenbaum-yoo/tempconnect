#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# TempConnect — Dev: Datenbank zuruecksetzen
# =============================================================================
# Setzt die lokale PostgreSQL-Datenbank vollstaendig zurueck:
#   1. Stoppt db + migrate Container
#   2. Loescht das Docker-Volume (alle Daten weg!)
#   3. Startet db + migrate neu (init.sql + alle Migrations)
#   4. Optional: Seed-Daten laden (--seed)
#
# Nutzung:
#   ./scripts/dev/reset-db.sh              # Interaktive Bestaetigung
#   ./scripts/dev/reset-db.sh --yes        # Ohne Bestaetigung
#   ./scripts/dev/reset-db.sh --seed       # Reset + Seed-Daten laden
#   ./scripts/dev/reset-db.sh --yes --seed # Alles automatisch
#
# ACHTUNG: Loescht ALLE lokalen Daten unwiderruflich!
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
cd "$PROJECT_DIR"

# ── Defaults ─────────────────────────────────────────────────────────────────
AUTO_CONFIRM=false
DO_SEED=false
VOLUME_NAME="tempconnect_docker_dbdata"

# ── Argument-Parsing ─────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --yes|-y)   AUTO_CONFIRM=true ;;
    --seed|-s)  DO_SEED=true ;;
    --help|-h)
      echo "Nutzung: $0 [--yes|-y] [--seed|-s]"
      echo ""
      echo "Optionen:"
      echo "  --yes, -y    Keine Bestaetigung abfragen"
      echo "  --seed, -s   Nach Reset automatisch Seed-Daten laden"
      echo "  --help, -h   Diese Hilfe anzeigen"
      exit 0
      ;;
    *) echo "[reset-db] FEHLER: Unbekanntes Argument: $arg"; exit 1 ;;
  esac
done

# ── Hilfsfunktionen ─────────────────────────────────────────────────────────
log()  { echo "[reset-db] $(date +%H:%M:%S) $*"; }
fail() { echo "[reset-db] FEHLER: $*" >&2; exit 1; }

# ── Sicherheitschecks ────────────────────────────────────────────────────────
if [ "${NODE_ENV:-development}" = "production" ]; then
  fail "Dieses Script darf NICHT in Produktion ausgefuehrt werden (NODE_ENV=production)"
fi

# Pruefen ob docker CLI verfuegbar ist
command -v docker &>/dev/null || fail "docker CLI nicht gefunden"

# ── Bestaetigung ─────────────────────────────────────────────────────────────
if [ "$AUTO_CONFIRM" = false ]; then
  echo ""
  echo "  ╔══════════════════════════════════════════════════════════════╗"
  echo "  ║  WARNUNG: Alle lokalen Datenbank-Daten werden geloescht!   ║"
  echo "  ║  Dieser Vorgang kann NICHT rueckgaengig gemacht werden.    ║"
  echo "  ╚══════════════════════════════════════════════════════════════╝"
  echo ""
  read -rp "[reset-db] Fortfahren? (j/N) " confirm
  case "$confirm" in
    j|J|ja|Ja|JA|y|Y|yes|Yes|YES) ;;
    *) echo "[reset-db] Abgebrochen."; exit 0 ;;
  esac
fi

# ── Phase 1: Container stoppen ───────────────────────────────────────────────
log "Stoppe db + migrate Container..."
docker compose stop db migrate 2>/dev/null || true
docker compose rm -f db migrate 2>/dev/null || true

# ── Phase 2: Volume loeschen ─────────────────────────────────────────────────
log "Loesche Volume '$VOLUME_NAME'..."
if docker volume inspect "$VOLUME_NAME" &>/dev/null; then
  docker volume rm "$VOLUME_NAME"
  log "Volume geloescht."
else
  log "Volume '$VOLUME_NAME' existiert nicht — ueberspringe."
fi

# ── Phase 3: Neu starten (db + migrate) ─────────────────────────────────────
log "Starte db Container..."
docker compose up -d db
log "Warte auf Healthcheck (db)..."

# Warte bis DB gesund ist (max 60s)
WAIT=0
MAX_WAIT=60
until docker compose exec db pg_isready -U "${POSTGRES_USER:-tempconnect}" -q 2>/dev/null; do
  WAIT=$((WAIT + 2))
  if [ $WAIT -ge $MAX_WAIT ]; then
    fail "DB-Container nicht bereit nach ${MAX_WAIT}s"
  fi
  sleep 2
done
log "DB bereit nach ${WAIT}s."

# ── Phase 4: Migrations ausfuehren ──────────────────────────────────────────
log "Fuehre Migrations aus..."
docker compose run --rm migrate
log "Migrations abgeschlossen."

# ── Phase 5: Optional Seeding ───────────────────────────────────────────────
if [ "$DO_SEED" = true ]; then
  log "Lade Seed-Daten..."
  if [ -x "$SCRIPT_DIR/seed-data.sh" ]; then
    "$SCRIPT_DIR/seed-data.sh"
  else
    bash "$SCRIPT_DIR/seed-data.sh"
  fi
fi

# ── Fertig ───────────────────────────────────────────────────────────────────
echo ""
log "╔══════════════════════════════════════════════════════════════╗"
log "║  Datenbank erfolgreich zurueckgesetzt!                      ║"
if [ "$DO_SEED" = true ]; then
log "║  Seed-Daten geladen.                                        ║"
fi
log "║  Starte restliche Services: docker compose up -d            ║"
log "╚══════════════════════════════════════════════════════════════╝"
