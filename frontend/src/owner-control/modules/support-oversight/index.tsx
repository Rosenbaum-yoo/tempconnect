import { useEffect, useState } from "react";
import { AppShell } from "@occ/components/shell/AppShell";
import { occApi } from "@occ/api/client";
import type { OccSupportMetrics, OccSupportEscalations, OccSupportEscalationItem } from "@occ/types";

// ── Formatierung ───────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtNum(n: number): string {
  return n.toLocaleString("de-DE");
}

// ── Farben ─────────────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  critical: "var(--occ-critical)",
  high:     "var(--occ-danger)",
  medium:   "var(--occ-warn)",
  low:      "var(--occ-ok)",
};

const SLA_COLORS: Record<string, string> = {
  breached: "var(--occ-critical)",
  at_risk:  "var(--occ-warn)",
  ok:       "var(--occ-ok)",
};

// ── State ──────────────────────────────────────────────────────────────────────

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; metrics: OccSupportMetrics; escalations: OccSupportEscalations };

// ── Metriken-Panel ─────────────────────────────────────────────────────────────

function MetricsPanel({ m }: { m: OccSupportMetrics }) {
  const items = [
    { label: "Offene Eskalationen", value: fmtNum(m.open_escalations), color: m.open_escalations > 0 ? "var(--occ-danger)" : "var(--occ-ok)" },
    { label: "SLA gefährdet", value: fmtNum(m.sla_at_risk), color: m.sla_at_risk > 0 ? "var(--occ-warn)" : "var(--occ-text)" },
    { label: "SLA verletzt", value: fmtNum(m.sla_breached), color: m.sla_breached > 0 ? "var(--occ-critical)" : "var(--occ-ok)" },
    { label: "Ø Lösungszeit", value: m.avg_resolution_h > 0 ? m.avg_resolution_h + " h" : "–", color: "var(--occ-text)" },
    { label: "Ø Erstreaktion", value: m.avg_first_response_h > 0 ? m.avg_first_response_h + " h" : "–", color: "var(--occ-text)" },
    { label: "Wiedereröffnungsrate", value: m.reopen_rate_pct + " %", color: m.reopen_rate_pct > 10 ? "var(--occ-warn)" : "var(--occ-text)" },
    { label: "Owner-Entscheidung nötig", value: fmtNum(m.owner_decision_pending), color: m.owner_decision_pending > 0 ? "var(--occ-warn)" : "var(--occ-text)" },
  ];

  return (
    <div className="occ-grid occ-grid--kpi" style={{ marginBottom: "24px" }}>
      {items.map((k) => (
        <div key={k.label} className="occ-kpi">
          <div className="occ-kpi__value" style={{ color: k.color }}>{k.value}</div>
          <div className="occ-kpi__label">{k.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Eskalations-Tabelle ────────────────────────────────────────────────────────

function EscalationRow({ item }: { item: OccSupportEscalationItem }) {
  const sevColor = SEVERITY_COLORS[item.severity] ?? "var(--occ-text-2)";
  const slaColor = SLA_COLORS[item.sla_state] ?? "var(--occ-text-2)";

  return (
    <tr style={{ borderBottom: "1px solid var(--occ-line)" }}>
      <td style={{ padding: "10px 12px" }}>
        <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "2px" }}>
          {item.title ?? `Ticket ${item.ticket_id ?? item.id.slice(0, 8)}`}
        </div>
        {item.org_name && (
          <div style={{ fontSize: "11px", color: "var(--occ-text-2)" }}>{item.org_name}</div>
        )}
        {item.escalation_reason && (
          <div
            style={{
              fontSize: "11px",
              color: "var(--occ-text-2)",
              marginTop: "2px",
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              maxWidth: "280px",
            }}
          >
            {item.escalation_reason}
          </div>
        )}
      </td>
      <td style={{ padding: "10px 12px" }}>
        <span
          style={{
            display: "inline-block",
            padding: "2px 8px",
            borderRadius: "4px",
            border: `1px solid ${sevColor}`,
            color: sevColor,
            fontSize: "11px",
            fontWeight: 600,
            textTransform: "uppercase",
          }}
        >
          {item.severity}
        </span>
      </td>
      <td style={{ padding: "10px 12px", color: slaColor, fontSize: "12px", fontWeight: 600 }}>
        {item.sla_state}
        {item.sla_deadline && (
          <div style={{ fontSize: "10px", color: "var(--occ-text-2)", fontWeight: 400, marginTop: "2px" }}>
            {fmtDate(item.sla_deadline)}
          </div>
        )}
      </td>
      <td style={{ padding: "10px 12px", color: "var(--occ-text-2)", fontSize: "12px" }}>
        {item.status}
      </td>
      <td style={{ padding: "10px 12px", color: "var(--occ-text-2)", fontSize: "12px" }}>
        {fmtDate(item.created_at)}
      </td>
      <td style={{ padding: "10px 12px" }}>
        {item.owner_decision_required ? (
          <span
            style={{
              padding: "3px 8px",
              background: "var(--occ-warn)",
              borderRadius: "4px",
              fontSize: "10px",
              fontWeight: 700,
              color: "#000",
            }}
          >
            Entscheidung
          </span>
        ) : (
          <span style={{ fontSize: "11px", color: "var(--occ-text-2)" }}>–</span>
        )}
      </td>
    </tr>
  );
}

// ── Haupt-Modul ────────────────────────────────────────────────────────────────

export function SupportOversightModule() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let active = true;

    Promise.all([
      occApi.get<OccSupportMetrics>("/support/metrics"),
      occApi.get<OccSupportEscalations>("/support/escalations"),
    ]).then(([metricsRes, escalationsRes]) => {
      if (!active) return;

      if (metricsRes.success && escalationsRes.success) {
        setState({
          status: "ready",
          metrics: metricsRes.data,
          escalations: escalationsRes.data,
        });
      } else {
        const err = !metricsRes.success ? metricsRes.error : escalationsRes.success ? { code: "UNKNOWN" } : escalationsRes.error;
        setState({ status: "error", message: err.message ?? `Fehler: ${err.code}` });
      }
    }).catch(() => {
      if (active) setState({ status: "error", message: "Netzwerkfehler beim Laden der Support-Daten." });
    });

    return () => { active = false; };
  }, []);

  return (
    <AppShell pageTitle="Support Oversight">
      <div style={{ maxWidth: "1000px" }}>
        {state.status === "loading" && (
          <div className="occ-empty" style={{ color: "var(--occ-text-2)" }}>Lade Support-Daten…</div>
        )}

        {state.status === "error" && (
          <div className="occ-empty" style={{ color: "var(--occ-danger)" }}>{state.message}</div>
        )}

        {state.status === "ready" && (
          <>
            <p className="occ-section-title">Support KPIs</p>
            <MetricsPanel m={state.metrics} />

            <p className="occ-section-title">Eskalationen &amp; Kritische Tickets</p>

            {state.escalations.items.length === 0 ? (
              <div className="occ-panel" style={{ textAlign: "center", padding: "32px" }}>
                <div style={{ color: "var(--occ-ok)", fontWeight: 600, marginBottom: "4px" }}>
                  Keine offenen Eskalationen
                </div>
                <div style={{ fontSize: "12px", color: "var(--occ-text-2)" }}>
                  Alle kritischen Tickets wurden behandelt.
                </div>
              </div>
            ) : (
              <>
                <div className="occ-panel" style={{ overflowX: "auto", marginBottom: "8px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--occ-line)" }}>
                        {["Ticket", "Severity", "SLA", "Status", "Erstellt", ""].map((h) => (
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
                      {state.escalations.items.map((item) => (
                        <EscalationRow key={item.id} item={item} />
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ fontSize: "11px", color: "var(--occ-text-2)" }}>
                  {state.escalations.total} Eskalation{state.escalations.total !== 1 ? "en" : ""} gesamt
                </div>
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
