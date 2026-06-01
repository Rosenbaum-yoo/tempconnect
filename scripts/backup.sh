#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# TempConnect — Backup Script
# =============================================================================
# Erzeugt ein konsistentes Backup von:
#   1. PostgreSQL-Datenbank (pg_dump, Custom-Format)
#   2. Upload-Dateien (tar.gz aus Docker Volume oder Verzeichnis)
#   3. Manifest (Checksums, Metadaten)
#
# Erkennt automatisch:
#   - Managed DB via DATABASE_URL (Produktion / Hetzner)
#   - Lokaler Docker-Container (Development)
#
# Nutzung:
#   ./scripts/backup.sh                      # Vollbackup
#   ./scripts/backup.sh --db-only            # Nur Datenbank
#   ./scripts/backup.sh --uploads-only       # Nur Uploads
#   BACKUP_DIR=/mnt/backup ./scripts/backup.sh  # Anderer Speicherort
#
# Exit-Codes: 0 = Erfolg, 1 = Fehler
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# ── Konfiguration (überschreibbar via Umgebungsvariablen) ────────────────────
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
DB_CONTAINER="${DB_CONTAINER:-tempconnect_db}"
API_CONTAINER="${API_CONTAINER:-tempconnect_api}"
TIMESTAMP="$(date +%Y-%m-%d_%H%M%S)"
BACKUP_PATH="$BACKUP_DIR/$TIMESTAMP"

# ── Modus-Parsing ────────────────────────────────────────────────────────────
DO_DB=true
DO_UPLOADS=true

for arg in "$@"; do
  case "$arg" in
    --db-only)      DO_UPLOADS=false ;;
    --uploads-only) DO_DB=false ;;
    --help|-h)
      echo "Nutzung: $0 [--db-only|--uploads-only]"
      echo ""
      echo "Umgebungsvariablen:"
      echo "  BACKUP_DIR             Zielverzeichnis (Default: ./backups)"
      echo "  BACKUP_RETENTION_DAYS  Aufbewahrung in Tagen (Default: 30)"
      echo "  DATABASE_URL           Managed DB Connection String"
      echo "  DB_CONTAINER           Docker-Container Name (Default: tempconnect_db)"
      echo "  API_CONTAINER          API-Container Name (Default: tempconnect_api)"
      exit 0
      ;;
    *) echo "[backup] FEHLER: Unbekanntes Argument: $arg"; exit 1 ;;
  esac
done

# ── Hilfsfunktionen ─────────────────────────────────────────────────────────
log()  { echo "[backup] $(date +%H:%M:%S) $*"; }
fail() { echo "[backup] FEHLER: $*" >&2; exit 1; }

sha256_of() {
  if command -v sha256sum &>/dev/null; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum &>/dev/null; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    fail "Weder sha256sum noch shasum gefunden"
  fi
}

file_size_bytes() {
  stat --printf="%s" "$1" 2>/dev/null || stat -f "%z" "$1" 2>/dev/null || echo "0"
}

# ── Voraussetzungen prüfen ───────────────────────────────────────────────────
command -v docker &>/dev/null || fail "docker CLI nicht gefunden"

if [ "$DO_DB" = true ]; then
  # Prüfe ob pg_dump verfügbar ist (lokal oder im Container)
  if [ -n "${DATABASE_URL:-}" ]; then
    command -v pg_dump &>/dev/null || fail "pg_dump nicht gefunden (benötigt für Managed DB Backup)"
  else
    docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$" \
      || fail "DB-Container '$DB_CONTAINER' läuft nicht. Starte ihn oder setze DATABASE_URL."
  fi
fi

if [ "$DO_UPLOADS" = true ]; then
  docker ps --format '{{.Names}}' | grep -q "^${API_CONTAINER}$" \
    || fail "API-Container '$API_CONTAINER' läuft nicht (benötigt für Upload-Backup)"
fi

# ── Backup-Verzeichnis erstellen ─────────────────────────────────────────────
mkdir -p "$BACKUP_PATH"
log "Backup gestartet → $BACKUP_PATH"
STARTED_AT=$(date +%s)

# ── 1. Datenbank-Backup ─────────────────────────────────────────────────────
DB_DUMP_FILE="$BACKUP_PATH/db.dump"
DB_SIZE=0
DB_CHECKSUM=""
DB_METHOD=""

