import { useEffect, useState } from "react";
import { AppShell } from "@occ/components/shell/AppShell";
import { occApi } from "@occ/api/client";
import type { OccOperationsHealth, OccServiceStatus, OccQueueStats } from "@occ/types";

// ── State ──────────────────────────────────────────────────────────────────────

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: OccOperationsHealth };

// ── Formatierung ───────────────────────────────────────────────────────────────

function fmtUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtMb(mb: number): string {
  return mb >= 1024
    ? (mb / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " GB"
    : mb.toLocaleString("de-DE", { maximumFractionDigits: 0 }) + " MB";
}

// ── Status-Chip ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  ok:            "var(--occ-ok)",
  degraded:      "var(--occ-warn)",
  critical:      "var(--occ-danger)",
  unconfigured:  "var(--occ-muted)",
  healthy:       "var(--occ-ok)",
};

function StatusChip({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "var(--occ-text-2)";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "4px",
        border: `1px solid ${color}`,
        color,
        fontSize: "11px",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}
    >
      {status}
    </span>
  );
}

// ── Service-Tabelle ────────────────────────────────────────────────────────────

function ServiceTable({ services }: { services: OccServiceStatus[] }) {
  return (
    <div className="occ-panel" style={{ marginBottom: "24px", overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--occ-line)" }}>
            {["Service", "Status"].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  padding: "8px 12px",
                  color: "var(--occ-text-2)",
                  fontWeight: 600,
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {services.map((s) => (
            <tr key={s.key} style={{ borderBottom: "1px solid var(--occ-line)" }}>
              <td style={{ padding: "10px 12px", fontWeight: 500 }}>{s.label}</td>
              <td style={{ padding: "10px 12px" }}><StatusChip status={s.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Queue-Tabelle ──────────────────────────────────────────────────────────────

function QueueTable({ queues }: { queues: OccQueueStats[] }) {
  if (!queues.length) {
    return <div className="occ-empty" style={{ marginBottom: "24px" }}>Keine Queue-Daten verfügbar.</div>;
  }

  return (
    <div className="occ-panel" style={{ marginBottom: "24px", overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--occ-line)" }}>
            {["Queue", "Waiting", "Active", "Failed", "Delayed"].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  padding: "8px 12px",
                  color: "var(--occ-text-2)",
                  fontWeight: 600,
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {queues.map((q) => (
            <tr key={q.name} style={{ borderBottom: "1px solid var(--occ-line)" }}>
              <td style={{ padding: "10px 12px", fontWeight: 500 }}>{q.name}</td>
              <td style={{ padding: "10px 12px", color: q.waiting > 0 ? "var(--occ-warn)" : "var(--occ-text-2)" }}>{q.waiting}</td>
              <td style={{ padding: "10px 12px", color: "var(--occ-text-2)" }}>{q.active}</td>
              <td style={{ padding: "10px 12px", color: q.failed > 0 ? "var(--occ-danger)" : "var(--occ-text-2)" }}>{q.failed}</td>
              <td style={{ padding: "10px 12px", color: q.delayed > 0 ? "var(--occ-warn)" : "var(--occ-text-2)" }}>{q.delayed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── System-Metriken ────────────────────────────────────────────────────────────

function SystemMetrics({ data }: { data: OccOperationsHealth }) {
  const pool = data.db_pool_size;

  const items = [
    { label: "System-Status", value: <StatusChip status={data.system_status} /> },
    { label: "Uptime", value: fmtUptime(data.uptime_seconds) },
    { label: "Speicherverbrauch", value: fmtMb(data.memory_mb) },
    { label: "DB-Pool (total / idle / wartend)", value: `${pool.total} / ${pool.idle} / ${pool.waiting}` },
  ];

  return (
    <div
      className="occ-panel"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: "16px",
        marginBottom: "24px",
      }}
    >
      {items.map((item) => (
        <div key={item.label}>
          <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>
            {item.value}
          </div>
          <div style={{ fontSize: "11px", color: "var(--occ-text-2)" }}>{item.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Haupt-Modul ────────────────────────────────────────────────────────────────

export function OperationsModule() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let active = true;

    occApi.get<OccOperationsHealth>("/operations/health").then((res) => {
      if (!active) return;
      if (res.success) {
        setState({ status: "ready", data: res.data });
      } else {
        setState({
          status: "error",
          message: res.error.message ?? `Fehler: ${res.error.code}`,
        });
      }
    }).catch(() => {
      if (active) setState({ status: "error", message: "Netzwerkfehler beim Laden der Operations-Daten." });
    });

    return () => { active = false; };
  }, []);

  return (
    <AppShell pageTitle="Operations">
      <div style={{ maxWidth: "900px" }}>
        {state.status === "loading" && (
          <div className="occ-empty" style={{ color: "var(--occ-text-2)" }}>Lade Operations-Daten…</div>
        )}

        {state.status === "error" && (
          <div className="occ-empty" style={{ color: "var(--occ-danger)" }}>{state.message}</div>
        )}

        {state.status === "ready" && (
          <>
            <p className="occ-section-title">System-Metriken</p>
            <SystemMetrics data={state.data} />

            <p className="occ-section-title">Service-Status</p>
            <ServiceTable services={state.data.services} />

            <p className="occ-section-title">Job-Queues</p>
            <QueueTable queues={state.data.queues} />
          </>
        )}
      </div>
    </AppShell>
  );
}
