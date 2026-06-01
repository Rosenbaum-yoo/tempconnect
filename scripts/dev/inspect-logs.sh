#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# TempConnect — Dev: Log-Inspektion
# =============================================================================
# Intelligentes Log-Tool fuer lokale Entwicklung.
# Filtert Docker-Container-Logs nach Service, Level, Zeitraum.
#
# Nutzung:
#   ./scripts/dev/inspect-logs.sh                        # Alle Logs (tail -f)
#   ./scripts/dev/inspect-logs.sh --service=api          # Nur API-Logs
#   ./scripts/dev/inspect-logs.sh --level=error          # Nur Fehler (API)
#   ./scripts/dev/inspect-logs.sh --since=5m             # Letzte 5 Minuten
#   ./scripts/dev/inspect-logs.sh --tail=50              # Letzte 50 Zeilen
#   ./scripts/dev/inspect-logs.sh --json                 # Raw JSON (fuer piping)
#   ./scripts/dev/inspect-logs.sh --errors               # Kurzform: nur Errors
#   ./scripts/dev/inspect-logs.sh --service=db --tail=20 # DB-Logs, letzte 20
#
# Services: api, db, redis, frontend, mailpit, migrate
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
cd "$PROJECT_DIR"

# ── Defaults ─────────────────────────────────────────────────────────────────
SERVICE=""
LEVEL=""
SINCE=""
TAIL="100"
RAW_JSON=false
FOLLOW=true
ERRORS_ONLY=false

VALID_SERVICES="api db redis frontend mailpit migrate"

# ── Argument-Parsing ─────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --service=*)  SERVICE="${arg#--service=}" ;;
    --level=*)    LEVEL="${arg#--level=}" ;;
    --since=*)    SINCE="${arg#--since=}" ;;
    --tail=*)     TAIL="${arg#--tail=}" ;;
    --json|-j)    RAW_JSON=true ;;
    --no-follow)  FOLLOW=false ;;
    --errors|-e)  ERRORS_ONLY=true ;;
    --help|-h)
      echo "Nutzung: $0 [Optionen]"
      echo ""
      echo "Optionen:"
      echo "  --service=<name>   Nur Logs dieses Services (api|db|redis|frontend|mailpit|migrate)"
      echo "  --level=<level>    Log-Level filtern (debug|info|warn|error|fatal) — nur API"
      echo "  --since=<zeit>     Nur Logs seit Zeitraum (z.B. 5m, 1h, 30s)"
      echo "  --tail=<n>         Letzte n Zeilen anzeigen (Default: 100)"
      echo "  --json, -j         Raw JSON-Output (kein Filtering)"
      echo "  --no-follow        Nicht folgen (einmalige Ausgabe)"
      echo "  --errors, -e       Kurzform fuer --level=error --service=api"
      echo "  --help, -h         Diese Hilfe anzeigen"
      echo ""
      echo "Beispiele:"
      echo "  $0 --service=api --level=error --since=1h"
      echo "  $0 --errors --tail=50"
      echo "  $0 --service=db --no-follow"
      echo "  $0 --json | jq '.msg'"
      exit 0
      ;;
    *) echo "[inspect-logs] FEHLER: Unbekanntes Argument: $arg"; exit 1 ;;
  esac
done

# ── Hilfsfunktionen ─────────────────────────────────────────────────────────
log()  { echo "[inspect-logs] $*"; }
fail() { echo "[inspect-logs] FEHLER: $*" >&2; exit 1; }

# ── Errors-Kurzform ─────────────────────────────────────────────────────────
if [ "$ERRORS_ONLY" = true ]; then
  SERVICE="api"
  LEVEL="error"
fi

# ── Service validieren ───────────────────────────────────────────────────────
if [ -n "$SERVICE" ]; then
  if ! echo "$VALID_SERVICES" | grep -qw "$SERVICE"; then
    fail "Unbekannter Service: $SERVICE. Verfuegbar: $VALID_SERVICES"
  fi
fi

# ── Docker Compose Argumente bauen ───────────────────────────────────────────
COMPOSE_ARGS=("logs" "--tail=$TAIL")

