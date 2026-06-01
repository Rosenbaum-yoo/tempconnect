#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# TempConnect — Restore Script
# =============================================================================
# Stellt Datenbank und/oder Upload-Dateien aus einem Backup wieder her.
#
# ACHTUNG: Ein Restore ÜBERSCHREIBT bestehende Daten unwiderruflich!
#          Erstelle VORHER ein aktuelles Backup.
#
# Nutzung:
#   ./scripts/restore.sh backups/2026-03-13_083000              # Vollrestore
#   ./scripts/restore.sh backups/2026-03-13_083000 --db-only    # Nur DB
#   ./scripts/restore.sh backups/2026-03-13_083000 --uploads-only
#   ./scripts/restore.sh backups/2026-03-13_083000 --dry-run    # Nur prüfen
#   ./scripts/restore.sh backups/2026-03-13_083000 --force       # Ohne Bestätigung
#
# Exit-Codes: 0 = Erfolg, 1 = Fehler, 2 = Abbruch durch Benutzer
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# ── Konfiguration ───────────────────────────────────────────────────────────
DB_CONTAINER="${DB_CONTAINER:-tempconnect_db}"
API_CONTAINER="${API_CONTAINER:-tempconnect_api}"

# ── Argument-Parsing ────────────────────────────────────────────────────────
BACKUP_PATH=""
DO_DB=true
DO_UPLOADS=true
DRY_RUN=false
FORCE=false

for arg in "$@"; do
  case "$arg" in
    --db-only)      DO_UPLOADS=false ;;
    --uploads-only) DO_DB=false ;;
    --dry-run)      DRY_RUN=true ;;
    --force)        FORCE=true ;;
    --help|-h)
      echo "Nutzung: $0 <backup-verzeichnis> [--db-only|--uploads-only] [--dry-run] [--force]"
      echo ""
      echo "Optionen:"
      echo "  --db-only       Nur Datenbank wiederherstellen"
      echo "  --uploads-only  Nur Upload-Dateien wiederherstellen"
      echo "  --dry-run       Nur prüfen, nichts ändern"
      echo "  --force         Ohne interaktive Bestätigung"
      echo ""
      echo "Umgebungsvariablen:"
      echo "  DATABASE_URL    Managed DB Connection String"
      echo "  DB_CONTAINER    Docker-Container Name (Default: tempconnect_db)"
      echo "  API_CONTAINER   API-Container Name (Default: tempconnect_api)"
      exit 0
      ;;
    -*)
      echo "[restore] FEHLER: Unbekannte Option: $arg" >&2; exit 1 ;;
    *)
      if [ -z "$BACKUP_PATH" ]; then
        BACKUP_PATH="$arg"
      else
        echo "[restore] FEHLER: Nur ein Backup-Verzeichnis erlaubt" >&2; exit 1
      fi
      ;;
  esac
done

if [ -z "$BACKUP_PATH" ]; then
  echo "[restore] FEHLER: Backup-Verzeichnis nicht angegeben"
  echo "Nutzung: $0 <backup-verzeichnis> [--db-only|--uploads-only] [--dry-run] [--force]"
  exit 1
fi

# ── Hilfsfunktionen ─────────────────────────────────────────────────────────
log()  { echo "[restore] $(date +%H:%M:%S) $*"; }
warn() { echo "[restore] ⚠ $*" >&2; }
fail() { echo "[restore] FEHLER: $*" >&2; exit 1; }

sha256_of() {
  if command -v sha256sum &>/dev/null; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum &>/dev/null; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    echo "NO_SHA_TOOL"
  fi
}

# ── Backup validieren ───────────────────────────────────────────────────────
log "═══════════════════════════════════════════════════"
log "TempConnect Restore"
log "═══════════════════════════════════════════════════"

[ -d "$BACKUP_PATH" ] || fail "Verzeichnis existiert nicht: $BACKUP_PATH"

MANIFEST="$BACKUP_PATH/manifest.json"
[ -f "$MANIFEST" ] || fail "manifest.json fehlt in $BACKUP_PATH"

DB_DUMP="$BACKUP_PATH/db.dump"
UPLOADS_ARCHIVE="$BACKUP_PATH/uploads.tar.gz"

