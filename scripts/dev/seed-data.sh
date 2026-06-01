#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# TempConnect — Dev: Seed-Daten laden
# =============================================================================
# Laedt Entwicklungs-/Demo-Daten in die laufende lokale Datenbank.
# Seed-Dateien liegen in sql/seeds/*.sql.
#
# Nutzung:
#   ./scripts/dev/seed-data.sh                    # Alle Seeds ausfuehren
#   ./scripts/dev/seed-data.sh --file=dev-data.sql  # Nur eine Datei
#   ./scripts/dev/seed-data.sh --clean            # Tabellen vorher leeren
#   ./scripts/dev/seed-data.sh --list             # Verfuegbare Seeds auflisten
#
# Voraussetzung: db-Container laeuft (docker compose up -d db)
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
cd "$PROJECT_DIR"

# ── Defaults ─────────────────────────────────────────────────────────────────
SEED_DIR="$PROJECT_DIR/sql/seeds"
TARGET_FILE=""
DO_CLEAN=false
DO_LIST=false

DB_CONTAINER="${DB_CONTAINER:-tempconnect_db}"
PG_USER="${POSTGRES_USER:-tempconnect}"
PG_DB="${POSTGRES_DB:-tempconnect}"

# ── Argument-Parsing ─────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --file=*)   TARGET_FILE="${arg#--file=}" ;;
    --clean|-c) DO_CLEAN=true ;;
    --list|-l)  DO_LIST=true ;;
    --help|-h)
      echo "Nutzung: $0 [--file=<datei.sql>] [--clean] [--list]"
      echo ""
      echo "Optionen:"
      echo "  --file=<name>  Nur diese Seed-Datei ausfuehren (Dateiname ohne Pfad)"
      echo "  --clean, -c    Seed-Tabellen vorher leeren (TRUNCATE CASCADE)"
      echo "  --list, -l     Verfuegbare Seed-Dateien auflisten"
      echo "  --help, -h     Diese Hilfe anzeigen"
      echo ""
      echo "Seed-Verzeichnis: sql/seeds/"
      exit 0
      ;;
    *) echo "[seed-data] FEHLER: Unbekanntes Argument: $arg"; exit 1 ;;
  esac
done

# ── Hilfsfunktionen ─────────────────────────────────────────────────────────
log()  { echo "[seed-data] $(date +%H:%M:%S) $*"; }
fail() { echo "[seed-data] FEHLER: $*" >&2; exit 1; }

# SQL im DB-Container ausfuehren
run_psql() {
  docker compose exec -T db psql -U "$PG_USER" -d "$PG_DB" "$@"
}

# ── Sicherheitscheck ────────────────────────────────────────────────────────
if [ "${NODE_ENV:-development}" = "production" ]; then
  fail "Seed-Daten duerfen NICHT in Produktion geladen werden (NODE_ENV=production)"
fi

# ── Seed-Verzeichnis pruefen ────────────────────────────────────────────────
if [ ! -d "$SEED_DIR" ]; then
  fail "Seed-Verzeichnis nicht gefunden: $SEED_DIR"
fi

SEED_FILES=$(find "$SEED_DIR" -name "*.sql" -type f 2>/dev/null | sort)
if [ -z "$SEED_FILES" ]; then
  fail "Keine Seed-Dateien in $SEED_DIR gefunden"
fi

# ── List-Modus ───────────────────────────────────────────────────────────────
if [ "$DO_LIST" = true ]; then
  echo ""
  echo "Verfuegbare Seed-Dateien (sql/seeds/):"
  echo "──────────────────────────────────────────"
  for f in $SEED_FILES; do
    filename=$(basename "$f")
    # Erste Kommentarzeile als Beschreibung extrahieren
    desc=$(head -1 "$f" | sed 's/^-- *//' | head -c 60)
    printf "  %-30s %s\n" "$filename" "$desc"
  done
  echo ""
  exit 0
fi

# ── DB-Container pruefen ────────────────────────────────────────────────────
if ! docker compose exec db pg_isready -U "$PG_USER" -q 2>/dev/null; then
  fail "DB-Container nicht bereit. Starte ihn mit: docker compose up -d db"
fi

# ── Clean-Modus: Tabellen leeren ────────────────────────────────────────────
if [ "$DO_CLEAN" = true ]; then
  log "Leere Seed-Tabellen (TRUNCATE CASCADE)..."
  run_psql -c "
    DO \$\$
    BEGIN
      -- Reihenfolge beachten: abhaengige Tabellen zuerst
      TRUNCATE timesheet_entries CASCADE;
      TRUNCATE timesheets CASCADE;
      TRUNCATE requests CASCADE;
      TRUNCATE listings CASCADE;
      TRUNCATE org_memberships CASCADE;
      TRUNCATE subscriptions CASCADE;
      TRUNCATE organizations CASCADE;
      -- users zuletzt (wegen FK-Referenzen)
      TRUNCATE users CASCADE;
      RAISE NOTICE 'Seed-Tabellen geleert.';
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'Einige Tabellen existieren noch nicht — uebersprungen.';
    END
    \$\$;
  "
  log "Tabellen geleert."
fi

# ── Seeds ausfuehren ────────────────────────────────────────────────────────
if [ -n "$TARGET_FILE" ]; then
  # Einzelne Datei
  SEED_PATH="$SEED_DIR/$TARGET_FILE"
  if [ ! -f "$SEED_PATH" ]; then
    fail "Seed-Datei nicht gefunden: $TARGET_FILE (Pfad: $SEED_PATH)"
  fi
  log "Fuehre Seed aus: $TARGET_FILE"
  run_psql < "$SEED_PATH"
  log "Seed '$TARGET_FILE' geladen."
else
  # Alle Seeds in sortierter Reihenfolge
  COUNT=0
  for seed_file in $SEED_FILES; do
    filename=$(basename "$seed_file")
    log "Fuehre Seed aus: $filename"
    run_psql < "$seed_file"
    COUNT=$((COUNT + 1))
  done
  log "$COUNT Seed-Dateien erfolgreich geladen."
fi

# ── Zusammenfassung ──────────────────────────────────────────────────────────
echo ""
log "Seed-Daten geladen. Demo-Accounts:"
log "  Company:  demo@firma.de       (Passwort: password123)"
log "  Agency:   test@agentur.de     (Passwort: password123)"
echo ""
