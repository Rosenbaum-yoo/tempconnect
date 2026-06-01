#!/bin/sh
# =============================================================================
# TempConnect — Prometheus Startup Wrapper
# =============================================================================
# Substituiert PROMETHEUS_METRICS_SECRET_PLACEHOLDER mit dem echten Secret
# aus der Umgebungsvariable PROMETHEUS_METRICS_SECRET, bevor Prometheus
# gestartet wird. Wird von docker-compose.monitoring.yml als entrypoint
# verwendet.
#
# Pflichtschritt Prod: PROMETHEUS_METRICS_SECRET in .env setzen.
# =============================================================================
set -e

TEMPLATE="/etc/prometheus/prometheus.yml"
RUNTIME_CONFIG="/tmp/prometheus-runtime.yml"

# Warnung wenn Secret nicht gesetzt (Monitoring wird nicht funktionieren)
if [ -z "${PROMETHEUS_METRICS_SECRET}" ]; then
  echo "[WARN] PROMETHEUS_METRICS_SECRET ist nicht gesetzt. Metrics-Endpoint-Auth schlaegt fehl."
  echo "[WARN] Bitte PROMETHEUS_METRICS_SECRET in .env setzen (entspricht ADMIN_SECRET in api/.env)."
fi

# Template-Substitution: Placeholder → echtes Secret
sed "s/PROMETHEUS_METRICS_SECRET_PLACEHOLDER/${PROMETHEUS_METRICS_SECRET:-UNCONFIGURED}/g" \
    "${TEMPLATE}" > "${RUNTIME_CONFIG}"

echo "[INFO] Prometheus-Config generiert: ${RUNTIME_CONFIG}"

# Prometheus starten — alle weiteren Args ($@) werden durchgereicht
exec /bin/prometheus \
    --config.file="${RUNTIME_CONFIG}" \
    "$@"
