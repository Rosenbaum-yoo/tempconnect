#!/bin/sh
set -e

# Migrationsdateien sind UTF-8. Ohne explizites client_encoding nutzt psql die
# Locale (im alpine-Container = C/POSIX -> kein UTF-8). Dadurch werden Umlaute/ß
# in Seeds zu '?' zerstoert (Ursache der korrupten Demo-Titel "Elektrofachkr??fte").
# UTF8 erzwingen -> Seed-Texte bleiben korrekt (libpq/psql respektiert PGCLIENTENCODING).
export PGCLIENTENCODING=UTF8

echo "=== TempConnect Database Migration ==="

# Hetzner Managed DB / externe DB: DATABASE_URL; sonst DB_HOST/POSTGRES_*
run_psql() {
  if [ -n "$DATABASE_URL" ]; then
    psql "$DATABASE_URL" "$@"
  else
    PGPASSWORD=$POSTGRES_PASSWORD psql -h "$DB_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"
  fi
}

if [ -n "$DATABASE_URL" ]; then echo "Using DATABASE_URL (Managed DB / external)"; else echo "Using DB_HOST/POSTGRES_*"; fi

# ─────────────────────────────────────────────────────────────────────────────
# Demo-Seed-Welt (Migration 052) — prod-sicher standardmaessig AUS.
# Aktivierung NUR in dev/sales via Umgebungsvariable SEED_DEMO_WORLD=true
# (gesetzt in docker-compose.demo.yml -- NICHT in docker-compose.override.yml, die
# Datei gibt es nicht; gemessen 2026-10-02). Der normalisierte Wert wird als
# Session-GUC `app.seed_demo_world` ueber PGOPTIONS an JEDE psql-Session
# durchgereicht; Migration 052 liest ihn via current_setting() und seedet die
# Demo-Welt NUR wenn er 'true' ist. Auf Prod laeuft 052 als No-Op durch und wird
# sauber als applied verbucht (ehrliche _migrations-Buchhaltung), erzeugt aber
# KEINE Demo-Accounts mit oeffentlich bekanntem Passwort. Dieselbe GUC gatet auch
# die Remediation-Migration 125 (neutralisiert Demo-Accounts NUR auf Prod).
SEED_DEMO_WORLD_NORM=$(printf '%s' "${SEED_DEMO_WORLD:-false}" | tr '[:upper:]' '[:lower:]')
case "$SEED_DEMO_WORLD_NORM" in
  1|true|yes|on) SEED_DEMO_WORLD_NORM=true ;;
  *)             SEED_DEMO_WORLD_NORM=false ;;
