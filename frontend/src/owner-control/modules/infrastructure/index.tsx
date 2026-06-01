import { useEffect, useState } from "react";
import { AppShell } from "@occ/components/shell/AppShell";
import { occApi } from "@occ/api/client";
import type { OccInfraHetzner, OccInfraStatus } from "@occ/types";

// ── Formatierung ───────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ── Farben ─────────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  ok: "var(--occ-ok)",
  healthy: "var(--occ-ok)",
  running: "var(--occ-ok)",
  success: "var(--occ-ok)",
  active: "var(--occ-ok)",
  degraded: "var(--occ-warn)",
  warning: "var(--occ-warn)",
  started: "var(--occ-warn)",
  critical: "var(--occ-critical)",
  failed: "var(--occ-critical)",
  error: "var(--occ-critical)",
  unknown: "var(--occ-text-2)",
  disabled: "var(--occ-muted)",
};

function statusColor(s: string): string {
  return STATUS_COLOR[s?.toLowerCase()] ?? "var(--occ-text-2)";
}

// ── State ──────────────────────────────────────────────────────────────────────

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; hetzner: OccInfraHetzner; infra: OccInfraStatus };

// ── Hauptmodul ─────────────────────────────────────────────────────────────────

export function InfrastructureModule() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let active = true;

    Promise.all([
      occApi.get<OccInfraHetzner>("/infrastructure/hetzner"),
      occApi.get<OccInfraStatus>("/infrastructure/status"),
    ]).then(([hetznerRes, statusRes]) => {
      if (!active) return;

      if (hetznerRes.success && statusRes.success) {
        setState({ status: "ready", hetzner: hetznerRes.data, infra: statusRes.data });
      } else {
        const err = !hetznerRes.success
          ? hetznerRes.error
          : !statusRes.success
            ? statusRes.error
            : { code: "UNKNOWN" };
        setState({ status: "error", message: err.message ?? `Fehler: ${err.code}` });
      }
    }).catch(() => {
      if (active) setState({ status: "error", message: "Netzwerkfehler beim Laden der Infrastruktur-Daten." });
    });

    return () => { active = false; };
  }, []);

  if (state.status === "loading") {
    return (
      <AppShell pageTitle="Infrastructure">
        <div className="occ-empty" style={{ color: "var(--occ-text-2)" }}>Lade Infrastruktur-Daten…</div>
      </AppShell>
    );
  }
  if (state.status === "error") {
    return (
      <AppShell pageTitle="Infrastructure">
        <div className="occ-empty" style={{ color: "var(--occ-danger)" }}>{state.message}</div>
      </AppShell>
    );
  }

  const { hetzner, infra } = state;

  return (
    <AppShell pageTitle="Infrastructure">
      <div style={{ maxWidth: "1100px" }}>

        {/* ── Status-Bar ── */}
        <div
          className="occ-panel"
          style={{ marginBottom: "20px", display: "flex", gap: "20px", flexWrap: "wrap", alignItems: "center", padding: "12px 16px" }}
        >
          <span style={{ fontWeight: 700, color: statusColor(infra.system_status), fontSize: "13px" }}>
            ● {infra.system_status.toUpperCase()}
          </span>
          <span style={{ fontSize: "12px", color: "var(--occ-text-2)" }}>
            Env: <strong style={{ color: "var(--occ-text)" }}>{infra.environment}</strong>
          </span>
          <span style={{ fontSize: "12px", color: "var(--occ-text-2)" }}>
            Uptime: <strong style={{ color: "var(--occ-text)" }}>{fmtUptime(infra.uptime_seconds)}</strong>
          </span>
          <span style={{ fontSize: "12px", color: "var(--occ-text-2)" }}>
            Node: <strong style={{ color: "var(--occ-text)" }}>{infra.node_version}</strong>
          </span>
          <span style={{ fontSize: "12px", color: "var(--occ-text-2)" }}>
            DB:{" "}
            <strong style={{ color: infra.db_connected ? "var(--occ-ok)" : "var(--occ-critical)" }}>
              {infra.db_connected ? "OK" : "FEHLER"}
            </strong>
          </span>
          {infra.redis_connected !== null && (
            <span style={{ fontSize: "12px", color: "var(--occ-text-2)" }}>
              Redis:{" "}
              <strong style={{ color: infra.redis_connected ? "var(--occ-ok)" : "var(--occ-warn)" }}>
                {infra.redis_connected ? "OK" : "Nicht verfügbar"}
              </strong>
            </span>
          )}
          {infra.last_deployment_at && (
            <span style={{ fontSize: "12px", color: "var(--occ-text-2)" }}>
              Letztes Deploy: <strong style={{ color: "var(--occ-text)" }}>{fmtDate(infra.last_deployment_at)}</strong>
            </span>
          )}
          <span style={{ fontSize: "12px", color: "var(--occ-text-2)" }}>
            Proxy:{" "}
            <strong style={{ color: hetzner.network.proxy_status === "ok" ? "var(--occ-ok)" : "var(--occ-warn)" }}>
              {hetzner.network.proxy_status}
            </strong>
          </span>
        </div>

        {/* ── Hosts ── */}
        <p className="occ-section-title">Server / Hosts</p>

        {hetzner.hosts.length === 0 ? (
          <div className="occ-panel" style={{ textAlign: "center", padding: "24px", marginBottom: "20px", color: "var(--occ-text-2)", fontSize: "12px" }}>
            Keine Hosts konfiguriert (warp_hosts leer)
          </div>
        ) : (
          <div className="occ-panel" style={{ overflowX: "auto", marginBottom: "20px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--occ-line)" }}>
                  {["Name", "Rolle", "Env", "IP", "Region", "Status", "Risk", "Geprüft"].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left", padding: "8px 12px",
                        color: "var(--occ-text-2)", fontWeight: 600,
                        fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.04em",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hetzner.hosts.map((host) => (
                  <tr key={host.id} style={{ borderBottom: "1px solid var(--occ-line)" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 600, fontSize: "13px" }}>{host.name}</td>
                    <td style={{ padding: "10px 12px", fontSize: "12px", color: "var(--occ-text-2)" }}>{host.role}</td>
                    <td style={{ padding: "10px 12px", fontSize: "12px", color: "var(--occ-text-2)" }}>{host.env}</td>
                    <td style={{ padding: "10px 12px", fontSize: "11px", fontFamily: "monospace", color: "var(--occ-text-2)" }}>
                      {host.ip ?? "–"}
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: "12px", color: "var(--occ-text-2)" }}>{host.region ?? "–"}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ color: statusColor(host.status), fontSize: "12px", fontWeight: 600 }}>{host.status}</span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ color: statusColor(host.risk_state), fontSize: "12px" }}>{host.risk_state}</span>
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: "11px", color: "var(--occ-text-2)" }}>
                      {fmtDate(host.last_checked_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Docker Services ── */}
        {infra.docker_services.length > 0 && (
          <>
            <p className="occ-section-title">Docker Services</p>
            <div className="occ-panel" style={{ display: "flex", gap: "12px", flexWrap: "wrap", padding: "14px 16px", marginBottom: "20px" }}>
              {infra.docker_services.map((svc) => (
                <span
                  key={svc.key}
                  style={{
                    padding: "4px 10px",
                    border: `1px solid ${svc.connected ? "var(--occ-ok)" : "var(--occ-critical)"}`,
                    borderRadius: "4px",
                    fontSize: "12px",
                    color: svc.connected ? "var(--occ-ok)" : "var(--occ-critical)",
                    fontWeight: 600,
                  }}
                >
                  {svc.key} {svc.connected ? "●" : "✕"}
                </span>
              ))}
            </div>
          </>
        )}

        {/* ── Letztes Deployment ── */}
        {hetzner.last_deployment && (
          <>
            <p className="occ-section-title">Letztes Deployment</p>
            <div className="occ-panel" style={{ padding: "14px 16px", marginBottom: "20px" }}>
              <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: "12px", color: "var(--occ-text-2)" }}>
                  Status:{" "}
                  <strong style={{ color: statusColor(hetzner.last_deployment.status) }}>
                    {hetzner.last_deployment.status}
                  </strong>
                </span>
                {hetzner.last_deployment.version && (
                  <span style={{ fontSize: "12px", color: "var(--occ-text-2)" }}>
                    Version: <strong style={{ color: "var(--occ-text)" }}>{hetzner.last_deployment.version}</strong>
                  </span>
                )}
                <span style={{ fontSize: "12px", color: "var(--occ-text-2)" }}>
                  Env: <strong style={{ color: "var(--occ-text)" }}>{hetzner.last_deployment.env}</strong>
                </span>
                <span style={{ fontSize: "12px", color: "var(--occ-text-2)" }}>
                  Zeitpunkt: <strong style={{ color: "var(--occ-text)" }}>{fmtDate(hetzner.last_deployment.deployed_at)}</strong>
                </span>
                {hetzner.last_deployment.deployed_by && (
                  <span style={{ fontSize: "12px", color: "var(--occ-text-2)" }}>
                    Von: <strong style={{ color: "var(--occ-text)" }}>{hetzner.last_deployment.deployed_by}</strong>
                  </span>
                )}
                <span style={{ fontSize: "12px", color: "var(--occ-text-2)" }}>
                  Rollback bereit:{" "}
                  <strong style={{ color: hetzner.last_deployment.rollback_ready ? "var(--occ-ok)" : "var(--occ-warn)" }}>
                    {hetzner.last_deployment.rollback_ready ? "Ja" : "Nein"}
                  </strong>
                </span>
                {hetzner.last_deployment.duration_ms != null && (
                  <span style={{ fontSize: "12px", color: "var(--occ-text-2)" }}>
                    Dauer: <strong style={{ color: "var(--occ-text)" }}>{(hetzner.last_deployment.duration_ms / 1000).toFixed(1)} s</strong>
                  </span>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── Backups ── */}
        {hetzner.backups.length > 0 && (
          <>
            <p className="occ-section-title">Backups</p>
            <div className="occ-panel" style={{ overflowX: "auto", marginBottom: "20px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--occ-line)" }}>
                    {["Ziel", "Status", "Letzter Lauf", "Nächster Lauf", "Restore Ready", "Risk"].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left", padding: "8px 12px",
                          color: "var(--occ-text-2)", fontWeight: 600,
                          fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.04em",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {hetzner.backups.map((b, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--occ-line)" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 600, fontSize: "13px" }}>{b.target}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ color: statusColor(b.status), fontSize: "12px", fontWeight: 600 }}>{b.status}</span>
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: "12px", color: "var(--occ-text-2)" }}>{fmtDate(b.last_successful_at)}</td>
                      <td style={{ padding: "10px 12px", fontSize: "12px", color: "var(--occ-text-2)" }}>{fmtDate(b.next_scheduled_at)}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ color: b.restore_ready ? "var(--occ-ok)" : "var(--occ-warn)", fontSize: "12px", fontWeight: 600 }}>
                          {b.restore_ready ? "Ja" : "Nein"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: "12px", color: statusColor(b.risk_level) }}>{b.risk_level}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {hetzner.hosts.length === 0 && hetzner.backups.length === 0 && !hetzner.last_deployment && (
          <div className="occ-panel" style={{ textAlign: "center", padding: "32px" }}>
            <div style={{ fontWeight: 600, marginBottom: "4px" }}>Noch keine Infrastruktur-Daten</div>
            <div style={{ fontSize: "12px", color: "var(--occ-text-2)" }}>
              warp_hosts, deployments und automation_jobs (backup-Kategorie) sind leer.
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
