#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# TempConnect — Release Artifact Verifier
# =============================================================================
# Prueft ein entpacktes Release-Verzeichnis auf verbotene Artefakte und Pflichtdateien.
#
# Nutzung:
#   ./scripts/release-verify.sh release/tempconnect-v2026.04.07
# =============================================================================

TARGET_DIR="${1:-}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[verify]${NC} $1"; }
warn()  { echo -e "${YELLOW}[verify]${NC} $1"; }
fail()  { echo -e "${RED}[verify]${NC} $1"; exit 1; }

[ -n "$TARGET_DIR" ] || fail "Bitte ein Release-Verzeichnis angeben"
[ -d "$TARGET_DIR" ] || fail "Verzeichnis nicht gefunden: $TARGET_DIR"

TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"
VIOLATIONS=0

check_required_file() {
  local relative_path="$1"
  if [ -f "${TARGET_DIR}/${relative_path}" ]; then
    info "Pflichtdatei vorhanden: ${relative_path}"
  else
    warn "FEHLT: ${relative_path}"
    VIOLATIONS=$((VIOLATIONS + 1))
  fi
}

check_forbidden_dir() {
  local dirname="$1"
  if find "$TARGET_DIR" -type d -name "$dirname" -print -quit | grep -q .; then
    warn "VERBOTENES VERZEICHNIS gefunden: ${dirname}"
    VIOLATIONS=$((VIOLATIONS + 1))
  else
    info "Kein ${dirname} im Release"
  fi
}

# --- Pflichtdateien ---
check_required_file "docker-compose.prod.yml"
check_required_file "api/package.json"
check_required_file "scripts/prod-update.sh"
check_required_file "scripts/prod-up.sh"
check_required_file "scripts/backup.sh"
check_required_file "scripts/backup-verify.sh"
check_required_file "scripts/restore.sh"
check_required_file "scripts/restore-test.sh"
check_required_file "README.md"

# --- .env / Secrets ---
while IFS= read -r -d '' envfile; do
  basename="$(basename "$envfile")"
  relpath="${envfile#$TARGET_DIR/}"
  if [[ "$basename" == *.example ]]; then
    info "Beispiel-Datei erlaubt: ${relpath}"
  else
    warn "SECRET-DATEI im Release gefunden: ${relpath}"
    VIOLATIONS=$((VIOLATIONS + 1))
  fi
done < <(find "$TARGET_DIR" -type f -name ".env*" -print0 2>/dev/null)

# --- Verbotene Verzeichnisse ---
check_forbidden_dir ".git"
check_forbidden_dir ".github"
check_forbidden_dir "node_modules"
check_forbidden_dir "coverage"
check_forbidden_dir ".c8_output"
check_forbidden_dir ".nyc_output"
check_forbidden_dir ".claude"
check_forbidden_dir ".agents"
check_forbidden_dir ".vercel"
check_forbidden_dir ".clone"
check_forbidden_dir ".claire"
check_forbidden_dir "test-results"
check_forbidden_dir "_zip_analysis"

# --- Verbotene Dateimuster ---
for pattern in "*.log" "*.tmp" "*.bak" "*.pid" "*.tar.gz" "*.zip" "*.pem" "*.key"; do
  if find "$TARGET_DIR" -type f -name "$pattern" -print -quit | grep -q .; then
    warn "UNERWUENSCHTE DATEIEN gefunden: ${pattern}"
    VIOLATIONS=$((VIOLATIONS + 1))
  else
    info "Keine Dateien mit Muster ${pattern}"
  fi
done

# --- Private-Key-Dateien ---
if find "$TARGET_DIR" -type f -name "private_key*" -print -quit | grep -q .; then
  warn "PRIVATE-KEY-DATEI im Release gefunden: private_key*"
  VIOLATIONS=$((VIOLATIONS + 1))
else
  info "Keine private_key-Dateien im Release"
fi

# --- Secret-Scan ---
#
# Die Regel lebt in scripts/lib/secretScan.mjs, nicht hier. Zwei Gruende:
#
# 1. BEWEISBARKEIT. Die fruehere Fassung stand als Regex an dieser Stelle und
#    meldete 18 Treffer, von denen KEINER ein Secret war — darunter ihr eigener
#    Kommentar zwei Zeilen weiter oben. Aufgefallen ist das erst beim Packen,
#    weil eine Shell-Regex nur beim Release laeuft und dann niemand mehr fragt.
#    Als Modul wird dieselbe Regel von api/test/releaseSecretScan.test.js mit
#    69 Faellen gefuettert: echte Fehlalarme UND gepflanzte echte Schluessel.
#
# 2. TEMPO. Die alte Schleife startete ZWEI grep-Prozesse pro ZEILE. Der Scan
#    war damit der langsamste Schritt der gesamten Pruefung.
#
# Einzelne Zeilen koennen mit dem Kommentar `secret-scan: erlaubt` freigegeben
# werden — sichtbar an der Fundstelle statt in einer Ausnahmeliste.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCANNER=""
for kandidat in "${SCRIPT_DIR}/lib/secretScan.mjs" "${TARGET_DIR}/scripts/lib/secretScan.mjs"; do
  [ -f "$kandidat" ] && { SCANNER="$kandidat"; break; }
done

if [ -z "$SCANNER" ]; then
  # Kein stilles Ueberspringen: Eine uebersprungene Sicherheitspruefung sieht im
  # Protokoll aus wie eine bestandene.
  warn "SECRET-SCAN NICHT MOEGLICH: scripts/lib/secretScan.mjs nicht gefunden"
  VIOLATIONS=$((VIOLATIONS + 1))
elif ! command -v node >/dev/null 2>&1; then
  warn "SECRET-SCAN NICHT MOEGLICH: node ist nicht verfuegbar"
  VIOLATIONS=$((VIOLATIONS + 1))
else
  SECRET_HITS=0
  while IFS= read -r fund; do
    [ -n "$fund" ] || continue
    # Format: pfad:zeile:grund:wert — der Wert wird NICHT ausgegeben.
    warn "SECRET in: ${fund%%:*}:$(echo "$fund" | cut -d: -f2) — $(echo "$fund" | cut -d: -f3)"
    SECRET_HITS=$((SECRET_HITS + 1))
  done < <(node "$SCANNER" "$TARGET_DIR" 2>/dev/null)

  if [ "$SECRET_HITS" -gt 0 ]; then
    warn "${SECRET_HITS} echte Zugangsdaten im Paket — Release blockiert"
    VIOLATIONS=$((VIOLATIONS + SECRET_HITS))
  else
    info "Keine Zugangsdaten im Paket"
  fi
fi

# --- Ergebnis ---
if [ "$VIOLATIONS" -gt 0 ]; then
  fail "Release-Validierung fehlgeschlagen (${VIOLATIONS} Problem(e))"
fi

info "Release-Validierung bestanden"
