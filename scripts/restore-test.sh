#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# TempConnect — Automated Restore Test
# =============================================================================
# Validiert ein Backup in einem isolierten temporären PostgreSQL-Container.
# KEIN Risiko für bestehende Daten — der Container wird automatisch aufgeräumt.
#
# Nutzung:
#   ./scripts/restore-test.sh backups/2026-03-13_083000
#   ./scripts/restore-test.sh                           # Verwendet letztes Backup
#
# Exit-Codes: 0 = bestanden, 1 = fehlgeschlagen
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
TEST_CONTAINER="tempconnect_restore_test_$$"
PG_USER="tempconnect"
PG_DB="tempconnect"
PG_PASS="restore_test_$(date +%s)"

CHECKS_PASSED=0
CHECKS_FAILED=0

# ── Hilfsfunktionen ─────────────────────────────────────────────────────────
log()  { echo "[restore-test] $(date +%H:%M:%S) $*"; }
pass() { log "  ✓ $*"; CHECKS_PASSED=$((CHECKS_PASSED + 1)); }
fail() { log "  ✗ $*"; CHECKS_FAILED=$((CHECKS_FAILED + 1)); }

# ── Cleanup: immer aufräumen, auch bei Fehlern ──────────────────────────────
cleanup() {
  log "Räume Test-Container auf..."
  docker rm -f "$TEST_CONTAINER" 2>/dev/null || true
}
trap cleanup EXIT

# ── Argument-Parsing ────────────────────────────────────────────────────────
BACKUP_PATH="${1:-}"

if [ "$BACKUP_PATH" = "--help" ] || [ "$BACKUP_PATH" = "-h" ]; then
  echo "Nutzung: $0 [backup-verzeichnis]"
  echo ""
  echo "Ohne Argument wird das neueste Backup aus ./backups/ verwendet."
  echo "Exit-Code 0 = bestanden, 1 = fehlgeschlagen."
  exit 0
fi