if [ "$FOLLOW" = true ]; then
  COMPOSE_ARGS+=("-f")
fi

if [ -n "$SINCE" ]; then
  COMPOSE_ARGS+=("--since=$SINCE")
fi

if [ -n "$SERVICE" ]; then
  COMPOSE_ARGS+=("$SERVICE")
fi

# ── Header ───────────────────────────────────────────────────────────────────
if [ "$RAW_JSON" = false ]; then
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║  TempConnect — Log Inspector                                ║"
  echo "╠══════════════════════════════════════════════════════════════╣"
  printf "║  Service: %-10s  Level: %-8s  Since: %-12s  ║\n" \
    "${SERVICE:-alle}" "${LEVEL:-alle}" "${SINCE:---}"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo ""
fi

# ── Log-Level Map (pino nummerisch → Name) ───────────────────────────────────
# pino levels: 10=trace, 20=debug, 30=info, 40=warn, 50=error, 60=fatal
level_to_num() {
  case "$1" in
    trace) echo "10" ;;
    debug) echo "20" ;;
    info)  echo "30" ;;
    warn)  echo "40" ;;
    error) echo "50" ;;
    fatal) echo "60" ;;
    *)     echo "0" ;;
  esac
}

# ── Logs ausgeben ────────────────────────────────────────────────────────────
if [ "$RAW_JSON" = true ]; then
  # Raw JSON: keine Filterung, direkt durchreichen
  docker compose "${COMPOSE_ARGS[@]}" 2>&1
elif [ -n "$LEVEL" ]; then
  # Level-Filterung: pino JSON parsen
  # API-Logs sind JSON mit "level" Feld (nummerisch)
  MIN_LEVEL=$(level_to_num "$LEVEL")

  if command -v jq &>/dev/null; then
    # Mit jq: praezise JSON-Filterung + huebsche Ausgabe
    docker compose "${COMPOSE_ARGS[@]}" 2>&1 | while IFS= read -r line; do
      # Docker Compose Prefix entfernen (z.B. "tempconnect_api  | ")
      json_part=$(echo "$line" | sed 's/^[^{]*//')
      if echo "$json_part" | jq -e ".level >= $MIN_LEVEL" &>/dev/null 2>&1; then
        # Formatierte Ausgabe
        ts=$(echo "$json_part" | jq -r '.time // empty' 2>/dev/null)
        lvl=$(echo "$json_part" | jq -r '.level' 2>/dev/null)
        msg=$(echo "$json_part" | jq -r '.msg // empty' 2>/dev/null)

        # Level-Name und Farbe
        case "$lvl" in
          50|60) printf "\033[31m%-5s\033[0m " "ERROR" ;;  # Rot
          40)    printf "\033[33m%-5s\033[0m " "WARN"  ;;  # Gelb
          30)    printf "\033[32m%-5s\033[0m " "INFO"  ;;  # Gruen
          20)    printf "\033[36m%-5s\033[0m " "DEBUG" ;;  # Cyan
          *)     printf "%-5s " "$lvl" ;;
        esac

        [ -n "$ts" ] && printf "%s " "$ts"
        echo "$msg"
      fi
    done
  else
    # Ohne jq: einfache grep-Filterung
    log "Hinweis: jq nicht installiert — vereinfachte Filterung"
    case "$LEVEL" in
      error|fatal) docker compose "${COMPOSE_ARGS[@]}" 2>&1 | grep -iE '"level":(50|60)|error|fatal|ERR' ;;
      warn)        docker compose "${COMPOSE_ARGS[@]}" 2>&1 | grep -iE '"level":(40|50|60)|warn|error|fatal' ;;
      info)        docker compose "${COMPOSE_ARGS[@]}" 2>&1 | grep -iE '"level":(30|40|50|60)|info|warn|error' ;;
      debug)       docker compose "${COMPOSE_ARGS[@]}" 2>&1 ;;
      *)           docker compose "${COMPOSE_ARGS[@]}" 2>&1 ;;
    esac
  fi
else
  # Keine Level-Filterung: direkte Ausgabe
  docker compose "${COMPOSE_ARGS[@]}" 2>&1
fi
