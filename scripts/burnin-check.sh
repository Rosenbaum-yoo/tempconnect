#!/usr/bin/env bash
set -uo pipefail
# =============================================================================
# TempConnect — Burn-in Daily Check (WAVE 16 / F4.1)
# =============================================================================
# Automatisiert die täglichen Burn-in-Checks aus
#   docs/releases/WAVE16_BURNIN_RUNBOOK.md  (Phase 3, Tabelle "Tägliche Checks")
# zu EINEM Kommando und schreibt eine strukturierte Protokollzeile.
#
# Prüft:
#   1. Health / Ready / Live        (P0 — Endpoint muss antworten)
#   2. Fatal/Error-Lograte (24h)    (P0 — level 50/60 muss 0 sein)
#   3. 5xx-Antworten (24h)          (WARN — Operator triagiert lt. Runbook)
#   4. Backup-Frische               (P0 — last_success_epoch < 25h)
#   5. Memory-Auslastung API        (INFO — auf Leak-Trend beobachten)
#   6. Secret-Leak-Scan in Logs     (WARN — verdächtige Treffer melden)
#
# Nutzung:
#   ./scripts/burnin-check.sh
#   BASE_URL=https://preprod.example.com ./scripts/burnin-check.sh
#   BURNIN_PROTOCOL=docs/releases/burnin-protocol.log ./scripts/burnin-check.sh
#
# Env:
#   BASE_URL          API-Basis-URL            (Default: http://localhost:8080)
#   API_CONTAINER     Docker-Container der API (Default: tempconnect_api)
#   BACKUP_DIR        Backup-Verzeichnis       (Default: ./backups)
#   BACKUP_MAX_AGE_S  Max. Backup-Alter in Sek (Default: 90000 = 25h)
#   BURNIN_PROTOCOL   Protokolldatei zum Anhängen (optional)
#
# Exit-Codes: 0 = alle P0 grün, 1 = mind. ein P0-Fehler. WARN/INFO blockieren nie.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

BASE_URL="${BASE_URL:-http://localhost:8080}"
API_CONTAINER="${API_CONTAINER:-tempconnect_api}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
BACKUP_MAX_AGE_S="${BACKUP_MAX_AGE_S:-90000}"
BURNIN_PROTOCOL="${BURNIN_PROTOCOL:-}"

NOW_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
P0_FAILURES=0
WARNINGS=0

log()  { echo "[burnin] $*"; }
ok()   { log "  ✓ $*"; }
p0()   { log "  ✗ [P0] $*"; P0_FAILURES=$((P0_FAILURES + 1)); }
warn() { log "  ⚠ [WARN] $*"; WARNINGS=$((WARNINGS + 1)); }
info() { log "  · $*"; }

log "═══════════════════════════════════════════════════"
log "TempConnect Burn-in Daily Check — $NOW_ISO"
log "Ziel: $BASE_URL   Container: $API_CONTAINER"
log "═══════════════════════════════════════════════════"

# ── 1. Health / Ready / Live ─────────────────────────────────────────────────
HEALTH_STATUS="down"; READY_STATUS="down"; LIVE_STATUS="down"
# Setzt die per Name übergebene Statusvariable direkt (printf -v) — KEINE
# Command-Substitution, damit Log-Ausgabe nicht gefangen wird und die p0/ok-Zähler
# im aktuellen Shell-Kontext (nicht in einer Subshell) greifen.
check_endpoint() {
  local path="$1" label="$2" __var="$3" body
  if body="$(curl -sf --max-time 10 "$BASE_URL$path" 2>/dev/null)"; then
    if echo "$body" | grep -q '"ok"[[:space:]]*:[[:space:]]*true'; then
      ok "$label OK ($path)"; printf -v "$__var" "ok"; return 0
    fi
    p0 "$label antwortet, aber ok!=true ($path): $body"; printf -v "$__var" "degraded"; return 1
  fi
  p0 "$label nicht erreichbar ($path)"; printf -v "$__var" "down"; return 1
}
log "1) Health / Ready / Live"
check_endpoint /api/health Health HEALTH_STATUS
check_endpoint /api/ready  Ready  READY_STATUS
check_endpoint /api/live   Live   LIVE_STATUS

# ── Docker verfügbar? (Log-/Memory-Checks brauchen den Container) ────────────
HAS_DOCKER=false
if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${API_CONTAINER}$"; then
  HAS_DOCKER=true
fi

# ── 2. Fatal/Error-Lograte (24h) ─────────────────────────────────────────────
FATAL_COUNT="n/a"
log "2) Fatal/Error-Lograte (24h, pino level 50/60)"
if [ "$HAS_DOCKER" = true ]; then
  FATAL_COUNT=$(docker logs --since 24h "$API_CONTAINER" 2>&1 | grep -Ec '"level":(50|60)' || true)
  if [ "$FATAL_COUNT" -eq 0 ] 2>/dev/null; then
    ok "Keine Fatal/Error-Logs (level 50/60) in 24h"
  else
    p0 "$FATAL_COUNT Fatal/Error-Logzeilen (level 50/60) in 24h"
  fi
else
  info "Docker/Container nicht verfügbar — Log-Check übersprungen"
fi

