#!/bin/sh
set -e

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
# (gesetzt in docker-compose.override.yml). Der normalisierte Wert wird als
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
export PGOPTIONS="${PGOPTIONS:+$PGOPTIONS }-c app.seed_demo_world=$SEED_DEMO_WORLD_NORM"
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
