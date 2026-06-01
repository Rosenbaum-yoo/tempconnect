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

# --- Secret-Pattern-Scan (HIGH CONFIDENCE: echte Werte, keine Platzhalter) ---
SECRET_HITS=0
while IFS= read -r -d '' srcfile; do
  basename="$(basename "$srcfile")"
  # .example-Dateien sind erlaubt
  [[ "$basename" == *.example ]] && continue
  # Nur in relevanten Dateitypen scannen
  [[ "$srcfile" =~ \.(js|ts|json|yml|yaml|sh|env|conf|config|ini|toml)$ ]] || \
    [[ "$basename" == ".env" ]] || [[ "$basename" == "Makefile" ]] || continue

  # Suche nach verdaechtig realistisch aussehenden Secrets
  # (mehr als 20 Zeichen nach dem = , keine typischen Platzhalter-Werte)
  while IFS= read -r line; do
    # Überspringe offensichtliche Platzhalter
    if echo "$line" | grep -qE '(PLATZHALTER|placeholder|CHANGE_ME|your_|<.*>|EXAMPLE|DUMMY|HIER_|ENTER_|REPLACE|TODO|xxx|yyy|zzz)'; then
      continue
    fi
    # Warnung bei verdaechtig langen Werten nach SECRET=, TOKEN=, PASSWORD=, KEY=
    if echo "$line" | grep -qE '(SECRET|TOKEN|PASSWORD|PRIVATE_KEY|API_KEY)\s*=\s*.{20,}'; then
      relpath="${srcfile#$TARGET_DIR/}"
      warn "MOEGLICHES SECRET in: ${relpath}"
      SECRET_HITS=$((SECRET_HITS + 1))
    fi
  done < "$srcfile"
done < <(find "$TARGET_DIR" -type f -print0 2>/dev/null)

if [ "$SECRET_HITS" -gt 0 ]; then
  warn "${SECRET_HITS} moegliche Secret-Treffer gefunden — bitte manuell pruefen"
  VIOLATIONS=$((VIOLATIONS + SECRET_HITS))
else
  info "Kein High-Confidence Secret-Treffer gefunden"
fi

# --- Ergebnis ---
if [ "$VIOLATIONS" -gt 0 ]; then
  fail "Release-Validierung fehlgeschlagen (${VIOLATIONS} Problem(e))"
fi

info "Release-Validierung bestanden"
