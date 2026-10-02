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
# PGOPTIONS setzt den Session-Schalter app.seed_demo_world - die Saat-Dateien
# in sql/seeds/ verweigern ohne ihn jede Zeile (gleiche Sperre wie Mig 052).
# ON_ERROR_STOP ist Pflicht: ohne es endet psql mit 0, auch wenn die
# Transaktion abgebrochen ist - das Skript meldete dann Erfolg ohne Zeilen.
#
# Dazu app.seed_passwort aus SEED_PASSWORT: sql/seeds/y1-2-standorte.sql hasht
# daraus beim Laden (pgcrypto) und traegt deshalb KEIN Passwort im Repo.
# Der Kompromiss, benannt: der Wert steht fuer die Dauer des Ladens in den
# Session-Einstellungen der ENTWICKLUNGS-Datenbank. Ein psql-Variable waere
# serverseitig unsichtbar, laesst sich aber in dollar-quoted DO-Bloecken nicht
# einsetzen - und genau dort steht die Pruefung, die ein leeres oder zu kurzes
# Passwort ablehnt. Ein Schalter fuer beides ist die ehrlichere Wahl.
run_psql() {
  docker compose exec -T \
    -e PGOPTIONS="-c app.seed_demo_world=true -c app.seed_passwort=$SEED_PASSWORT_WERT" \
    db \
    psql -v ON_ERROR_STOP=1 -U "$PG_USER" -d "$PG_DB" "$@"
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

# Ausdrueckliche Zustimmung, nicht abgeleitete Umgebung.
#
# Der NODE_ENV-Check oben allein genuegt NICHT: er liest die Umgebung der
# SHELL, geschrieben wird aber in die Datenbank des CONTAINERS. Auf einem
# Produktions-Host hat die Shell eines Betreibers ueblicherweise kein
# NODE_ENV gesetzt - der Riegel fiel damit auf "development" zurueck und
# liess durch. Ein Riegel, der den falschen Gegenstand prueft, ist keiner.
#
# Derselbe Schalter wie fuer Migration 052 (sql/migrate.sh): wer keine
# Demo-Welt aus 052 hat, braucht die Saaten daneben auch nicht - eine
# Zustimmung fuer die ganze Demo-Welt, nicht zwei halbe.
SEED_DEMO_WORLD_NORM=$(printf '%s' "${SEED_DEMO_WORLD:-false}" | tr '[:upper:]' '[:lower:]')
case "$SEED_DEMO_WORLD_NORM" in
  1|true|yes|on) SEED_DEMO_WORLD_NORM=true ;;
  *)             SEED_DEMO_WORLD_NORM=false ;;
esac
if [ "$SEED_DEMO_WORLD_NORM" != "true" ]; then
  fail "SEED_DEMO_WORLD ist nicht gesetzt - Saat verweigert. Die Saat-Dateien legen ANMELDBARE Demo-Konten an und sperren ohne diesen Schalter selbst (sql/seeds/*.sql). Erlaubter Aufruf: SEED_DEMO_WORLD=true $0"
fi

# Das Passwort fuer die Probebuehne. Kein Vorgabewert - eine Vorgabe waere
# genau das Passwort im Repo, das vermieden werden soll.
#
# WELCHE SAATEN ES BRAUCHEN, WIRD NICHT MEHR AUFGEZAEHLT, SONDERN GEMESSEN.
# Hier stand bis 2026-10-02 `[ "$TARGET_FILE" = "y1-2-standorte.sql" ]` und
# darueber der Satz "Nur dort noetig". Beides war zu dem Zeitpunkt schon falsch:
# gemessen lesen FUENF Saaten `app.seed_passwort` (y1-2, y1-3, y1-4, y3, y4).
# Wer `--file=y4-flaechen.sql` ohne SEED_PASSWORT aufrief, kam an diesem Riegel
# vorbei und lief erst in der Datenbank auf - mit einer richtigen, aber
# spaeteren und knapperen Meldung.
#
# Eine Aufzaehlung von Dateinamen in einer Bedingung veraltet mit der naechsten
# Saat, und zwar lautlos: die Bedingung bleibt syntaktisch gueltig und wird nur
# unvollstaendig. Deshalb entscheidet jetzt der INHALT der Dateien. Festgenagelt
# von `api/test/probebuehneFlaechen.test.js` - eine zurueckgenommene Messung
# faellt dort rot.
SEED_PASSWORT_WERT="${SEED_PASSWORT:-}"
if [ -z "$SEED_PASSWORT_WERT" ]; then
  if [ -n "$TARGET_FILE" ]; then
    PW_SAATEN=$(grep -l 'app\.seed_passwort' "$SEED_DIR/$TARGET_FILE" 2>/dev/null || true)
  else
    PW_SAATEN=$(grep -l 'app\.seed_passwort' "$SEED_DIR"/*.sql 2>/dev/null || true)
  fi
  if [ -n "$PW_SAATEN" ]; then
    fail "SEED_PASSWORT ist nicht gesetzt. Diese Saaten legen ANMELDBARE Konten an und hashen das Passwort erst beim Laden (pgcrypto) - es steht ABSICHTLICH nicht im Repo:
$(printf '%s\n' "$PW_SAATEN" | sed 's#.*/#    - #')
  Erlaubter Aufruf: SEED_DEMO_WORLD=true SEED_PASSWORT=<mindestens 12 Zeichen> $0"
  fi
fi
# Die Laenge prueft die Saat selbst noch einmal (jede Datei hat ihren eigenen
# Riegel). Hier zu scheitern ist freundlicher: es passiert vor dem Verbindungs-
# aufbau und nennt die Zahl, statt sie den Leser in einer Postgres-Meldung
# suchen zu lassen.
if [ -n "$SEED_PASSWORT_WERT" ] && [ "${#SEED_PASSWORT_WERT}" -lt 12 ]; then
  fail "SEED_PASSWORT ist ${#SEED_PASSWORT_WERT} Zeichen lang, verlangt sind mindestens 12. Die Saat-Dateien weisen kuerzere Werte selbst zurueck - dieser Riegel sagt es nur frueher."
fi
case "$SEED_PASSWORT_WERT" in
  *[[:space:]]*|*\"*|*\'*)
    fail "SEED_PASSWORT enthaelt Leerzeichen oder Anfuehrungszeichen. Der Wert wird ueber PGOPTIONS weitergegeben, und das ist leerzeichengetrennt - ein solches Passwort wuerde die Option zerlegen und UNBEMERKT ein anderes Passwort setzen. Bitte ohne Weissraum und Anfuehrungszeichen." ;;
esac

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
