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
      run_psql -f "$migration"
      run_psql -c "INSERT INTO _migrations (name) VALUES ('$filename')"
      echo "Done: $filename"
    else
      echo "Skip (already applied): $filename"
    fi
  fi
done

echo "=== All migrations completed ==="