if [ "$DO_DB" = true ]; then
  log "Datenbank-Backup..."

  if [ -n "${DATABASE_URL:-}" ]; then
    # ── Managed DB: pg_dump direkt via DATABASE_URL ──────────────────────
    DB_METHOD="managed"
    log "  Modus: Managed DB (DATABASE_URL)"
    pg_dump "$DATABASE_URL" \
      --format=custom \
      --compress=6 \
      --no-owner \
      --no-privileges \
      --verbose \
      --file="$DB_DUMP_FILE" 2>&1 | while IFS= read -r line; do log "  pg_dump: $line"; done

  else
    # ── Lokale Docker DB: pg_dump im Container ──────────────────────────
    DB_METHOD="docker"
    log "  Modus: Docker-Container ($DB_CONTAINER)"

    # Credentials aus Container-Environment lesen
    PG_USER=$(docker exec "$DB_CONTAINER" printenv POSTGRES_USER 2>/dev/null || echo "tempconnect")
    PG_DB=$(docker exec "$DB_CONTAINER" printenv POSTGRES_DB 2>/dev/null || echo "tempconnect")

    docker exec "$DB_CONTAINER" \
      pg_dump -U "$PG_USER" -d "$PG_DB" \
        --format=custom \
        --compress=6 \
        --no-owner \
        --no-privileges \
      > "$DB_DUMP_FILE"
  fi

  # Prüfe ob Dump valide ist
  if [ ! -s "$DB_DUMP_FILE" ]; then
    fail "DB-Dump ist leer — Backup abgebrochen"
  fi

  DB_SIZE=$(file_size_bytes "$DB_DUMP_FILE")
  DB_CHECKSUM=$(sha256_of "$DB_DUMP_FILE")
  log "  DB-Dump: $(( DB_SIZE / 1024 )) KB, SHA-256: ${DB_CHECKSUM:0:16}..."
else
  log "Datenbank-Backup übersprungen (--uploads-only)"
fi

# ── 2. Upload-Dateien-Backup ────────────────────────────────────────────────
UPLOADS_FILE="$BACKUP_PATH/uploads.tar.gz"
UPLOADS_SIZE=0
UPLOADS_CHECKSUM=""
UPLOADS_FILE_COUNT=0

if [ "$DO_UPLOADS" = true ]; then
  log "Upload-Dateien-Backup..."

  # Prüfe ob Uploads im Container existieren
  UPLOAD_EXISTS=$(docker exec "$API_CONTAINER" sh -c 'test -d /app/uploads && echo "yes" || echo "no"')

  if [ "$UPLOAD_EXISTS" = "yes" ]; then
    # Anzahl Dateien ermitteln
    UPLOADS_FILE_COUNT=$(docker exec "$API_CONTAINER" sh -c 'find /app/uploads -type f 2>/dev/null | wc -l' | tr -d ' ')

    if [ "$UPLOADS_FILE_COUNT" -gt 0 ]; then
      # tar.gz direkt im Container erzeugen und streamen
      docker exec "$API_CONTAINER" \
        tar czf - -C /app uploads \
        > "$UPLOADS_FILE"

      UPLOADS_SIZE=$(file_size_bytes "$UPLOADS_FILE")
      UPLOADS_CHECKSUM=$(sha256_of "$UPLOADS_FILE")
      log "  Uploads: $UPLOADS_FILE_COUNT Dateien, $(( UPLOADS_SIZE / 1024 )) KB, SHA-256: ${UPLOADS_CHECKSUM:0:16}..."
    else
      log "  Keine Upload-Dateien vorhanden — leeres Archiv erstellt"
      tar czf "$UPLOADS_FILE" --files-from /dev/null
      UPLOADS_SIZE=$(file_size_bytes "$UPLOADS_FILE")
      UPLOADS_CHECKSUM=$(sha256_of "$UPLOADS_FILE")
    fi
  else
    log "  Upload-Verzeichnis existiert nicht im Container — leeres Archiv erstellt"
    tar czf "$UPLOADS_FILE" --files-from /dev/null
    UPLOADS_SIZE=$(file_size_bytes "$UPLOADS_FILE")
    UPLOADS_CHECKSUM=$(sha256_of "$UPLOADS_FILE")
  fi
