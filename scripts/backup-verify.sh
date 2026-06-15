#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# TempConnect — Backup Verification
# =============================================================================
# Prüft ein Backup-Verzeichnis auf:
#   1. Vollständigkeit (alle erwarteten Dateien vorhanden)
#   2. Integrität (SHA-256 Checksums stimmen)
#   3. DB-Dump Struktur (pg_restore --list)
#   4. Upload-Archiv (tar -tzf)
#
# Nutzung:
#   ./scripts/backup-verify.sh backups/2026-03-13_083000
#   ./scripts/backup-verify.sh /mnt/backup/2026-03-13_083000
#
# Exit-Codes: 0 = alle Prüfungen bestanden, 1 = Fehler
# =============================================================================

CHECKS_PASSED=0
CHECKS_FAILED=0

log()  { echo "[verify] $*"; }
pass() { log "  ✓ $*"; CHECKS_PASSED=$((CHECKS_PASSED + 1)); }
fail() { log "  ✗ $*"; CHECKS_FAILED=$((CHECKS_FAILED + 1)); }

sha256_of() {
  if command -v sha256sum &>/dev/null; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum &>/dev/null; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    echo "NO_SHA_TOOL"
  fi
}

# ── Argument prüfen ─────────────────────────────────────────────────────────
BACKUP_PATH="${1:-}"

if [ -z "$BACKUP_PATH" ] || [ "$BACKUP_PATH" = "--help" ] || [ "$BACKUP_PATH" = "-h" ]; then
  echo "Nutzung: $0 <backup-verzeichnis>"
  echo ""
  echo "Beispiel: $0 backups/2026-03-13_083000"
  exit 0
fi

if [ ! -d "$BACKUP_PATH" ]; then
  log "FEHLER: Verzeichnis existiert nicht: $BACKUP_PATH"
  exit 1
fi

log "Prüfe Backup: $BACKUP_PATH"
log "═══════════════════════════════════════════════════"

# ── 1. Manifest prüfen ──────────────────────────────────────────────────────
log "Manifest..."

MANIFEST="$BACKUP_PATH/manifest.json"
if [ ! -f "$MANIFEST" ]; then
  fail "manifest.json fehlt"
  log "Ohne Manifest keine weitere Prüfung möglich."
  exit 1
fi
pass "manifest.json vorhanden"

# Manifest parsen (portabel, kein jq nötig)
manifest_value() {
  grep -o "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" "$MANIFEST" | head -1 | sed 's/.*: *"\(.*\)"/\1/'
}
manifest_bool() {
  grep -o "\"$1\"[[:space:]]*:[[:space:]]*[a-z]*" "$MANIFEST" | head -1 | sed 's/.*: *//'
}

# Section-aware JSON-Feld-Extraktion (z. B. db/uploads → included/sha256).
# Portabel via sed/grep — KEIN python3/jq. Der Restore-Drill (2026-06-14) hat
# gezeigt, dass ein Windows-Store-python3 MSYS-Pfade (/c/... mit Leerzeichen)
# nicht öffnen kann und dann auf FALSCHE Defaults zurückfällt
# (uploads.included → "true" trotz --db-only) → False-Confidence-Verifikation.
# sed/grep ist auf jedem Host vorhanden und pfad-robust.
manifest_section_field() {
  # Trailing "|| true": fehlt die Section/das Feld (korruptes/abgeschnittenes
  # Manifest), liefert grep non-zero → unter `set -euo pipefail` würde die
  # Command-Substitution sonst das GANZE Skript still abbrechen, BEVOR der
  # Fail-safe-Default (=\"true\") + die laute fail()-Meldung greifen. So bleibt
  # die Ausgabe leer, der Default zieht und der Verifier schlägt sichtbar an.
  sed -n "/\"$1\"[[:space:]]*:/,/}/p" "$MANIFEST" \
    | grep "\"$2\"" | head -1 \
    | sed -E "s/.*\"$2\"[[:space:]]*:[[:space:]]*\"?([^\",}]*)\"?.*/\1/" \
    | tr -d ' ' || true
}

TIMESTAMP=$(manifest_value "timestamp")
DB_INCLUDED=$(manifest_bool "included" | head -1)
DB_SHA=$(manifest_value "sha256" | head -1)

log "  Backup-Zeitstempel: $TIMESTAMP"

# ── 2. DB-Dump prüfen ───────────────────────────────────────────────────────
DB_DUMP="$BACKUP_PATH/db.dump"