# Wenn kein Argument: neuestes Backup finden
if [ -z "$BACKUP_PATH" ]; then
  BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
  BACKUP_PATH=$(ls -td "$BACKUP_DIR"/*/ 2>/dev/null | head -1 || true)
  if [ -z "$BACKUP_PATH" ]; then
    log "FEHLER: Kein Backup gefunden in $BACKUP_DIR"
    exit 1
  fi
  # Trailing Slash entfernen
  BACKUP_PATH="${BACKUP_PATH%/}"
  log "Verwende neuestes Backup: $(basename "$BACKUP_PATH")"
fi

# ── Voraussetzungen prüfen ───────────────────────────────────────────────────
[ -d "$BACKUP_PATH" ] || { log "FEHLER: Verzeichnis existiert nicht: $BACKUP_PATH"; exit 1; }

DB_DUMP="$BACKUP_PATH/db.dump"
[ -f "$DB_DUMP" ] || { log "FEHLER: db.dump fehlt in $BACKUP_PATH"; exit 1; }

MANIFEST="$BACKUP_PATH/manifest.json"
[ -f "$MANIFEST" ] || { log "FEHLER: manifest.json fehlt"; exit 1; }

command -v docker &>/dev/null || { log "FEHLER: docker CLI nicht gefunden"; exit 1; }

log "═══════════════════════════════════════════════════"
log "TempConnect — Automatisierter Restore-Test"
log "Backup: $(basename "$BACKUP_PATH")"
log "═══════════════════════════════════════════════════"
STARTED_AT=$(date +%s)

if [ -x "$SCRIPT_DIR/backup-verify.sh" ]; then
  log "Verifiziere Backup vor Restore-Test..."
  "$SCRIPT_DIR/backup-verify.sh" "$BACKUP_PATH" >/dev/null || {
    log "FEHLER: Backup-Verifikation fehlgeschlagen"
    exit 1
  }
  pass "Backup-Verifikation bestanden"
fi

# ── 1. Temporären PostgreSQL-Container starten ──────────────────────────────
log "Starte temporären PostgreSQL-Container..."
docker run -d \
  --name "$TEST_CONTAINER" \
  -e POSTGRES_DB="$PG_DB" \
  -e POSTGRES_USER="$PG_USER" \
  -e POSTGRES_PASSWORD="$PG_PASS" \
  postgres:16-alpine >/dev/null

# Warten bis ready
log "Warte auf PostgreSQL-Startup..."
WAIT_COUNT=0
until docker exec "$TEST_CONTAINER" pg_isready -U "$PG_USER" -q 2>/dev/null; do
  sleep 1
  WAIT_COUNT=$((WAIT_COUNT + 1))
  if [ "$WAIT_COUNT" -gt 30 ]; then
    log "FEHLER: PostgreSQL startet nicht innerhalb von 30s"
    exit 1
  fi
done
pass "PostgreSQL-Container gestartet (${WAIT_COUNT}s)"

# ── 2. DB-Dump einspielen ───────────────────────────────────────────────────
# WICHTIG (Drill-Fidelity): Der Drill MUSS dieselben pg_restore-Flags nutzen wie
# der echte Restore (scripts/restore.sh) — sonst validiert er eine andere
# Operation als die, die im Ernstfall läuft. --single-transaction macht den
# Restore atomar und impliziert --exit-on-error: beim ERSTEN Fehler bricht
# pg_restore ab und liefert non-zero (set -e schlägt an). Ohne diese Flags
# überspringt pg_restore non-fatale Fehler und endet mit Exit 0 → der Drill
# könnte einen nur TEILWEISE eingespielten Dump fälschlich als „bestanden"
# melden (False-Confidence). --exit-on-error ist redundant zu --single-transaction,
# wird aber explizit gesetzt, damit die Absicht im Skript sichtbar bleibt.
log "Spiele DB-Dump ein (atomar, --single-transaction wie im echten Restore)..."
docker cp "$DB_DUMP" "$TEST_CONTAINER:/tmp/db.dump"
docker exec "$TEST_CONTAINER" \
  pg_restore /tmp/db.dump \
    --dbname="$PG_DB" \
    --username="$PG_USER" \
    --no-owner \
    --no-privileges \
    --single-transaction \
    --exit-on-error

# ── 3. Tabellenstruktur validieren ──────────────────────────────────────────
log "Validiere Tabellenstruktur..."

TABLE_COUNT=$(docker exec "$TEST_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -t -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" \
  | tr -d ' ')

if [ "$TABLE_COUNT" -gt 20 ]; then
  pass "Tabellenanzahl: $TABLE_COUNT (erwartet: >20)"
else
  fail "Tabellenanzahl: $TABLE_COUNT (erwartet: >20 — Schema unvollständig?)"
fi

# Kritische Tabellen vorhanden?
CRITICAL_TABLES="users organizations subscriptions listings requests contracts assignments timesheets invoices audit_log _migrations"
for tbl in $CRITICAL_TABLES; do
  EXISTS=$(docker exec "$TEST_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -t -c \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$tbl';" \
    | tr -d ' ')
  if [ "$EXISTS" = "1" ]; then
    pass "Tabelle '$tbl' vorhanden"
  else
    fail "Tabelle '$tbl' FEHLT"
  fi
done

# ── 4. Zeilenanzahl prüfen ──────────────────────────────────────────────────
log "Prüfe Zeilenanzahl kritischer Tabellen..."

ROW_COUNTS=$(docker exec "$TEST_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -t -c "
  SELECT 'users' AS t, count(*) FROM users
  UNION ALL SELECT 'organizations', count(*) FROM organizations
  UNION ALL SELECT 'subscriptions', count(*) FROM subscriptions
  UNION ALL SELECT 'listings', count(*) FROM listings
  UNION ALL SELECT '_migrations', count(*) FROM _migrations;
" 2>/dev/null || echo "")

if [ -n "$ROW_COUNTS" ]; then
  echo "$ROW_COUNTS" | while IFS='|' read -r tbl cnt; do
    tbl=$(echo "$tbl" | tr -d ' ')
    cnt=$(echo "$cnt" | tr -d ' ')
    [ -z "$tbl" ] && continue
    if [ "$cnt" -gt 0 ] 2>/dev/null; then
      log "  ✓ $tbl: $cnt Zeilen"
    else
      log "  ⚠ $tbl: $cnt Zeilen (leer — bei Testdaten normal)"
    fi
  done
else
  fail "Zeilenanzahl-Abfrage fehlgeschlagen"
fi

# Migrations müssen vorhanden sein
MIGRATION_COUNT=$(docker exec "$TEST_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -t -c \
  "SELECT count(*) FROM _migrations;" 2>/dev/null | tr -d ' ' || echo "0")
if [ "$MIGRATION_COUNT" -gt 0 ]; then
  pass "Migrations vorhanden: $MIGRATION_COUNT"
else
  fail "Keine Migrations gefunden — Schema möglicherweise unvollständig"
fi

# ── 5. FK-Konsistenz (Stichprobe) ───────────────────────────────────────────
log "Prüfe FK-Konsistenz..."

# Verwaiste Subscriptions
ORPHANED_SUBS=$(docker exec "$TEST_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -t -c \
  "SELECT count(*) FROM subscriptions s LEFT JOIN users u ON s.user_id = u.id WHERE u.id IS NULL;" \
  2>/dev/null | tr -d ' ' || echo "0")
if [ "$ORPHANED_SUBS" = "0" ]; then
  pass "Keine verwaisten Subscriptions"
else
  fail "Verwaiste Subscriptions: $ORPHANED_SUBS"
fi

# Verwaiste Listings
ORPHANED_LISTINGS=$(docker exec "$TEST_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -t -c \
  "SELECT count(*) FROM listings l LEFT JOIN users u ON l.owner_id = u.id WHERE u.id IS NULL;" \
  2>/dev/null | tr -d ' ' || echo "0")
if [ "$ORPHANED_LISTINGS" = "0" ]; then
  pass "Keine verwaisten Listings"
else
  fail "Verwaiste Listings: $ORPHANED_LISTINGS"
fi

# ── 6. Upload-Archiv prüfen (wenn vorhanden) ────────────────────────────────
UPLOADS_ARCHIVE="$BACKUP_PATH/uploads.tar.gz"
if [ -f "$UPLOADS_ARCHIVE" ]; then
  log "Prüfe Upload-Archiv..."
  if tar -tzf "$UPLOADS_ARCHIVE" >/dev/null 2>&1; then
    UPLOAD_FILES=$(tar -tzf "$UPLOADS_ARCHIVE" 2>/dev/null | wc -l | tr -d ' ')
    pass "Upload-Archiv valide ($UPLOAD_FILES Einträge)"
  else
    fail "Upload-Archiv beschädigt"
  fi
fi

# ── Zusammenfassung ──────────────────────────────────────────────────────────
ENDED_AT=$(date +%s)
DURATION=$(( ENDED_AT - STARTED_AT ))

log ""
log "═══════════════════════════════════════════════════"
log "Restore-Test abgeschlossen in ${DURATION}s"
log "  Bestanden: $CHECKS_PASSED"
log "  Fehlgeschlagen: $CHECKS_FAILED"

if [ "$CHECKS_FAILED" -gt 0 ]; then
  log "  STATUS: FEHLGESCHLAGEN"
  log "═══════════════════════════════════════════════════"
  exit 1
else
  log "  STATUS: BESTANDEN"
  log "═══════════════════════════════════════════════════"
  exit 0
fi