else
  log "Upload-Backup übersprungen (--db-only)"
fi

# ── 3. Manifest erzeugen ────────────────────────────────────────────────────
ENDED_AT=$(date +%s)
DURATION=$(( ENDED_AT - STARTED_AT ))

# PostgreSQL Version ermitteln
PG_VERSION=""
if [ "$DO_DB" = true ]; then
  if [ -n "${DATABASE_URL:-}" ]; then
    PG_VERSION=$(psql "$DATABASE_URL" -t -c "SELECT version();" 2>/dev/null | head -1 | xargs || echo "unknown")
  else
    PG_VERSION=$(docker exec "$DB_CONTAINER" psql -U "${PG_USER:-tempconnect}" -t -c "SELECT version();" 2>/dev/null | head -1 | xargs || echo "unknown")
  fi
fi

cat > "$BACKUP_PATH/manifest.json" <<MANIFEST
{
  "version": "1.0",
  "project": "tempconnect",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "timestamp_local": "$TIMESTAMP",
  "duration_seconds": $DURATION,
  "postgres_version": "$PG_VERSION",
  "db_method": "$DB_METHOD",
  "contents": {
    "db": {
      "included": $DO_DB,
      "file": "db.dump",
      "format": "pg_dump_custom",
      "size_bytes": $DB_SIZE,
      "sha256": "$DB_CHECKSUM"
    },
    "uploads": {
      "included": $DO_UPLOADS,
      "file": "uploads.tar.gz",
      "format": "tar_gzip",
      "size_bytes": $UPLOADS_SIZE,
      "file_count": $UPLOADS_FILE_COUNT,
      "sha256": "$UPLOADS_CHECKSUM"
    }
  },
  "retention_days": $BACKUP_RETENTION_DAYS
}
MANIFEST

log "Manifest erstellt"

# ── 4. Retention — alte Backups aufräumen ────────────────────────────────────
if [ "$BACKUP_RETENTION_DAYS" -gt 0 ]; then
  log "Retention: Lösche Backups älter als $BACKUP_RETENTION_DAYS Tage..."
  DELETED_COUNT=0

  for old_backup in "$BACKUP_DIR"/*/manifest.json; do
    [ -f "$old_backup" ] || continue
    old_dir="$(dirname "$old_backup")"

    # Vergleiche Verzeichnis-Alter
    if [ "$(find "$old_dir" -maxdepth 0 -mtime +"$BACKUP_RETENTION_DAYS" 2>/dev/null)" ]; then
      log "  Lösche: $(basename "$old_dir")"
      rm -rf "$old_dir"
      DELETED_COUNT=$((DELETED_COUNT + 1))
    fi
  done

  if [ "$DELETED_COUNT" -gt 0 ]; then
    log "  $DELETED_COUNT alte Backups gelöscht"
  else
    log "  Keine abgelaufenen Backups gefunden"
  fi
fi

# ── Zusammenfassung ──────────────────────────────────────────────────────────
TOTAL_SIZE=0
[ -f "$DB_DUMP_FILE" ] && TOTAL_SIZE=$((TOTAL_SIZE + DB_SIZE))
[ -f "$UPLOADS_FILE" ] && TOTAL_SIZE=$((TOTAL_SIZE + UPLOADS_SIZE))

log "═══════════════════════════════════════════════════"
log "Backup abgeschlossen in ${DURATION}s"
log "  Pfad:     $BACKUP_PATH"
[ "$DO_DB" = true ]      && log "  DB:       $(( DB_SIZE / 1024 )) KB ($DB_METHOD)"
[ "$DO_UPLOADS" = true ] && log "  Uploads:  $(( UPLOADS_SIZE / 1024 )) KB ($UPLOADS_FILE_COUNT Dateien)"
log "  Gesamt:   $(( TOTAL_SIZE / 1024 )) KB"
log "═══════════════════════════════════════════════════"

# ── 5. Monitoring-Status-File ────────────────────────────────────────────────
# Schreibt Epoch-Timestamp für einfache Backup-Altersüberwachung.
# Monitoring kann prüfen: $(date +%s) - $(cat last_success_epoch) > 93600 → Alert
echo "$(date +%s)" > "$BACKUP_DIR/last_success_epoch"
log "Status-File aktualisiert: $BACKUP_DIR/last_success_epoch"

exit 0
