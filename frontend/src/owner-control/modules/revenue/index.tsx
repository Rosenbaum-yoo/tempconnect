import { useEffect, useState } from "react";
import { AppShell } from "@occ/components/shell/AppShell";
import { occApi } from "@occ/api/client";
import type { OccRevenueSummary } from "@occ/types";

// ── Formatierung ───────────────────────────────────────────────────────────────

function fmtEur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { maximumFractionDigits: 0 }) + " €";
}

function fmtNum(n: number): string {
  return n.toLocaleString("de-DE");
}

// ── State ──────────────────────────────────────────────────────────────────────

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: OccRevenueSummary };

// ── Plan-Label ─────────────────────────────────────────────────────────────────

function planLabel(plan: string): string {
  const map: Record<string, string> = {
    DEMO: "Demo",
    BASIS: "Basis",
    PLUS: "Plus",
    PRO: "Pro",
    INDIVIDUELL: "Individuell",
  };
  return map[plan.toUpperCase()] ?? plan;
}

// ── Komponenten ────────────────────────────────────────────────────────────────

function KpiGrid({ data }: { data: OccRevenueSummary }) {
  const { kpis } = data;

  const items = [
    { label: "MRR", value: fmtEur(kpis.mrr_eur * 100), color: "var(--occ-ok)" },
    { label: "ARR (hochgerechnet)", value: fmtEur(kpis.arr_eur * 100), color: "var(--occ-accent)" },
    { label: "Aktive Subscriptions", value: fmtNum(kpis.active_subscriptions), color: "var(--occ-text)" },
    { label: "Zahlungen (30 Tage)", value: fmtEur(kpis.completed_payments_30d_eur * 100), color: "var(--occ-ok)" },
    { label: "Angebote zur Freigabe", value: fmtNum(data.offers_pending_approval), color: data.offers_pending_approval > 0 ? "var(--occ-warn)" : "var(--occ-text)" },
    { label: "Aktive Custom-Offers", value: fmtNum(data.custom_offers_active), color: "var(--occ-text)" },
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

function PlanBreakdown({ data }: { data: OccRevenueSummary }) {
  const rows = data.plan_breakdown;

  if (!rows.length) {
    return (
      <div className="occ-empty">Keine Subscription-Daten vorhanden.</div>
    );
  }

  const totalMrr = rows.reduce((s, r) => s + r.mrr_contribution, 0);

  return (
    <div className="occ-panel" style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--occ-line)" }}>
            {["Plan", "Orgs", "MRR-Beitrag", "Anteil"].map((h) => (
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
          {rows.map((r) => {
            const share = totalMrr > 0 ? ((r.mrr_contribution / totalMrr) * 100).toFixed(1) : "0.0";
            return (
              <tr
                key={r.plan}
                style={{ borderBottom: "1px solid var(--occ-line)" }}
              >
                <td style={{ padding: "10px 12px", fontWeight: 600 }}>{planLabel(r.plan)}</td>
                <td style={{ padding: "10px 12px", color: "var(--occ-text-2)" }}>{fmtNum(r.count)}</td>
                <td style={{ padding: "10px 12px", color: "var(--occ-ok)" }}>{fmtEur(r.mrr_contribution * 100)}</td>
                <td style={{ padding: "10px 12px", color: "var(--occ-text-2)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div
                      style={{
                        width: "60px",
                        height: "6px",
                        borderRadius: "3px",
                        background: "var(--occ-muted)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${share}%`,
                          height: "100%",
                          background: "var(--occ-accent)",
                          borderRadius: "3px",
                        }}
                      />
                    </div>
                    <span>{share} %</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Haupt-Modul ────────────────────────────────────────────────────────────────

export function RevenueModule() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let active = true;

    occApi.get<OccRevenueSummary>("/revenue/summary").then((res) => {
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
      if (active) setState({ status: "error", message: "Netzwerkfehler beim Laden der Revenue-Daten." });
    });

    return () => { active = false; };
  }, []);

  return (
    <AppShell pageTitle="Revenue">
      <div style={{ maxWidth: "900px" }}>
        {state.status === "loading" && (
          <div className="occ-empty" style={{ color: "var(--occ-text-2)" }}>Lade Revenue-Daten…</div>
        )}

        {state.status === "error" && (
          <div className="occ-empty" style={{ color: "var(--occ-danger)" }}>{state.message}</div>
        )}

        {state.status === "ready" && (
          <>
            <p className="occ-section-title">Revenue KPIs</p>
            <KpiGrid data={state.data} />

            <p className="occ-section-title">Subscription-Verteilung nach Plan</p>
            <PlanBreakdown data={state.data} />
          </>
        )}
      </div>
    </AppShell>
  );
}
