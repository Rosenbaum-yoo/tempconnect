#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# TempConnect — Dev: Worker-Management
# =============================================================================
# Verwaltet BullMQ-Background-Worker im Entwicklungsmodus.
# Worker laufen innerhalb des API-Containers (gestartet von server.js).
#
# Nutzung:
#   ./scripts/dev/run-worker.sh                 # API + Worker im Watch-Modus starten
#   ./scripts/dev/run-worker.sh --status        # Queue-Status anzeigen
#   ./scripts/dev/run-worker.sh --watch-status  # Queue-Status live beobachten
#   ./scripts/dev/run-worker.sh --drain=email   # Alle Jobs einer Queue loeschen
#   ./scripts/dev/run-worker.sh --restart       # API-Container neu starten
#   ./scripts/dev/run-worker.sh --logs          # Worker-Logs anzeigen
#
# Worker: email (E-Mail-Versand), match (Matching-Engine), capacity (Kapazitaeten)
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
cd "$PROJECT_DIR"

# ── Argument-Parsing ─────────────────────────────────────────────────────────
MODE="start"

for arg in "$@"; do
  case "$arg" in
    --status|-s)       MODE="status" ;;
    --watch-status|-w) MODE="watch-status" ;;
    --drain=*)         MODE="drain"; DRAIN_QUEUE="${arg#--drain=}" ;;
    --restart|-r)      MODE="restart" ;;
    --logs|-l)         MODE="logs" ;;
    --help|-h)
      echo "Nutzung: $0 [--status|--watch-status|--drain=<queue>|--restart|--logs]"
      echo ""
      echo "Modi:"
      echo "  (ohne Arg)          API + Worker im Watch-Modus starten"
      echo "  --status, -s        Queue-Status einmalig anzeigen"
      echo "  --watch-status, -w  Queue-Status live beobachten (alle 5s)"
      echo "  --drain=<queue>     Alle wartenden Jobs einer Queue loeschen"
      echo "  --restart, -r       API-Container neu starten (Worker werden neu initialisiert)"
      echo "  --logs, -l          Worker-relevante Logs anzeigen"
      echo ""
      echo "Queues: email, match, capacity"
      exit 0
      ;;
    *) echo "[run-worker] FEHLER: Unbekanntes Argument: $arg"; exit 1 ;;
  esac
done

# ── Hilfsfunktionen ─────────────────────────────────────────────────────────
log()  { echo "[run-worker] $(date +%H:%M:%S) $*"; }
fail() { echo "[run-worker] FEHLER: $*" >&2; exit 1; }

# Pruefen ob API-Container laeuft
check_api() {
  if ! docker compose ps api --format json 2>/dev/null | grep -q '"running"'; then
    fail "API-Container laeuft nicht. Starte ihn mit: docker compose up -d"
  fi
}

# ── Modi ausfuehren ─────────────────────────────────────────────────────────
case "$MODE" in
  start)
    log "Starte TempConnect API + Worker im Development-Modus..."
    log "Worker werden automatisch von server.js gestartet (email, match, capacity)"
    echo ""

    # Sicherstellen dass Redis laeuft (Worker brauchen Redis)
    if ! docker compose ps redis --format json 2>/dev/null | grep -q '"running"'; then
      log "Redis nicht gestartet — starte Redis..."
      docker compose up -d redis
      sleep 2
    fi

    # API mit Watch-Modus starten (Neustart bei Code-Aenderungen)
    log "API startet mit --watch (auto-reload bei Aenderungen)..."
    log "Worker-Status pruefen: $0 --status"
    log "Logs: $0 --logs"
    echo ""
    docker compose up -d api
    sleep 3

    # Kurze Statusausgabe
    log "Container-Status:"
    docker compose ps api redis
    echo ""
    log "Worker-Initialisierung..."
    # Kurz warten und letzte Log-Zeilen anzeigen
    sleep 2
    docker compose logs --tail=5 api 2>/dev/null | grep -i "worker\|queue\|started" || true
    echo ""
    log "API + Worker laufen. Logs: docker compose logs -f api"
    ;;

  status)
    check_api
    log "Queue-Status abfragen..."
    docker compose exec api node scripts/queue-status.js
    ;;

  watch-status)
    check_api
    log "Queue-Status live (Ctrl+C zum Beenden)..."
    docker compose exec api node scripts/queue-status.js --watch
    ;;

  drain)
    check_api
    log "Leere Queue: $DRAIN_QUEUE"
    docker compose exec api node scripts/queue-status.js "--drain=$DRAIN_QUEUE"
    ;;

  restart)
    log "Starte API-Container neu (Worker werden re-initialisiert)..."
    docker compose restart api
    sleep 5
    log "Container-Status:"
    docker compose ps api
    echo ""
    docker compose logs --tail=5 api 2>/dev/null | grep -i "worker\|queue\|started" || true
    ;;

  logs)
    check_api
    log "Worker-Logs (Ctrl+C zum Beenden)..."
    echo ""
    # Worker-relevante Log-Zeilen filtern
    docker compose logs -f --tail=50 api 2>&1 | grep -iE "worker|queue|job|bullmq|email.*sent|match.*found|capacity" || \
      docker compose logs -f --tail=50 api
    ;;
esac
