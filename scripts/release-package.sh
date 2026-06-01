#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# TempConnect — Release Package Builder
# =============================================================================
# Erstellt ein sauberes Release-Paket (tar.gz), bevorzugt direkt aus einem Git-Ref.
# Keine Secrets, keine node_modules, keine VCS-Metadaten, keine Test-Artefakte.
#
# Nutzung:
#   ./scripts/release-package.sh
#   ./scripts/release-package.sh v2026.04.07
#   ./scripts/release-package.sh v2026.04.07 v2026.04.07
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_NAME="tempconnect"
VERIFY_SCRIPT="${SCRIPT_DIR}/release-verify.sh"
VERSION="${1:-$(date +%Y-%m-%d)}"
SOURCE_REF="${2:-HEAD}"
RELEASE_DIR="${PROJECT_DIR}/release"
ARCHIVE_NAME="${PROJECT_NAME}-${VERSION}"
STAGING_DIR="${RELEASE_DIR}/${ARCHIVE_NAME}"
ARCHIVE_FILE="${RELEASE_DIR}/${ARCHIVE_NAME}.tar.gz"
SOURCE_MODE="working-tree"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[release]${NC} $1"; }
warn()  { echo -e "${YELLOW}[release]${NC} $1"; }
fail()  { echo -e "${RED}[release]${NC} $1"; exit 1; }

cleanup() {
  [ -d "$STAGING_DIR" ] && rm -rf "$STAGING_DIR"
}
trap cleanup EXIT

info "Release-Paket: ${ARCHIVE_NAME}"
info "Quelle: ${PROJECT_DIR}"

[ -f "${PROJECT_DIR}/docker-compose.prod.yml" ] || fail "Kein docker-compose.prod.yml gefunden — falsches Verzeichnis?"
[ -f "${PROJECT_DIR}/api/package.json" ] || fail "api/package.json fehlt"
[ -f "${PROJECT_DIR}/scripts/prod-update.sh" ] || fail "scripts/prod-update.sh fehlt"
[ -f "${VERIFY_SCRIPT}" ] || fail "scripts/release-verify.sh fehlt"

mkdir -p "$RELEASE_DIR"
rm -rf "$STAGING_DIR"
rm -f "$ARCHIVE_FILE"

EXCLUDE_LIST=(
  ".env"
  ".env.local"
  ".env.dev"
  ".env.prod"
  ".env.txt"
  ".git"
  ".github"
  "node_modules"
  "coverage"
  ".c8_output"
  ".nyc_output"
  "*.log"
  "npm-debug.log*"
  "tmp"
  "*.tmp"
  "*.bak"
  "*.pid"
  "data"
  "db-data"
  "redis-data"
  "backups"
  "uploads"
  "dist"
  "build"
  "release"
  "*.tar.gz"
  "*.zip"
  ".DS_Store"
  "Thumbs.db"
  "desktop.ini"
  ".idea"
  ".vscode"
  ".warp"
  ".claude"
  ".agents"
  ".vercel"
  ".clone"
  ".claire"
  "test-results"
  "_zip_analysis"
  "*.pem"
  "*.key"
  "private_key"
  "frontend/owner-control"
  "*.swp"
  "*.swo"
  "docker-compose.override.yml"
)

if command -v git >/dev/null 2>&1 && [ -d "${PROJECT_DIR}/.git" ]; then
  git -C "$PROJECT_DIR" rev-parse --verify "${SOURCE_REF}^{commit}" >/dev/null 2>&1 \
    || fail "Git-Ref '${SOURCE_REF}' existiert nicht oder ist kein Commit"
  SOURCE_MODE="git-archive"
  info "Erzeuge Staging aus Git-Ref '${SOURCE_REF}' ..."
  git -C "$PROJECT_DIR" archive --format=tar --prefix="${ARCHIVE_NAME}/" "$SOURCE_REF" \
    | tar -xf - -C "$RELEASE_DIR"
  rm -rf "${STAGING_DIR}/.github"
