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
# WINDOWS / GIT BASH (gemessen am 2026-09-28): ohne `MSYS_NO_PATHCONV=1` unten
# kann dieses Gate auf einem Windows-Rechner NICHT laufen — und es sah dabei aus
# wie ein dramatischer Befund statt wie ein Werkzeugfehler:
#
#   1. Git Bash uebersetzt jedes Argument, das wie ein absoluter Unix-Pfad
#      aussieht, in einen Windows-Pfad. Aus `sh /migrate.sh` wurde
#      `sh 'C:/Program Files/Git/migrate.sh'` — "can't open".
#   2. Dieselbe Uebersetzung trifft die `-v`-Zeichenkette: aus
#      `-v /c/…/migrate.sh:/migrate.sh:ro` wird ein Ziel, das der Container nicht
#      kennt, und die Einbindung greift nicht.
#
# Danach meldete das Skript ALLE Kerntabellen als fehlend und RLS als inaktiv.
# Wer das fuer einen Befund haelt, sucht tagelang am Schema. `MSYS_NO_PATHCONV=1`
# schaltet die Uebersetzung ab; unter Linux und in CI ist die Variable ohne
# Wirkung. Belegt am 2026-09-28: mit ihr bindet der Git-Bash-Pfad
# (`/c/Users/…`) einwandfrei ein.
#
# Exit codes:
#   0  All migrations applied, schema checks passed
#   1  Migration failure or schema check failed
#   2  Setup/teardown error (docker unavailable, port conflict, etc.)
#
# ─────────────────────────────────────────────────────────────────────────────

set -e

# Siehe Kopf. Ohne dies verbiegt Git Bash auf Windows die `-v`-Zeichenketten und
# die Container-Pfade; auf Linux und in CI ist die Variable ohne Wirkung.
export MSYS_NO_PATHCONV=1

CONTAINER="tc_fresh_install_test_$$"
TEST_PORT=5499
TEST_DB="tempconnect_test"
TEST_USER="tc_test"
TEST_PASS="tc_test_pw"
MIGRATIONS_DIR="$(cd "$(dirname "$0")/migrations" && pwd)"
MIGRATE_SCRIPT="$(cd "$(dirname "$0")" && pwd)/migrate.sh"
CLEANUP=1
FAILED=0
MIT_DEMO_WELT=1   # Vorgabe seit 2026-10-02, Begruendung beim Migrationslauf unten

# ── Argument parsing ─────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --no-cleanup)      CLEANUP=0 ;;
    --ohne-demo-welt)  MIT_DEMO_WELT=0 ;;
    --help|-h)
      echo "Usage: sh sql/test-fresh-install.sh [--no-cleanup] [--ohne-demo-welt]"
      echo ""
      echo "  --no-cleanup      Testcontainer stehen lassen (Fehlersuche)"
      echo "  --ohne-demo-welt  Migration 052 als No-Op laufen lassen."
      echo "                    VORGABE ist MIT: ohne sie uebersprang dieses Tor den"
      echo "                    groessten Seed der Kette und hat am 2026-10-02 zwei"
      echo "                    Defekte nicht gemeldet, die ein Frischinstall sofort zeigt."
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
# `init.sql` MUSS mit, und das war der Grund, warum dieses Gate nie gruen werden
# konnte (gemessen am 2026-09-28): es legt in Zeile 6
# `CREATE EXTENSION "uuid-ossp"` an, und schon `001_ratings.sql` ruft
# `uuid_generate_v4()`. Ohne die Erweiterung bricht die ERSTE Migration ab, und
# danach meldet das Gate folgerichtig jede Kerntabelle als fehlend.
#
# Im Betrieb uebernimmt das Postgres selbst: `docker-compose.yml` bindet
# `./sql/init.sql` nach `/docker-entrypoint-initdb.d/` ein, und das Abbild fuehrt
# alles dort beim ERSTEN Start aus — vor jeder Migration. Genau dieselbe
# Einbindung gehoert in dieses Gate, sonst prueft es einen Start, den es im
# Betrieb nicht gibt.
docker run -d \
  --name "$CONTAINER" \
  -e POSTGRES_DB="$TEST_DB" \
  -e POSTGRES_USER="$TEST_USER" \
  -e POSTGRES_PASSWORD="$TEST_PASS" \
  -p "${TEST_PORT}:5432" \
  -v "$(cd "$(dirname "$0")" && pwd)/init.sql:/docker-entrypoint-initdb.d/init.sql:ro" \
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
# MIT DEMO-WELT, und das ist seit 2026-10-02 die Vorgabe (Owner-Punkt 16).
#
# WARUM DAS GEAENDERT WURDE — zwei Befunde an einem Tag, beide von keinem Test
# gefunden, beide von EINEM Frischinstall mit Demo-Welt:
#
#   1. Migration 230 (occ_owner_access.expires_at) hatte eine Notbremse, die auf
#      einer LEEREN Tabelle zuschlug. Auf einem Frischinstall ist
#      occ_owner_access leer -> die Kette brach bei 230 ab. Ein Frischinstall war
#      unmoeglich, und dieses Tor hat es NICHT gemeldet.
#   2. Migration 052 braucht seit Punkt 16 `pgcrypto`, und GEMESSEN legt nichts
#      sonst im Repo die Erweiterung an. Ohne den Demo-Welt-Lauf waere nie
#      aufgefallen, dass 052 sie selbst anlegen muss.
#
# Das Tor lief vorher ohne SEED_DEMO_WORLD — Migration 052 war darin ein No-Op,
# und mit ihr alles, was die Demo-Welt beruehrt. Ein Frischinstall-Tor, das den
# groessten Seed der Kette ueberspringt, prueft weniger, als sein Name sagt.
#
# Das Passwort wird HIER erzeugt und nirgends hinterlegt: der Lauf ist eine
# Wegwerf-Datenbank, die Konten werden nie benutzt, und ein festes Passwort im
# Repo ist genau das, was Punkt 16 abgeschafft hat.
# Abschalten: --ohne-demo-welt (dann prueft das Tor die Demo-Welt NICHT).
if [ "$MIT_DEMO_WELT" = "1" ]; then
  FRESH_SEED_PW="FrischTor$(date +%s)xyz"
  SEED_ENV="-e SEED_DEMO_WORLD=true -e SEED_PASSWORT=$FRESH_SEED_PW"
  printf "\n${CYAN}--- Running migrations (MIT Demo-Welt) ---${RESET}\n"
