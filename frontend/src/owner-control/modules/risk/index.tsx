import { useEffect, useState } from "react";
import { AppShell } from "@occ/components/shell/AppShell";
import { occApi } from "@occ/api/client";
import type { OccRiskSignals, OccRiskDrift, OccRiskCompliance } from "@occ/types";

// ── Formatierung ───────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Farben ─────────────────────────────────────────────────────────────────────

function severityColor(s: string): string {
  switch (s?.toLowerCase()) {
    case "critical": return "var(--occ-critical)";
    case "high":     return "var(--occ-danger)";
    case "medium":   return "var(--occ-warn)";
    case "low":      return "var(--occ-ok)";
    default:         return "var(--occ-text-2)";
  }
}

// ── State ──────────────────────────────────────────────────────────────────────

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; signals: OccRiskSignals; drift: OccRiskDrift; compliance: OccRiskCompliance };

// ── Chip-Komponente ────────────────────────────────────────────────────────────

function SeverityChip({ level }: { level: string }) {
  const color = severityColor(level);
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        border: `1px solid ${color}`,
        borderRadius: "4px",
        color,
        fontSize: "11px",
        fontWeight: 600,
        textTransform: "uppercase",
      }}
    >
      {level}
    </span>
  );
}

// ── Hauptmodul ─────────────────────────────────────────────────────────────────