# Lese DB- und Uploads-Status section-aware aus dem Manifest (sed/grep, kein python3).
# Fail-safe-Richtung: kann included nicht gelesen werden, gilt "true" → der Verifier
# erwartet die Datei und schlägt LAUT an, statt sie still zu überspringen.
DB_INCLUDED=$(manifest_section_field "db" "included")
[ -z "$DB_INCLUDED" ] && DB_INCLUDED="true"
UPLOADS_INCLUDED=$(manifest_section_field "uploads" "included")
[ -z "$UPLOADS_INCLUDED" ] && UPLOADS_INCLUDED="true"
DB_SHA=$(manifest_section_field "db" "sha256")
UPLOADS_SHA=$(manifest_section_field "uploads" "sha256")

if [ "$DB_INCLUDED" = "true" ]; then
  log "Datenbank-Dump..."

  if [ ! -f "$DB_DUMP" ]; then
    fail "db.dump fehlt (laut Manifest enthalten)"
  else
    pass "db.dump vorhanden ($(( $(stat --printf="%s" "$DB_DUMP" 2>/dev/null || stat -f "%z" "$DB_DUMP" 2>/dev/null || echo 0) / 1024 )) KB)"

    # Checksum
    if [ -n "$DB_SHA" ] && [ "$DB_SHA" != "null" ]; then
      ACTUAL_SHA=$(sha256_of "$DB_DUMP")
      if [ "$ACTUAL_SHA" = "$DB_SHA" ]; then
        pass "DB SHA-256 Checksum stimmt"
      else
        fail "DB SHA-256 Checksum FALSCH (erwartet: ${DB_SHA:0:16}..., ist: ${ACTUAL_SHA:0:16}...)"
      fi
    fi

    # pg_restore --list (Strukturprüfung)
    if command -v pg_restore &>/dev/null; then
      TABLE_COUNT=$(pg_restore --list "$DB_DUMP" 2>/dev/null | grep -c "TABLE" || true)
      if [ "$TABLE_COUNT" -gt 0 ]; then
        pass "pg_restore --list: $TABLE_COUNT TABLE-Einträge erkannt"
      else
        fail "pg_restore --list: Keine TABLE-Einträge — Dump möglicherweise beschädigt"
      fi
    else
      log "  ⚠ pg_restore nicht installiert — Strukturprüfung übersprungen"
    fi
  fi
else
  log "Datenbank: nicht im Backup enthalten (--uploads-only)"
fi

# ── 3. Uploads-Archiv prüfen ────────────────────────────────────────────────
UPLOADS_ARCHIVE="$BACKUP_PATH/uploads.tar.gz"

if [ "$UPLOADS_INCLUDED" = "true" ]; then
  log "Upload-Archiv..."

  if [ ! -f "$UPLOADS_ARCHIVE" ]; then
    fail "uploads.tar.gz fehlt (laut Manifest enthalten)"
  else
    ARCHIVE_SIZE=$(( $(stat --printf="%s" "$UPLOADS_ARCHIVE" 2>/dev/null || stat -f "%z" "$UPLOADS_ARCHIVE" 2>/dev/null || echo 0) / 1024 ))
    pass "uploads.tar.gz vorhanden ($ARCHIVE_SIZE KB)"

    # Checksum
    if [ -n "$UPLOADS_SHA" ] && [ "$UPLOADS_SHA" != "null" ]; then
      ACTUAL_SHA=$(sha256_of "$UPLOADS_ARCHIVE")
      if [ "$ACTUAL_SHA" = "$UPLOADS_SHA" ]; then
        pass "Uploads SHA-256 Checksum stimmt"
      else
        fail "Uploads SHA-256 Checksum FALSCH (erwartet: ${UPLOADS_SHA:0:16}..., ist: ${ACTUAL_SHA:0:16}...)"
      fi
    fi

    # tar Integrität
    if tar -tzf "$UPLOADS_ARCHIVE" >/dev/null 2>&1; then
      FILE_COUNT=$(tar -tzf "$UPLOADS_ARCHIVE" 2>/dev/null | wc -l | tr -d ' ')
      pass "tar-Archiv valide ($FILE_COUNT Einträge)"
    else
      fail "tar-Archiv beschädigt oder nicht lesbar"
    fi
  fi
else
  log "Uploads: nicht im Backup enthalten (--db-only)"
fi

# ── Zusammenfassung ──────────────────────────────────────────────────────────
log ""
log "═══════════════════════════════════════════════════"
log "Ergebnis: $CHECKS_PASSED bestanden, $CHECKS_FAILED fehlgeschlagen"

if [ "$CHECKS_FAILED" -gt 0 ]; then
  log "STATUS: FEHLGESCHLAGEN"
  log "═══════════════════════════════════════════════════"
  exit 1
else
  log "STATUS: BESTANDEN"
  log "═══════════════════════════════════════════════════"
  exit 0
fi