else
  FRESH_SEED_PW=""
  SEED_ENV=""
  printf "\n${CYAN}--- Running migrations (OHNE Demo-Welt: --ohne-demo-welt) ---${RESET}\n"
fi

MIGRATION_OUTPUT=$(
  docker run --rm \
    --network "container:$CONTAINER" \
    -e DB_HOST=127.0.0.1 \
    -e POSTGRES_DB="$TEST_DB" \
    -e POSTGRES_USER="$TEST_USER" \
    -e POSTGRES_PASSWORD="$TEST_PASS" \
    $SEED_ENV \
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
# HINWEIS (2026-06-04): zuvor check_table "deals" — eine Tabelle "deals" wird im
# gesamten Migrations-Baum NIE angelegt (das Domaenenkonzept lebt als
# commercial_offers, Mig 108). Der alte Check schlug daher IMMER fehl; in
# Kombination mit dem frueheren silent-failure-Runner blieb dieses Gate de facto
# nie gruen. Korrigiert auf die real existierende Tabelle.
check_table "commercial_offers"
check_table "assignments"
check_table "timesheets"
check_table "audit_log"
check_table "_migrations"

# OCC tables (migration 107+)
# HINWEIS (2026-09-28): zuvor check_table "owner_access_grants" — eine Tabelle
# dieses Namens wird im gesamten Migrationsbaum NIE angelegt. Migration 107 legt
# `occ_owner_access` an. Derselbe Fehler wie beim alten `deals`-Check zwei Zeilen
# darueber: ein Gate, das auf einen nie existierenden Namen prueft, ist dauerhaft
# rot — und ein dauerhaft rotes Gate wird uebersprungen. Gefunden beim ersten
# LAUF dieses Gates, nicht beim Lesen.
check_table "occ_owner_access"

# Multi-location (migration 112)
check_table "org_locations"

# ── Security backstop checks (migration 116 — deny-by-default RLS) ────────────
# Migration 116 etabliert die Mandanten-Isolation (Staff-Bypass + org-scoped
# Policies, IS-NULL-Wildcards entfernt, FORCE RLS auf den kritischsten Tabellen).
# 116 ist transaktional: brach EIN Statement, rollte die GESAMTE RLS zurueck —
# und genau das passierte historisch unbemerkt (silent-failure-Runner + auf
# nicht existente Spalten/Tabellen verweisende Policies). Diese Assertions stellen
# sicher, dass der Sicherheits-Backstop nach einem Fresh-Install WIRKLICH aktiv ist
# und nicht erneut still wegbricht.
check_policy() {
  TABLE="$1"; POLICY="$2"; WANT="$3"   # WANT = present | absent
  RESULT=$(run_sql "SELECT COUNT(*) FROM pg_policies WHERE tablename='$TABLE' AND policyname='$POLICY';")
  if [ "$WANT" = "present" ]; then
    if [ "$RESULT" = "1" ]; then ok "RLS-Policy vorhanden: $TABLE.$POLICY"
    else fail "RLS-Policy FEHLT: $TABLE.$POLICY — Migration 116 hat nicht angewandt"; fi
  else
    if [ "$RESULT" = "0" ]; then ok "RLS-Wildcard entfernt: $TABLE.$POLICY"
    else fail "RLS-Wildcard NOCH VORHANDEN: $TABLE.$POLICY — Deny-by-Default nicht durchgesetzt"; fi
  fi
}

check_force_rls() {
  TABLE="$1"
  RESULT=$(run_sql "SELECT relforcerowsecurity FROM pg_class WHERE relname='$TABLE';")
  if [ "$RESULT" = "t" ]; then ok "FORCE RLS aktiv: $TABLE"
  else fail "FORCE RLS NICHT aktiv: $TABLE — Superuser/Migrationsverbindung umgeht RLS"; fi
}

printf "\n${CYAN}--- Security-Backstop (Deny-by-Default RLS, Migration 116) ---${RESET}\n"
check_policy "requisitions" "req_staff_bypass" "present"
check_policy "requisitions" "req_no_ctx"       "absent"
check_force_rls "requisitions"
check_force_rls "timesheets"
check_force_rls "invoices"

# ── Demo-Welt: entsteht sie, und mit WELCHEM Passwort? (Owner-Punkt 16) ───────
if [ "$MIT_DEMO_WELT" = "1" ]; then
  printf "\n${CYAN}--- Demo-Welt (Migration 052, Passwort aus der Umgebung) ---${RESET}\n"

  # 1) Die Konten entstehen ueberhaupt. Ohne diese Pruefung waere der Lauf auch
  #    dann gruen, wenn 052 sich still verweigert (z. B. weil app.seed_passwort
  #    nicht ankommt) — und genau DAS waere unsichtbar, weil die Verweigerung
  #    ein NOTICE ist und kein Fehler.
  KONTEN=$(run_sql "SELECT COUNT(*) FROM users WHERE email LIKE 'demo-%@tempconnect.de';")
  if [ "$KONTEN" = "6" ]; then ok "Demo-Konten angelegt: 6"
  else fail "Demo-Konten: $KONTEN statt 6 — 052 hat sich verweigert (die Verweigerung ist ein NOTICE, kein Fehler) oder die Kette brach vorher ab"; fi

  # 2) pgcrypto ist da. 052 legt es selbst an; GEMESSEN am 2026-10-02 tut das
  #    nichts anderes im Repo — nicht init.sql (nur uuid-ossp), keine Migration.
  PGC=$(run_sql "SELECT COUNT(*) FROM pg_extension WHERE extname='pgcrypto';")
  if [ "$PGC" = "1" ]; then ok "pgcrypto vorhanden (von 052 angelegt)"
  else fail "pgcrypto fehlt — dann kann 052 nicht hashen, und jemand wird den festen Hash zurueckschreiben"; fi

  # 3) Und die eigentliche Zusicherung: KEIN Konto traegt den alten, oeffentlich
  #    bekannten Demo-Hash. Das war die Login-Backdoor aus Migration 125.
  ALT=$(run_sql "SELECT COUNT(*) FROM users WHERE password_hash LIKE '\$2a\$12\$mA5dLvWmN%';")
  if [ "$ALT" = "0" ]; then ok "kein Konto traegt den alten oeffentlichen Demo-Hash"
  else fail "$ALT Konto/Konten tragen den oeffentlich bekannten Demo-Hash — die Hintertuer aus 125 ist zurueck"; fi

  # 4) Das Format muss bcryptjs-vertraeglich sein, sonst sind die Konten nicht
  #    anmeldbar und die Demo-Welt ist Deko.
  FORMAT=$(run_sql "SELECT COUNT(*) FROM users WHERE email LIKE 'demo-%@tempconnect.de' AND password_hash ~ '^\\\$2[aby]\\\$[0-9]{2}\\\$.{53}\$';")
  if [ "$FORMAT" = "6" ]; then ok "alle 6 Hashes sind gueltig formatiertes bcrypt"
  else fail "nur $FORMAT von 6 Demo-Hashes sind gueltiges bcrypt — bcryptjs.compare wirft dann statt false zu liefern (500er statt abgelehnter Anmeldung)"; fi
fi

# ── Final result ─────────────────────────────────────────────────────────────
printf "\n"
if [ "$FAILED" = "0" ]; then
  printf "${GREEN}=== PASS: Fresh-install test completed successfully. ===${RESET}\n\n"
  exit 0
else
  printf "${RED}=== FAIL: One or more checks failed. See output above. ===${RESET}\n\n"
  exit 1
fi