esac
# ─────────────────────────────────────────────────────────────────────────────
# Das Passwort der Demo-Konten — NIE im Repo (Owner-Punkt 16, 2026-10-02).
#
# Bis heute trug 052 einen FESTEN bcrypt-Hash, und der Klartext stand zwei Zeilen
# darueber im Kommentar. Das WAR der Vorfall, den Migration 125 auf
# Bestands-Datenbanken aufraeumen muss. 052 hasht jetzt beim Laden aus
# `app.seed_passwort` — dasselbe Muster, das die Y-Saaten seit Y6.3 benutzen
# (siehe scripts/dev/seed-data.sh).
#
# Drei Faelle, und der dritte ist der Grund fuer das Erzeugen:
#   1. SEED_DEMO_WORLD != true  -> kein Passwort noetig, 052 ist ohnehin No-Op.
#   2. SEED_PASSWORT gesetzt    -> wird durchgereicht (reproduzierbar, E2E).
#   3. SEED_DEMO_WORLD=true, SEED_PASSWORT leer -> wir ERZEUGEN eines und geben
#      es aus. Ein harter Abbruch waere hier falsch, und das ist der Unterschied
#      zu den Y-Saaten: die ruft ein Mensch von Hand auf, dort ist ein lauter
#      Fehler der richtige Lehrer. 052 haengt in der AUTOMATISCHEN
#      Migrationskette — ein Abbruch wuerde jedes `docker compose up` mit
#      SEED_DEMO_WORLD=true (gesetzt von docker-compose.demo.yml) stehen lassen. Ein
#      je Installation erzeugtes Passwort ist streng besser als ein bekanntes im
#      Repo, und es existiert nirgends als Vorgabe.
SEED_PASSWORT_GUC=""
if [ "$SEED_DEMO_WORLD_NORM" = "true" ]; then
  SEED_PASSWORT_WERT="${SEED_PASSWORT:-}"
  if [ -z "$SEED_PASSWORT_WERT" ]; then
    SEED_PASSWORT_WERT=$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | cut -c1-24)
    echo ""
    echo "  +- Demo-Welt (052): SEED_PASSWORT war nicht gesetzt."
    echo "  |  Erzeugtes Passwort der Demo-Konten: $SEED_PASSWORT_WERT"
    echo "  |  Es steht NICHT im Repo und gilt nur fuer diese Installation."
    echo "  |  Reproduzierbar gewuenscht (E2E)? Dann SEED_PASSWORT=<geheim> setzen."
    echo "  +-"
    echo ""
  fi
  # PGOPTIONS trennt Argumente an Leerraum. Ein Wert mit Leerzeichen kaeme
  # VERSTUEMMELT an, und 052 schriebe einen Hash fuer etwas anderes, als hier
  # gesetzt wurde — ohne dass irgendwo etwas auffaellt. Deshalb laut ablehnen.
  if [ "$SEED_PASSWORT_WERT" != "$(printf '%s' "$SEED_PASSWORT_WERT" | tr -d '[:space:]')" ]; then
    echo "FEHLER: SEED_PASSWORT enthaelt Leerraum. PGOPTIONS trennt daran — der Wert kaeme verstuemmelt in der Datenbank an." >&2
    exit 1
  fi
  if [ "${#SEED_PASSWORT_WERT}" -lt 12 ]; then
    echo "FEHLER: SEED_PASSWORT ist kuerzer als 12 Zeichen. Die Demo-Konten sind anmeldbar, drei davon auf ENTERPRISE-Funktionsniveau; ein kurzes Passwort macht die Demo-Welt zur Tuer." >&2
    exit 1
  fi
  SEED_PASSWORT_GUC=" -c app.seed_passwort=$SEED_PASSWORT_WERT"
fi

export PGOPTIONS="${PGOPTIONS:+$PGOPTIONS }-c app.seed_demo_world=$SEED_DEMO_WORLD_NORM$SEED_PASSWORT_GUC"
echo "Demo-Seed-Welt (052) / Remediation (125): app.seed_demo_world=$SEED_DEMO_WORLD_NORM"

echo "Waiting for database..."
until run_psql -c '\q' 2>/dev/null; do
  echo "Database not ready, waiting..."
  sleep 2
done

echo "Database is ready!"

run_psql <<EOF
CREATE TABLE IF NOT EXISTS _migrations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
EOF

echo "Checking migrations..."

for migration in $(ls /migrations/*.sql 2>/dev/null | sort); do
  if [ -f "$migration" ]; then
    filename=$(basename "$migration")
    applied=$(run_psql -t -c "SELECT COUNT(*) FROM _migrations WHERE name='$filename'" | tr -d ' ')
    if [ "$applied" = "0" ]; then
      echo "Applying: $filename"
      # ON_ERROR_STOP=1: psql liefert sonst auch bei SQL-Fehlern Exit 0 -> eine
      # fehlgeschlagene Migration wuerde faelschlich als "applied" verbucht
      # (Silent-Failure-Maskierung, Ursache der Mig-122-Drift). Nur bei Erfolg
      # in _migrations eintragen; sonst harter Abbruch (set -e + expliziter exit).
      if run_psql -v ON_ERROR_STOP=1 -f "$migration"; then
        run_psql -c "INSERT INTO _migrations (name) VALUES ('$filename')"
        echo "Done: $filename"
      else
        echo "FEHLER: Migration $filename fehlgeschlagen — Abbruch (nicht als applied verbucht)." >&2
        exit 1
      fi
    else
      echo "Skip (already applied): $filename"
    fi
  fi
done

echo "=== All migrations completed ==="
