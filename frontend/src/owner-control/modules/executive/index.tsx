import { AppShell } from "@occ/components/shell/AppShell";
import { useBootstrapData } from "@occ/state/BootstrapContext";
import type { OccCriticalSignal } from "@occ/types";

function fmtNum(n: number): string {
  return n.toLocaleString("de-DE");
}

function fmtEur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { maximumFractionDigits: 0 }) + " €";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function SignalRow({ signal }: { signal: OccCriticalSignal }) {
  const cls = signal.severity === "critical" ? "occ-signal--critical" : "occ-signal--warning";
  return (
    <div className={`occ-signal ${cls}`}>
      <span className="occ-signal__badge">{signal.severity}</span>
      <span className="occ-signal__msg">{signal.message}</span>
    </div>
  );
}

export function ExecutiveModule() {
  const data = useBootstrapData();
  const s = data.executive_summary;
  const bd = data.critical_signal_breakdown;

  const kpis = [
    { label: "Aktive User (30 Tage)", value: fmtNum(s.active_users_30d), color: "var(--occ-accent)" },
    { label: "Aktive Orgs", value: fmtNum(s.active_orgs), color: "var(--occ-text)" },
    { label: "MRR (letzte 30 Tage)", value: fmtEur(s.mrr_eur * 100), color: "var(--occ-ok)" },
    { label: "Offene Entscheidungen", value: fmtNum(data.open_decisions_count), color: s.open_decisions > 0 ? "var(--occ-warn)" : "var(--occ-text)" },
    { label: "Support-Eskalationen", value: fmtNum(s.open_support_escalations), color: s.open_support_escalations > 0 ? "var(--occ-danger)" : "var(--occ-text)" },
    { label: "Kritische Signale", value: fmtNum(s.critical_signals), color: s.critical_signals > 0 ? "var(--occ-critical)" : "var(--occ-ok)" },
    { label: "Offene Requests", value: fmtNum(data.open_requests_count), color: "var(--occ-text)" },
    { label: "Infra-Hosts kritisch", value: fmtNum(bd.infrastructure_critical_hosts), color: bd.infrastructure_critical_hosts > 0 ? "var(--occ-danger)" : "var(--occ-ok)" },
  ];

  return (
    <AppShell pageTitle="Executive">
      <div style={{ maxWidth: "900px" }}>
        {/* KPI-Raster */}
        <p className="occ-section-title">Platform KPIs</p>
        <div className="occ-grid occ-grid--kpi" style={{ marginBottom: "24px" }}>
          {kpis.map((k) => (
            <div key={k.label} className="occ-kpi">
              <div className="occ-kpi__value" style={{ color: k.color }}>{k.value}</div>
              <div className="occ-kpi__label">{k.label}</div>
            </div>
          ))}
        </div>

        {/* Signal-Breakdown */}
        <p className="occ-section-title">Signal-Breakdown</p>
        <div
          className="occ-panel"
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "16px", marginBottom: "24px" }}
        >
          {[
            { label: "Support-Eskalationen", value: bd.support_escalations_open, warn: bd.support_escalations_open > 0 },
            { label: "Risk-Signale (High/Critical)", value: bd.risk_signals_open, warn: bd.risk_signals_open > 0 },
            { label: "Warp-Fehler (24 h)", value: bd.warp_failures_24h, warn: bd.warp_failures_24h > 0 },
            { label: "Infra-Hosts kritisch", value: bd.infrastructure_critical_hosts, warn: bd.infrastructure_critical_hosts > 0 },
          ].map((item) => (
            <div key={item.label}>
              <div style={{ fontSize: "20px", fontWeight: 700, color: item.warn ? "var(--occ-danger)" : "var(--occ-ok)" }}>
                {fmtNum(item.value)}
              </div>
              <div style={{ fontSize: "11px", color: "var(--occ-text-2)", marginTop: "4px" }}>{item.label}</div>
            </div>
          ))}
        </div>

        {/* Kritische Signale */}
        {data.critical_signals.length > 0 && (
          <>
            <p className="occ-section-title">Aktive Kritische Signale</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "24px" }}>
              {data.critical_signals.map((sig, i) => (
                <SignalRow key={`${sig.code}-${i}`} signal={sig} />
              ))}
            </div>
          </>
        )}

        {data.critical_signals.length === 0 && (
          <div className="occ-panel" style={{ textAlign: "center", padding: "24px" }}>
            <div style={{ color: "var(--occ-ok)", fontWeight: 600, marginBottom: "4px" }}>Alles grün</div>
            <div style={{ fontSize: "12px", color: "var(--occ-text-2)" }}>Keine kritischen Signale.</div>
          </div>
        )}

        {/* Letzter Audit */}
        {data.last_audit_at && (
          <div style={{ fontSize: "11px", color: "var(--occ-text-2)", marginTop: "8px" }}>
            Letzter Audit-Eintrag: {fmtDate(data.last_audit_at)}
          </div>
        )}
      </div>
    </AppShell>
  );
}
