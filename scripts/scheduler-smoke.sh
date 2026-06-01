#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# TempConnect – Scheduler Smoke Test
# Testet die internen Cron-Endpoints mit INTERNAL_CRON_SECRET.
# =============================================================================

BASE_URL="${1:-http://127.0.0.1:8080}"
SECRET="${INTERNAL_CRON_SECRET:-}"

if [ -z "$SECRET" ]; then
  echo "FEHLER: INTERNAL_CRON_SECRET nicht gesetzt."
  echo "Usage: INTERNAL_CRON_SECRET=xxx ./scripts/scheduler-smoke.sh [BASE_URL]"
  exit 1
fi

echo "Scheduler Smoke Test gegen: $BASE_URL"
echo "============================================="

# SLA Scan
echo -n "POST /api/internal/sla-scan ... "
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/api/internal/sla-scan" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Secret: $SECRET" 2>/dev/null || echo "000")
[ "$HTTP_CODE" = "200" ] && echo "OK ($HTTP_CODE)" || echo "FAIL ($HTTP_CODE)"

# Expire Reservations
echo -n "POST /api/internal/expire-reservations ... "
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/api/internal/expire-reservations" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Secret: $SECRET" 2>/dev/null || echo "000")
[ "$HTTP_CODE" = "200" ] && echo "OK ($HTTP_CODE)" || echo "FAIL ($HTTP_CODE)"

# Cleanup Idempotency Keys
echo -n "POST /api/internal/cleanup-idempotency ... "
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/api/internal/cleanup-idempotency" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Secret: $SECRET" 2>/dev/null || echo "000")
[ "$HTTP_CODE" = "200" ] && echo "OK ($HTTP_CODE)" || echo "FAIL ($HTTP_CODE)"

# Search Jobs Batch
echo -n "POST /api/internal/sla-search-run ... "
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/api/internal/sla-search-run" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Secret: $SECRET" 2>/dev/null || echo "000")
[ "$HTTP_CODE" = "200" ] && echo "OK ($HTTP_CODE)" || echo "FAIL ($HTTP_CODE)"

# Worker Document Expiry Scan
echo -n "POST /api/internal/worker-document-expiry-scan ... "
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/api/internal/worker-document-expiry-scan" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Secret: $SECRET" 2>/dev/null || echo "000")
[ "$HTTP_CODE" = "200" ] && echo "OK ($HTTP_CODE)" || echo "FAIL ($HTTP_CODE)"

# Infrastructure Snapshot Ingest
echo -n "POST /api/internal/infrastructure-snapshot-ingest ... "
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/api/internal/infrastructure-snapshot-ingest" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Secret: $SECRET" \
  -d '{"host_name":"scheduler-smoke","cpu_percent":10,"ram_percent":20,"disk_percent":30,"docker_running_count":1,"docker_unhealthy_count":0}' \
  2>/dev/null || echo "000")
[ "$HTTP_CODE" = "200" ] && echo "OK ($HTTP_CODE)" || echo "FAIL ($HTTP_CODE)"

echo ""
echo "Smoke Test abgeschlossen."
