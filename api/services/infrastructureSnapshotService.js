function normalizePercent(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n));
}

function normalizePositiveNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function normalizeInteger(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, n);
}

function normalizeOptionalInteger(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n)) return null;
  return n;
}

function normalizeTimestamp(value) {
  if (!value) return null;
  const ts = new Date(value);
  if (Number.isNaN(ts.getTime())) return null;
  return ts.toISOString();
}

function normalizeMetadata(raw, source) {
  const base = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    ...base,
    source: source || base.source || "collector"
  };
}

function normalizeSnapshot(rawSnapshot, source) {
  if (!rawSnapshot || typeof rawSnapshot !== "object") {
    return { error: "INVALID_SNAPSHOT_OBJECT" };
  }
  const hostName = String(rawSnapshot.host_name || rawSnapshot.host || "").trim();
  if (!hostName) {
    return { error: "MISSING_HOST_NAME" };
  }

  const envRaw = String(rawSnapshot.env || "production").trim().toLowerCase();
  const env = ["production", "staging", "testing", "development"].includes(envRaw) ? envRaw : "production";

  return {
    snapshot: {
      host_name: hostName,
      env,
      cpu_percent: normalizePercent(rawSnapshot.cpu_percent),
      ram_percent: normalizePercent(rawSnapshot.ram_percent),
      disk_percent: normalizePercent(rawSnapshot.disk_percent),
      docker_running_count: normalizeInteger(rawSnapshot.docker_running_count, 0),
      docker_unhealthy_count: normalizeInteger(rawSnapshot.docker_unhealthy_count, 0),
      tls_days_remaining: normalizeOptionalInteger(rawSnapshot.tls_days_remaining),
      backup_age_h: normalizePositiveNumber(rawSnapshot.backup_age_h),
      deployment_version: String(rawSnapshot.deployment_version || "").trim() || null,
      deployment_status: String(rawSnapshot.deployment_status || "").trim() || null,
      metadata: normalizeMetadata(rawSnapshot.metadata, source),
      collected_at: normalizeTimestamp(rawSnapshot.collected_at)
    }
  };
}

function computeRiskState(snapshot) {
  const critical = (
    (snapshot.cpu_percent ?? 0) >= 95
    || (snapshot.ram_percent ?? 0) >= 95
    || (snapshot.disk_percent ?? 0) >= 95
    || (snapshot.docker_unhealthy_count ?? 0) > 0
    || (snapshot.tls_days_remaining !== null && snapshot.tls_days_remaining < 7)
    || (snapshot.backup_age_h !== null && snapshot.backup_age_h > 48)
  );
  if (critical) return "critical";

  const high = (
    (snapshot.cpu_percent ?? 0) >= 90
    || (snapshot.ram_percent ?? 0) >= 90
    || (snapshot.disk_percent ?? 0) >= 90
    || (snapshot.tls_days_remaining !== null && snapshot.tls_days_remaining < 14)
    || (snapshot.backup_age_h !== null && snapshot.backup_age_h > 24)
  );
  if (high) return "high";

  const medium = (
    (snapshot.cpu_percent ?? 0) >= 80
    || (snapshot.ram_percent ?? 0) >= 80
    || (snapshot.disk_percent ?? 0) >= 80
    || (snapshot.tls_days_remaining !== null && snapshot.tls_days_remaining < 30)
    || (snapshot.backup_age_h !== null && snapshot.backup_age_h > 12)
  );
  if (medium) return "medium";

  const hasAnySignal = (
    snapshot.cpu_percent !== null
    || snapshot.ram_percent !== null
    || snapshot.disk_percent !== null
    || snapshot.tls_days_remaining !== null
    || snapshot.backup_age_h !== null
    || (snapshot.docker_running_count ?? 0) > 0
  );
  return hasAnySignal ? "ok" : "unknown";
}

function mapHostStatus(riskState) {
  if (riskState === "critical" || riskState === "high") return "degraded";
  if (riskState === "medium") return "warning";
  if (riskState === "ok" || riskState === "low") return "healthy";
  return "unknown";
}

async function writeSnapshot(pool, snapshot) {
  const riskState = computeRiskState(snapshot);
  const status = mapHostStatus(riskState);
  const { rows } = await pool.query(
    `INSERT INTO infrastructure_snapshots (
       host_name,
       env,
       cpu_percent,
       ram_percent,
       disk_percent,
       docker_running_count,
       docker_unhealthy_count,
       tls_days_remaining,
       backup_age_h,
       deployment_version,
       deployment_status,
       metadata,
       collected_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id`,
    [
      snapshot.host_name,
      snapshot.env,
      snapshot.cpu_percent,
      snapshot.ram_percent,
      snapshot.disk_percent,
      snapshot.docker_running_count,
      snapshot.docker_unhealthy_count,
      snapshot.tls_days_remaining,
      snapshot.backup_age_h,
      snapshot.deployment_version,
      snapshot.deployment_status,
      JSON.stringify(snapshot.metadata || {}),
      snapshot.collected_at || new Date().toISOString()
    ]
  );
  await pool.query(
    `UPDATE warp_hosts
        SET last_checked_at = NOW(),
            risk_state = $2,
            status = $3,
            last_error = NULL,
            updated_at = NOW()
      WHERE name = $1`,
    [snapshot.host_name, riskState, status]
  ).catch(() => undefined);

  return { id: rows?.[0]?.id || null, risk_state: riskState, status };
}

export async function ingestInfrastructureSnapshots(pool, rawSnapshots, options = {}) {
  const snapshots = Array.isArray(rawSnapshots) ? rawSnapshots : [];
  const source = String(options.source || "internal_collector").trim();
  const items = [];

  for (const rawSnapshot of snapshots) {
    const normalized = normalizeSnapshot(rawSnapshot, source);
    if (normalized.error) {
      items.push({
        ok: false,
        host_name: String(rawSnapshot?.host_name || rawSnapshot?.host || "").trim() || null,
        error: normalized.error
      });
      continue;
    }

    try {
      const written = await writeSnapshot(pool, normalized.snapshot);
      items.push({
        ok: true,
        host_name: normalized.snapshot.host_name,
        snapshot_id: written.id,
        risk_state: written.risk_state,
        host_status: written.status
      });
    } catch (err) {
      items.push({
        ok: false,
        host_name: normalized.snapshot.host_name,
        error: String(err?.code || err?.message || err)
      });
    }
  }

  const inserted = items.filter((item) => item.ok).length;
  const failed = items.length - inserted;
  const criticalHosts = items.filter((item) => item.ok && (item.risk_state === "critical" || item.risk_state === "high")).length;

  return {
    inserted,
    failed,
    critical_hosts: criticalHosts,
    items
  };
}
