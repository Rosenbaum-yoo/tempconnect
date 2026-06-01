#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# TempConnect – Sync Support Ops Frontend Artifacts
# Kopiert ein gebautes SOC-Frontend nach support-ops-dist/ fuer Nginx /support-ops/.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SOURCE_DIR="${1:-${SUPPORT_OPS_BUILD_DIR:-}}"
TARGET_DIR="${2:-$PROJECT_DIR/support-ops-dist}"

if [ -z "$SOURCE_DIR" ]; then
  echo "[sync-support-ops] FEHLER: Quellverzeichnis fehlt."
  echo "[sync-support-ops] Usage: ./scripts/sync-support-ops-artifacts.sh <source_dir> [target_dir]"
  echo "[sync-support-ops] Alternativ SUPPORT_OPS_BUILD_DIR setzen."
  exit 1
fi

if [ ! -d "$SOURCE_DIR" ]; then
  echo "[sync-support-ops] FEHLER: Quelle existiert nicht oder ist kein Verzeichnis: $SOURCE_DIR"
  exit 1
fi

if [ ! -f "$SOURCE_DIR/index.html" ]; then
  echo "[sync-support-ops] FEHLER: index.html fehlt in Quelle: $SOURCE_DIR"
  exit 1
fi

mkdir -p "$TARGET_DIR"
find "$TARGET_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -R "$SOURCE_DIR"/. "$TARGET_DIR"/

echo "[sync-support-ops] Artefakte synchronisiert:"
echo "  source: $SOURCE_DIR"
echo "  target: $TARGET_DIR"