else
  warn "Git-Archivierung nicht verfügbar — verwende Arbeitsbaum als Fallback."
  mkdir -p "$STAGING_DIR"
  if command -v rsync >/dev/null 2>&1; then
    RSYNC_EXCLUDES=()
    for pattern in "${EXCLUDE_LIST[@]}"; do
      RSYNC_EXCLUDES+=(--exclude "$pattern")
    done
    rsync -a "${RSYNC_EXCLUDES[@]}" "${PROJECT_DIR}/" "${STAGING_DIR}/"
  else
    TAR_EXCLUDES=()
    for pattern in "${EXCLUDE_LIST[@]}"; do
      TAR_EXCLUDES+=(--exclude="$pattern")
    done
    tar -cf - "${TAR_EXCLUDES[@]}" -C "$PROJECT_DIR" . | tar -xf - -C "$STAGING_DIR"
  fi
fi

info "Validiere Release-Staging ..."
bash "$VERIFY_SCRIPT" "$STAGING_DIR"

info "Erstelle ${ARCHIVE_FILE} ..."
if tar --version 2>/dev/null | grep -qi 'gnu tar'; then
  tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner \
    -czf "$ARCHIVE_FILE" -C "$RELEASE_DIR" "$ARCHIVE_NAME"
else
  tar -czf "$ARCHIVE_FILE" -C "$RELEASE_DIR" "$ARCHIVE_NAME"
fi

if command -v sha256sum >/dev/null 2>&1; then
  SHA=$(sha256sum "$ARCHIVE_FILE" | awk '{print $1}')
elif command -v shasum >/dev/null 2>&1; then
  SHA=$(shasum -a 256 "$ARCHIVE_FILE" | awk '{print $1}')
else
  SHA="(sha256sum nicht verfuegbar)"
fi

MANIFEST="${RELEASE_DIR}/${ARCHIVE_NAME}.manifest.txt"
{
  echo "# TempConnect Release Manifest"
  echo "# Erstellt: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "# Version: ${VERSION}"
  echo ""
  echo "Archive: ${ARCHIVE_NAME}.tar.gz"
  echo "Source mode: ${SOURCE_MODE}"
  echo "Source ref: ${SOURCE_REF}"
  echo "SHA-256: ${SHA}"
  echo ""
  echo "# Inhalt:"
  tar -tzf "$ARCHIVE_FILE" | awk 'NR<=50 {print} END { if (NR > 50) print "..." }'
  echo ""
  echo "# Ausgeschlossene Kategorien:"
  echo "#   - .env / Secrets"
  echo "#   - .git / VCS-History"
  echo "#   - .github / CI-Metadaten"
  echo "#   - node_modules / Dependencies"
  echo "#   - coverage / .c8_output / Test-Artefakte"
  echo "#   - Logs, Temp-Dateien, Data Volumes"
  echo "#   - IDE-Config, OS-Artefakte"
} > "$MANIFEST"

FILE_COUNT=$(find "$STAGING_DIR" -type f | wc -l | tr -d ' ')
FILE_SIZE=$(du -h "$ARCHIVE_FILE" | awk '{print $1}')

echo ""
info "═══════════════════════════════════════════════════════"
info "Release-Paket erstellt"
info "═══════════════════════════════════════════════════════"
info "Datei:    ${ARCHIVE_FILE}"
info "Groesse:  ${FILE_SIZE}"
info "Dateien:  ${FILE_COUNT}"
info "Quelle:   ${SOURCE_MODE} (${SOURCE_REF})"
info "SHA-256:  ${SHA}"
info "Manifest: ${MANIFEST}"
info "═══════════════════════════════════════════════════════"
echo ""
info "Naechste Schritte:"
info "  1. Manifest pruefen:  cat ${MANIFEST}"
info "  2. Paket testen:      tar -tzf ${ARCHIVE_FILE}"
info "  3. Deployment:        Release-Artefakt auf den Server kopieren und dort entpacken"