# ── 3. 5xx-Antworten (24h) ───────────────────────────────────────────────────
HTTP5XX_COUNT="n/a"
log "3) 5xx-Antworten (24h)"
if [ "$HAS_DOCKER" = true ]; then
  HTTP5XX_COUNT=$(docker logs --since 24h "$API_CONTAINER" 2>&1 | grep -Ec '"statusCode":5[0-9][0-9]' || true)
  if [ "$HTTP5XX_COUNT" -eq 0 ] 2>/dev/null; then
    ok "Keine 5xx-Antworten in 24h"
  else
    warn "$HTTP5XX_COUNT 5xx-Antworten in 24h — lt. Runbook triagieren (Auth-5xx=P0, sonst P1)"
  fi
else
  info "Docker/Container nicht verfügbar — 5xx-Check übersprungen"
fi

# ── 4. Backup-Frische ────────────────────────────────────────────────────────
BACKUP_AGE_S="n/a"
log "4) Backup-Frische (< $((BACKUP_MAX_AGE_S / 3600))h)"
EPOCH_FILE="$BACKUP_DIR/last_success_epoch"
if [ -f "$EPOCH_FILE" ]; then
  LAST_EPOCH=$(tr -d ' \n\r' < "$EPOCH_FILE")
  if [ -n "$LAST_EPOCH" ] && [ "$LAST_EPOCH" -eq "$LAST_EPOCH" ] 2>/dev/null; then
    BACKUP_AGE_S=$(( $(date +%s) - LAST_EPOCH ))
    if [ "$BACKUP_AGE_S" -le "$BACKUP_MAX_AGE_S" ]; then
      ok "Letztes Backup vor $((BACKUP_AGE_S / 3600))h $(((BACKUP_AGE_S % 3600) / 60))m"
    else
      p0 "Backup zu alt: $((BACKUP_AGE_S / 3600))h (max $((BACKUP_MAX_AGE_S / 3600))h)"
    fi
  else
    p0 "last_success_epoch unlesbar/ungültig"
  fi
else
  p0 "Kein Backup-Status gefunden ($EPOCH_FILE) — Backup-Job läuft nicht?"
fi

# ── 5. Memory-Auslastung API (INFO — Leak-Trend) ─────────────────────────────
MEM_USAGE="n/a"
log "5) Memory-Auslastung API (Leak-Beobachtung)"
if [ "$HAS_DOCKER" = true ]; then
  MEM_USAGE=$(docker stats "$API_CONTAINER" --no-stream --format '{{.MemUsage}} ({{.MemPerc}})' 2>/dev/null || echo "n/a")
  info "Memory: $MEM_USAGE  (Trend über Tage vergleichen — stetiger Anstieg = Leak)"
else
  info "Docker/Container nicht verfügbar — Memory-Check übersprungen"
fi

# ── 6. Secret-Leak-Scan in Logs (WARN) ───────────────────────────────────────
SECRET_HITS="n/a"
log "6) Secret-Leak-Scan in Logs (24h)"
if [ "$HAS_DOCKER" = true ]; then
  # Verdächtig: ein Geheimnis-Schlüssel mit befülltem Wert (nicht [REDACTED], nicht leer).
  SECRET_HITS=$(docker logs --since 24h "$API_CONTAINER" 2>&1 \
    | grep -Eio '"(password|secret|token|api[_-]?key)"[[:space:]]*:[[:space:]]*"[^"]+"' \
    | grep -viE '\[REDACTED\]|"(password|secret|token|api[_-]?key)"[[:space:]]*:[[:space:]]*""' \
    | wc -l | tr -d ' ')
  if [ "$SECRET_HITS" -eq 0 ] 2>/dev/null; then
    ok "Keine befüllten Secret-Felder in Logs"
  else
    warn "$SECRET_HITS verdächtige Secret-Treffer in Logs — manuell prüfen (Redaction-Lücke?)"
  fi
else
  info "Docker/Container nicht verfügbar — Secret-Scan übersprungen"
fi

# ── Strukturierte Protokollzeile ─────────────────────────────────────────────
RESULT=$([ "$P0_FAILURES" -eq 0 ] && echo "PASS" || echo "FAIL")
PROTO_LINE="$NOW_ISO result=$RESULT p0=$P0_FAILURES warn=$WARNINGS health=$HEALTH_STATUS ready=$READY_STATUS live=$LIVE_STATUS fatal24h=$FATAL_COUNT http5xx24h=$HTTP5XX_COUNT backup_age_s=$BACKUP_AGE_S mem=\"$MEM_USAGE\" secret_hits=$SECRET_HITS"

log "═══════════════════════════════════════════════════"
log "ERGEBNIS: $RESULT  (P0=$P0_FAILURES, WARN=$WARNINGS)"
log "PROTOKOLL: $PROTO_LINE"
log "═══════════════════════════════════════════════════"

if [ -n "$BURNIN_PROTOCOL" ]; then
  mkdir -p "$(dirname "$BURNIN_PROTOCOL")"
  echo "$PROTO_LINE" >> "$BURNIN_PROTOCOL"
  log "Protokollzeile angehängt an: $BURNIN_PROTOCOL"
fi

[ "$P0_FAILURES" -eq 0 ] && exit 0 || exit 1