export function RiskModule() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let active = true;

    Promise.all([
      occApi.get<OccRiskSignals>("/risk/signals"),
      occApi.get<OccRiskDrift>("/risk/drift"),
      occApi.get<OccRiskCompliance>("/risk/compliance"),
    ]).then(([signalsRes, driftRes, complianceRes]) => {
      if (!active) return;

      if (signalsRes.success && driftRes.success && complianceRes.success) {
        setState({
          status: "ready",
          signals: signalsRes.data,
          drift: driftRes.data,
          compliance: complianceRes.data,
        });
      } else {
        const err =
          !signalsRes.success ? signalsRes.error :
          !driftRes.success ? driftRes.error :
          !complianceRes.success ? complianceRes.error :
          { code: "UNKNOWN" };
        setState({ status: "error", message: err.message ?? `Fehler: ${err.code}` });
      }
    }).catch(() => {
      if (active) setState({ status: "error", message: "Netzwerkfehler beim Laden der Risk-Daten." });
    });

    return () => { active = false; };
  }, []);

  return (
    <AppShell pageTitle="Risk &amp; Compliance">
      <div style={{ maxWidth: "1050px" }}>
        {state.status === "loading" && (
          <div className="occ-empty" style={{ color: "var(--occ-text-2)" }}>Lade Risk-Daten…</div>
        )}
        {state.status === "error" && (
          <div className="occ-empty" style={{ color: "var(--occ-danger)" }}>{state.message}</div>
        )}

        {state.status === "ready" && (
          <>
            {/* ── Risk Signals ── */}
            <p className="occ-section-title">
              Aktive Risk-Signale
              {state.signals.items.length > 0 && (
                <span
                  style={{
                    marginLeft: "8px",
                    display: "inline-block",
                    padding: "1px 7px",
                    background: "var(--occ-critical)",
                    borderRadius: "10px",
                    fontSize: "11px",
                    color: "#fff",
                    fontWeight: 700,
                    verticalAlign: "middle",
                  }}
                >
                  {state.signals.items.length}
                </span>
              )}
            </p>

            {state.signals.items.length === 0 ? (
              <div className="occ-panel" style={{ textAlign: "center", padding: "24px", marginBottom: "20px" }}>
                <div style={{ color: "var(--occ-ok)", fontWeight: 600, marginBottom: "4px" }}>Keine aktiven Risk-Signale</div>
                <div style={{ fontSize: "12px", color: "var(--occ-text-2)" }}>Alle risk_signals sind resolved.</div>
              </div>
            ) : (
              <div className="occ-panel" style={{ overflowX: "auto", marginBottom: "20px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--occ-line)" }}>
                      {["Level", "Bereich", "Titel", "Quelle", "Empfohlene Aktion", "Erstellt"].map((h) => (
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
                    {state.signals.items.map((sig) => (
                      <tr key={sig.id} style={{ borderBottom: "1px solid var(--occ-line)" }}>
                        <td style={{ padding: "10px 12px" }}>
                          <SeverityChip level={sig.level} />
                        </td>
                        <td style={{ padding: "10px 12px", fontSize: "12px", color: "var(--occ-text-2)" }}>{sig.area}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "2px" }}>{sig.title}</div>
                          {sig.message && (
                            <div style={{ fontSize: "11px", color: "var(--occ-text-2)", maxWidth: "300px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                              {sig.message}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "10px 12px", fontSize: "11px", color: "var(--occ-text-2)", fontFamily: "monospace" }}>
                          {sig.source ?? "–"}
                        </td>
                        <td style={{ padding: "10px 12px", fontSize: "11px", color: "var(--occ-text-2)", maxWidth: "200px" }}>
                          {sig.recommended_action ?? "–"}
                        </td>
                        <td style={{ padding: "10px 12px", fontSize: "11px", color: "var(--occ-text-2)", whiteSpace: "nowrap" }}>
                          {fmtDate(sig.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── Drift Checks ── */}
            <p className="occ-section-title">
              Konsistenz-Drift
              {state.drift.items.length > 0 && (
                <span
                  style={{
                    marginLeft: "8px",
                    display: "inline-block",
                    padding: "1px 7px",
                    background: "var(--occ-warn)",
                    borderRadius: "10px",
                    fontSize: "11px",
                    color: "#000",
                    fontWeight: 700,
                    verticalAlign: "middle",
                  }}
                >
                  {state.drift.items.length}
                </span>
              )}
            </p>

            {state.drift.items.length === 0 ? (
              <div className="occ-panel" style={{ textAlign: "center", padding: "24px", marginBottom: "20px" }}>
                <div style={{ color: "var(--occ-ok)", fontWeight: 600, marginBottom: "4px" }}>Kein Konsistenz-Drift erkannt</div>
                <div style={{ fontSize: "12px", color: "var(--occ-text-2)" }}>Alle Checks bestanden.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
                {state.drift.items.map((item) => (
                  <div
                    key={item.id}
                    className="occ-panel"
                    style={{ padding: "12px 16px", borderLeft: `3px solid ${severityColor(item.severity)}` }}
                  >
                    <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                      <SeverityChip level={item.severity} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "4px" }}>
                          {item.type.replace(/_/g, " ")}
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--occ-text-2)", marginBottom: "6px" }}>
                          {item.description}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--occ-muted)", fontFamily: "monospace" }}>
                          erwartet: {item.expected} · tatsächlich: {item.actual}
                        </div>
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--occ-text-2)", whiteSpace: "nowrap" }}>
                        {fmtDate(item.detected_at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Compliance Checks ── */}
            <p className="occ-section-title">
              Compliance-Checks
              {state.compliance.items.length > 0 && (
                <span
                  style={{
                    marginLeft: "8px",
                    display: "inline-block",
                    padding: "1px 7px",
                    background: "var(--occ-danger)",
                    borderRadius: "10px",
                    fontSize: "11px",
                    color: "#fff",
                    fontWeight: 700,
                    verticalAlign: "middle",
                  }}
                >
                  {state.compliance.items.length}
                </span>
              )}
            </p>

            {state.compliance.items.length === 0 ? (
              <div className="occ-panel" style={{ textAlign: "center", padding: "24px", marginBottom: "20px" }}>
                <div style={{ color: "var(--occ-ok)", fontWeight: 600, marginBottom: "4px" }}>Alle Compliance-Checks bestanden</div>
                <div style={{ fontSize: "12px", color: "var(--occ-text-2)" }}>Keine offenen Compliance-Findings.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
                {state.compliance.items.map((item) => (
                  <div
                    key={item.id}
                    className="occ-panel"
                    style={{ padding: "12px 16px", borderLeft: `3px solid ${severityColor(item.severity)}` }}
                  >
                    <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                      <SeverityChip level={item.severity} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "2px" }}>{item.title}</div>
                        <div style={{ fontSize: "12px", color: "var(--occ-text-2)", marginBottom: "4px" }}>{item.description}</div>
                        <div style={{ fontSize: "11px", color: "var(--occ-muted)", fontFamily: "monospace" }}>
                          check: {item.missing_check} · bereich: {item.area}
                        </div>
                      </div>
                      {item.last_verified && (
                        <div style={{ fontSize: "11px", color: "var(--occ-text-2)", whiteSpace: "nowrap" }}>
                          zuletzt: {fmtDate(item.last_verified)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
