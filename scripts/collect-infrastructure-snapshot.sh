#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# TempConnect – Collect Infrastructure Snapshot
# Ermittelt Host-Metriken und sendet sie an
# POST /api/internal/infrastructure-snapshots/ingest
# =============================================================================

BASE_URL="${BASE_URL:-${1:-http://127.0.0.1:8080}}"
INTERNAL_SECRET="${INTERNAL_CRON_SECRET:-}"
HOST_NAME="${HOST_NAME:-$(hostname -s 2>/dev/null || hostname)}"
HOST_ENV="${HOST_ENV:-production}"
TLS_DOMAIN="${TLS_DOMAIN:-}"
BACKUP_TIMESTAMP_FILE="${BACKUP_TIMESTAMP_FILE:-/var/backups/tempconnect/.last_success_epoch}"
DEPLOYMENT_VERSION="${DEPLOYMENT_VERSION:-}"
DEPLOYMENT_STATUS="${DEPLOYMENT_STATUS:-running}"

if [ -z "$INTERNAL_SECRET" ]; then
  echo "[infra-collect] FEHLER: INTERNAL_CRON_SECRET ist nicht gesetzt."
  exit 1
fi

json_number_or_null() {
  local v="${1:-}"
  if [ -z "$v" ]; then
    printf "null"
  else
    printf "%s" "$v"
  fi
}

escape_json() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

CPU_PERCENT="$(vmstat 1 2 2>/dev/null | tail -1 | awk '{printf "%.2f", (100-$15)}' || true)"
RAM_PERCENT="$(free 2>/dev/null | awk '/Mem:/ {printf "%.2f", ($3/$2)*100}' || true)"
DISK_PERCENT="$(df -P / 2>/dev/null | awk 'NR==2 {gsub(\"%\", \"\", $5); print $5}' || true)"

DOCKER_RUNNING_COUNT="0"
DOCKER_UNHEALTHY_COUNT="0"
if command -v docker >/dev/null 2>&1; then
  DOCKER_RUNNING_COUNT="$(docker ps --format '{{.Names}}' 2>/dev/null | wc -l | tr -d ' ' || echo "0")"
  DOCKER_UNHEALTHY_COUNT="$(docker ps --format '{{.Status}}' 2>/dev/null | grep -ci unhealthy || true)"
fi

TLS_DAYS_REMAINING=""
if [ -n "$TLS_DOMAIN" ] && command -v openssl >/dev/null 2>&1; then
  TLS_END_RAW="$(echo | openssl s_client -servername "$TLS_DOMAIN" -connect "$TLS_DOMAIN:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2- || true)"
  if [ -n "$TLS_END_RAW" ]; then
    TLS_END_TS="$(date -d "$TLS_END_RAW" +%s 2>/dev/null || true)"
    if [ -n "$TLS_END_TS" ]; then
      NOW_TS="$(date +%s)"
      TLS_DAYS_REMAINING="$(( (TLS_END_TS - NOW_TS) / 86400 ))"
    fi
  fi
fi

BACKUP_AGE_H=""
if [ -f "$BACKUP_TIMESTAMP_FILE" ]; then
  LAST_BACKUP_TS="$(tr -dc '0-9' < "$BACKUP_TIMESTAMP_FILE" | head -c 10 || true)"
  if [ -n "$LAST_BACKUP_TS" ]; then
    NOW_TS="$(date +%s)"
    BACKUP_AGE_H="$(awk -v now="$NOW_TS" -v last="$LAST_BACKUP_TS" 'BEGIN { if (last > 0 && now >= last) printf "%.2f", (now-last)/3600; }')"
  fi
fi

HOST_NAME_JSON="$(escape_json "$HOST_NAME")"
HOST_ENV_JSON="$(escape_json "$HOST_ENV")"
DEPLOYMENT_VERSION_JSON="$(escape_json "$DEPLOYMENT_VERSION")"
DEPLOYMENT_STATUS_JSON="$(escape_json "$DEPLOYMENT_STATUS")"
COLLECTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

PAYLOAD=$(cat <<JSON
{
  "source": "host_collector",
  "snapshots": [
    {
      "host_name": "$HOST_NAME_JSON",
      "env": "$HOST_ENV_JSON",
      "cpu_percent": $(json_number_or_null "$CPU_PERCENT"),
      "ram_percent": $(json_number_or_null "$RAM_PERCENT"),
      "disk_percent": $(json_number_or_null "$DISK_PERCENT"),
      "docker_running_count": $DOCKER_RUNNING_COUNT,
      "docker_unhealthy_count": $DOCKER_UNHEALTHY_COUNT,
      "tls_days_remaining": $(json_number_or_null "$TLS_DAYS_REMAINING"),
      "backup_age_h": $(json_number_or_null "$BACKUP_AGE_H"),
      "deployment_version": "$DEPLOYMENT_VERSION_JSON",
      "deployment_status": "$DEPLOYMENT_STATUS_JSON",
      "collected_at": "$COLLECTED_AT"
    }
  ]
}
JSON
)

curl -fsS -X POST "$BASE_URL/api/internal/infrastructure-snapshots/ingest" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Secret: $INTERNAL_SECRET" \
  -d "$PAYLOAD" >/dev/null

echo "[infra-collect] Snapshot erfolgreich gesendet: host=$HOST_NAME collected_at=$COLLECTED_AT"
