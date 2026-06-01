#!/bin/sh
# test-fresh-install.sh
# =====================
# Verifies that ALL migrations apply cleanly against a fresh (empty) postgres
# instance.  Run this in CI or locally before releasing a new migration.
#
# Usage:
#   sh sql/test-fresh-install.sh                # from repo root
#   sh sql/test-fresh-install.sh --no-cleanup   # keep test container (debug)
#
# Requirements:
#   - Docker (docker CLI in PATH, daemon running)
#   - Port 5499 temporarily free  (changes PGPORT to avoid collisions)
#
# Exit codes:
#   0  All migrations applied, schema checks passed
#   1  Migration failure or schema check failed
#   2  Setup/teardown error (docker unavailable, port conflict, etc.)
#
# ─────────────────────────────────────────────────────────────────────────────

set -e

CONTAINER="tc_fresh_install_test_$$"
TEST_PORT=5499
TEST_DB="tempconnect_test"
TEST_USER="tc_test"
TEST_PASS="tc_test_pw"
MIGRATIONS_DIR="$(cd "$(dirname "$0")/migrations" && pwd)"
MIGRATE_SCRIPT="$(cd "$(dirname "$0")" && pwd)/migrate.sh"
CLEANUP=1
FAILED=0

# ── Argument parsing ─────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --no-cleanup) CLEANUP=0 ;;
    --help|-h)
      echo "Usage: sh sql/test-fresh-install.sh [--no-cleanup]"
      exit 0
      ;;
  esac
done

# ── Colour helpers ───────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RESET='\033[0m'

ok()   { printf "  ${GREEN}[OK]${RESET}  %s\n" "$1"; }
fail() { printf "  ${RED}[FAIL]${RESET} %s\n" "$1"; FAILED=1; }
info() { printf "  ${CYAN}[..]${RESET}  %s\n" "$1"; }
warn() { printf "  ${YELLOW}[WARN]${RESET} %s\n" "$1"; }

# ── Prerequisite checks ──────────────────────────────────────────────────────
printf "\n${CYAN}=== TempConnect Fresh-Install Migration Test ===${RESET}\n\n"

if ! docker info >/dev/null 2>&1; then
  printf "${RED}ERROR: Docker daemon not available.${RESET}\n"
  exit 2
fi

if [ ! -d "$MIGRATIONS_DIR" ]; then
  printf "${RED}ERROR: Migrations directory not found: $MIGRATIONS_DIR${RESET}\n"
  exit 2
fi

MIGRATION_COUNT=$(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | wc -l | tr -d ' ')
info "Found $MIGRATION_COUNT migration files in $MIGRATIONS_DIR"

# ── Start fresh postgres container ──────────────────────────────────────────
cleanup() {
  if [ "$CLEANUP" = "1" ]; then
    info "Removing test container $CONTAINER …"
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  else
    warn "Skipping cleanup (--no-cleanup).  Container: $CONTAINER  Port: $TEST_PORT"
  fi
}
trap cleanup EXIT INT TERM

info "Starting fresh postgres:16-alpine (container: $CONTAINER, port: $TEST_PORT) …"
docker run -d \
  --name "$CONTAINER" \
  -e POSTGRES_DB="$TEST_DB" \
  -e POSTGRES_USER="$TEST_USER" \
  -e POSTGRES_PASSWORD="$TEST_PASS" \
  -p "${TEST_PORT}:5432" \
  postgres:16-alpine \
  >/dev/null

# ── Wait for postgres to be ready ────────────────────────────────────────────
info "Waiting for postgres to become ready …"
RETRIES=30
until docker exec "$CONTAINER" pg_isready -U "$TEST_USER" -d "$TEST_DB" -q 2>/dev/null; do
  RETRIES=$((RETRIES - 1))
  if [ "$RETRIES" -le 0 ]; then
    fail "Postgres did not become ready within 60 seconds."
    exit 2
  fi
  sleep 2
done
ok "Postgres is ready."

# ── Run migrations ───────────────────────────────────────────────────────────
printf "\n${CYAN}--- Running migrations ---${RESET}\n"

MIGRATION_OUTPUT=$(
  docker run --rm \
    --network "container:$CONTAINER" \
    -e DB_HOST=127.0.0.1 \
    -e POSTGRES_DB="$TEST_DB" \
    -e POSTGRES_USER="$TEST_USER" \
    -e POSTGRES_PASSWORD="$TEST_PASS" \
    -v "${MIGRATE_SCRIPT}:/migrate.sh:ro" \
    -v "${MIGRATIONS_DIR}:/migrations:ro" \
    postgres:16-alpine \
    sh /migrate.sh 2>&1
) || {
  printf "${RED}ERROR: Migration runner exited non-zero.${RESET}\n"
  echo "$MIGRATION_OUTPUT"
  FAILED=1
}

# Show only errors/warnings in normal mode (full output on failure)
if [ "$FAILED" = "1" ]; then
  echo "$MIGRATION_OUTPUT"
else
  APPLIED=$(echo "$MIGRATION_OUTPUT" | grep -c "^Applying:" || true)
  SKIPPED=$(echo "$MIGRATION_OUTPUT" | grep -c "^Skip" || true)
  ok "Migrations complete — applied: $APPLIED, skipped: $SKIPPED"
fi

# ── Verify _migrations table ─────────────────────────────────────────────────
printf "\n${CYAN}--- Schema checks ---${RESET}\n"

run_sql() {
  docker exec "$CONTAINER" psql -U "$TEST_USER" -d "$TEST_DB" -t -c "$1" 2>/dev/null | tr -d ' \n'
}

APPLIED_COUNT=$(run_sql "SELECT COUNT(*) FROM _migrations;")
info "_migrations table has $APPLIED_COUNT entries"

if [ "$APPLIED_COUNT" -ge "$MIGRATION_COUNT" ]; then
  ok "_migrations count ($APPLIED_COUNT) >= file count ($MIGRATION_COUNT)"
else
  fail "_migrations count ($APPLIED_COUNT) is less than file count ($MIGRATION_COUNT) — some migrations may have failed silently"
fi

# ── Key table existence checks ───────────────────────────────────────────────
check_table() {
  TABLE="$1"
  RESULT=$(run_sql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='$TABLE';")
  if [ "$RESULT" = "1" ]; then
    ok "Table exists: $TABLE"
  else
    fail "Table MISSING: $TABLE"
  fi
}

check_table "users"
check_table "organizations"
check_table "org_memberships"
check_table "subscriptions"
check_table "deals"
check_table "assignments"
check_table "timesheets"
check_table "audit_log"
check_table "_migrations"

# OCC tables (migration 107+)
check_table "owner_access_grants"

# Multi-location (migration 112)
check_table "org_locations"

# ── Final result ─────────────────────────────────────────────────────────────
printf "\n"
if [ "$FAILED" = "0" ]; then
  printf "${GREEN}=== PASS: Fresh-install test completed successfully. ===${RESET}\n\n"
  exit 0
else
  printf "${RED}=== FAIL: One or more checks failed. See output above. ===${RESET}\n\n"
  exit 1
fi