# Manifest lesen
BACKUP_TIMESTAMP=$(python3 -c "
import json; m = json.load(open('$MANIFEST'))
print(m.get('timestamp', 'unbekannt'))
" 2>/dev/null || grep -o '"timestamp"[[:space:]]*:[[:space:]]*"[^"]*"' "$MANIFEST" | head -1 | sed 's/.*: *"\(.*\)"/\1/')

DB_INCLUDED=$(python3 -c "
import json; m = json.load(open('$MANIFEST'))
print(str(m['contents']['db']['included']).lower())
" 2>/dev/null || echo "true")

UPLOADS_INCLUDED=$(python3 -c "
import json; m = json.load(open('$MANIFEST'))
print(str(m['contents']['uploads']['included']).lower())
" 2>/dev/null || echo "true")

DB_SHA=$(python3 -c "
import json; m = json.load(open('$MANIFEST'))
print(m['contents']['db']['sha256'])
" 2>/dev/null || echo "")

UPLOADS_SHA=$(python3 -c "
import json; m = json.load(open('$MANIFEST'))
print(m['contents']['uploads']['sha256'])
" 2>/dev/null || echo "")

log "Backup-Zeitstempel: $BACKUP_TIMESTAMP"
log ""

# Prüfe was tatsächlich wiederhergestellt werden kann
if [ "$DO_DB" = true ] && [ "$DB_INCLUDED" != "true" ]; then
  warn "DB-Restore angefordert, aber DB ist nicht im Backup enthalten"
  DO_DB=false
fi
if [ "$DO_UPLOADS" = true ] && [ "$UPLOADS_INCLUDED" != "true" ]; then
  warn "Upload-Restore angefordert, aber Uploads sind nicht im Backup enthalten"
  DO_UPLOADS=false
fi

if [ "$DO_DB" = false ] && [ "$DO_UPLOADS" = false ]; then
  fail "Nichts zum Wiederherstellen"
fi

if [ -x "$SCRIPT_DIR/backup-verify.sh" ]; then
  log "Verifiziere Backup-Verzeichnis..."
  "$SCRIPT_DIR/backup-verify.sh" "$BACKUP_PATH" || fail "Backup-Verifikation fehlgeschlagen"
  log "Backup-Verifikation bestanden"
  log ""
fi

# ── Prä-Restore Checksums ───────────────────────────────────────────────────
log "Integritätsprüfung..."

if [ "$DO_DB" = true ]; then
  [ -f "$DB_DUMP" ] || fail "db.dump fehlt"
  if [ -n "$DB_SHA" ] && [ "$DB_SHA" != "null" ]; then
    ACTUAL=$(sha256_of "$DB_DUMP")
    if [ "$ACTUAL" = "$DB_SHA" ]; then
      log "  ✓ DB-Dump Checksum OK"
    else
      fail "DB-Dump Checksum FALSCH — Backup möglicherweise beschädigt"
    fi
  fi
fi

if [ "$DO_UPLOADS" = true ]; then
  [ -f "$UPLOADS_ARCHIVE" ] || fail "uploads.tar.gz fehlt"
  if [ -n "$UPLOADS_SHA" ] && [ "$UPLOADS_SHA" != "null" ]; then
    ACTUAL=$(sha256_of "$UPLOADS_ARCHIVE")
    if [ "$ACTUAL" = "$UPLOADS_SHA" ]; then
      log "  ✓ Uploads-Archiv Checksum OK"
    else
      fail "Uploads-Archiv Checksum FALSCH — Backup möglicherweise beschädigt"
    fi
  fi
fi

log "Integritätsprüfung bestanden"
log ""

# ── Restore-Plan anzeigen ───────────────────────────────────────────────────
log "Restore-Plan:"
[ "$DO_DB" = true ]      && log "  → Datenbank: pg_restore aus db.dump"
[ "$DO_UPLOADS" = true ] && log "  → Uploads: Extraktion aus uploads.tar.gz"
log ""

if [ "$DRY_RUN" = true ]; then
  log "DRY-RUN: Alle Prüfungen bestanden. Keine Änderungen vorgenommen."
  exit 0
fi

# ── Interaktive Bestätigung ──────────────────────────────────────────────────
if [ "$FORCE" = false ]; then
  log "╔═══════════════════════════════════════════════════╗"
  log "║  ACHTUNG: Diese Aktion ÜBERSCHREIBT Daten!       ║"
  log "║  Erstelle VORHER ein aktuelles Backup.            ║"
  log "╚═══════════════════════════════════════════════════╝"
  echo ""
  read -rp "[restore] Fortfahren? (ja/nein): " CONFIRM
  if [ "$CONFIRM" != "ja" ]; then
    log "Abbruch durch Benutzer."
    exit 2
  fi
  echo ""
fi

STARTED_AT=$(date +%s)

# ── 1. Upload-Dateien wiederherstellen (ZUERST — vor DB) ────────────────────
# Reihenfolge: Uploads zuerst, damit DB-Referenzen auf existierende Dateien zeigen.

if [ "$DO_UPLOADS" = true ]; then
  log "Upload-Dateien wiederherstellen..."

  # Prüfe ob API-Container läuft
  docker ps --format '{{.Names}}' | grep -q "^${API_CONTAINER}$" \
    || fail "API-Container '$API_CONTAINER' läuft nicht"

  # Backup existierender Uploads im Container (Sicherheitsnetz)
  log "  Sichere bestehende Uploads im Container..."
  docker exec "$API_CONTAINER" sh -c '
    if [ -d /app/uploads ] && [ "$(ls -A /app/uploads 2>/dev/null)" ]; then
      cp -r /app/uploads /app/uploads.pre-restore 2>/dev/null || true
    fi
  '

  # Alte Uploads entfernen und neue einspielen
  log "  Extrahiere Uploads..."
  docker exec "$API_CONTAINER" sh -c 'rm -rf /app/uploads/*'
  docker cp "$UPLOADS_ARCHIVE" "$API_CONTAINER:/tmp/uploads-restore.tar.gz"
  docker exec "$API_CONTAINER" sh -c 'tar xzf /tmp/uploads-restore.tar.gz -C /app && rm /tmp/uploads-restore.tar.gz'

  # Berechtigungen sicherstellen
  docker exec "$API_CONTAINER" sh -c 'chown -R appuser:appgroup /app/uploads 2>/dev/null || true'

  UPLOAD_COUNT=$(docker exec "$API_CONTAINER" sh -c 'find /app/uploads -type f 2>/dev/null | wc -l' | tr -d ' ')
  log "  ✓ $UPLOAD_COUNT Upload-Dateien wiederhergestellt"
fi

# ── 2. Datenbank wiederherstellen ────────────────────────────────────────────

if [ "$DO_DB" = true ]; then
  log "Datenbank wiederherstellen..."

  if [ -n "${DATABASE_URL:-}" ]; then
    # ── Managed DB: pg_restore direkt ────────────────────────────────────
    log "  Modus: Managed DB (DATABASE_URL)"
    command -v pg_restore &>/dev/null || fail "pg_restore nicht gefunden"

    # Datenbank-Name aus URL extrahieren
    DB_NAME=$(echo "$DATABASE_URL" | sed 's|.*/||' | sed 's|\?.*||')
    log "  Ziel-Datenbank: $DB_NAME"

    pg_restore "$DB_DUMP" \
      --dbname="$DATABASE_URL" \
      --clean \
      --if-exists \
      --no-owner \
      --no-privileges \
      --single-transaction \
      --verbose 2>&1 | while IFS= read -r line; do log "  pg_restore: $line"; done

  else
    # ── Lokale Docker DB ─────────────────────────────────────────────────
    log "  Modus: Docker-Container ($DB_CONTAINER)"

    docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$" \
      || fail "DB-Container '$DB_CONTAINER' läuft nicht"

    PG_USER=$(docker exec "$DB_CONTAINER" printenv POSTGRES_USER 2>/dev/null || echo "tempconnect")
    PG_DB=$(docker exec "$DB_CONTAINER" printenv POSTGRES_DB 2>/dev/null || echo "tempconnect")

    log "  Ziel: $PG_DB (User: $PG_USER)"

    # Dump in Container kopieren
    docker cp "$DB_DUMP" "$DB_CONTAINER:/tmp/restore.dump"

    # Aktive Verbindungen trennen
    log "  Trenne aktive DB-Verbindungen..."
    docker exec "$DB_CONTAINER" psql -U "$PG_USER" -d postgres -c "
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = '$PG_DB' AND pid <> pg_backend_pid();
    " 2>/dev/null || true

    # pg_restore
    docker exec "$DB_CONTAINER" \
      pg_restore /tmp/restore.dump \
        --dbname="$PG_DB" \
        --username="$PG_USER" \
        --clean \
        --if-exists \
        --no-owner \
        --no-privileges \
        --single-transaction \
      2>&1 | while IFS= read -r line; do log "  pg_restore: $line"; done

    # Cleanup
    docker exec "$DB_CONTAINER" rm -f /tmp/restore.dump
  fi

  # Schnelltest: Tabellen zählen
  if [ -n "${DATABASE_URL:-}" ]; then
    TABLE_COUNT=$(psql "$DATABASE_URL" -t -c "
      SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';
    " 2>/dev/null | tr -d ' ' || echo "?")
  else
    TABLE_COUNT=$(docker exec "$DB_CONTAINER" psql -U "${PG_USER:-tempconnect}" -d "${PG_DB:-tempconnect}" -t -c "
      SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';
    " 2>/dev/null | tr -d ' ' || echo "?")
  fi

  log "  ✓ Datenbank wiederhergestellt ($TABLE_COUNT Tabellen)"
fi

# ── Zusammenfassung ──────────────────────────────────────────────────────────
ENDED_AT=$(date +%s)
DURATION=$(( ENDED_AT - STARTED_AT ))

log ""
log "═══════════════════════════════════════════════════"
log "Restore abgeschlossen in ${DURATION}s"
log "  Quelle: $BACKUP_PATH (vom $BACKUP_TIMESTAMP)"
[ "$DO_DB" = true ]      && log "  ✓ Datenbank wiederhergestellt"
[ "$DO_UPLOADS" = true ] && log "  ✓ Upload-Dateien wiederhergestellt"
log ""
log "NÄCHSTE SCHRITTE:"
log "  1. Health prüfen: curl -sf http://127.0.0.1:${FRONTEND_PORT:-8080}/health"
log "  2. API prüfen: curl -sf http://127.0.0.1:${FRONTEND_PORT:-8080}/api/health"
log "  3. Stichproben in der UI prüfen"
log "  4. Falls Probleme: Upload-Backup unter /app/uploads.pre-restore"
log "═══════════════════════════════════════════════════"

exit 0
