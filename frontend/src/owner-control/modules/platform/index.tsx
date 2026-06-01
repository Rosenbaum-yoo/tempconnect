import { useEffect, useState } from "react";
import { AppShell } from "@occ/components/shell/AppShell";
import { occApi } from "@occ/api/client";
import type { OccPlatformSummary } from "@occ/types";

// ── Formatierung ───────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  return n.toLocaleString("de-DE");
}

// ── State ──────────────────────────────────────────────────────────────────────

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: OccPlatformSummary };

// ── Hauptmodul ─────────────────────────────────────────────────────────────────

export function PlatformModule() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    occApi.get<OccPlatformSummary>("/platform/summary").then((res) => {
      if (res.success) {
        setState({ status: "ready", data: res.data });
      } else {
        setState({ status: "error", message: res.error.message ?? `Fehler: ${res.error.code}` });
      }
    }).catch(() => {
      setState({ status: "error", message: "Netzwerkfehler beim Laden der Platform-Daten." });
    });
  }, []);

  return (
    <AppShell pageTitle="Platform">
      <div style={{ maxWidth: "900px" }}>
        {state.status === "loading" && (
          <div className="occ-empty" style={{ color: "var(--occ-text-2)" }}>Lade Platform-Daten…</div>
        )}

        {state.status === "error" && (
          <div className="occ-empty" style={{ color: "var(--occ-danger)" }}>{state.message}</div>
        )}

        {state.status === "ready" && (
          <>
            <p className="occ-section-title" style={{ marginBottom: "16px" }}>Platform Übersicht</p>

            <div className="occ-grid occ-grid--kpi" style={{ marginBottom: "32px" }}>
              {[
                { label: "Nutzer gesamt", value: fmtNum(state.data.total_users), color: "var(--occ-text)" },
                { label: "Aktive Organisationen", value: fmtNum(state.data.total_orgs), color: "var(--occ-text)" },
                { label: "Ausschreibungen", value: fmtNum(state.data.total_listings), color: "var(--occ-text)" },
                { label: "Deals (Offers)", value: fmtNum(state.data.total_deals), color: "var(--occ-text)" },
                {
                  label: "Aktive Nutzer (7 Tage)",
                  value: fmtNum(state.data.active_users_7d),
                  color: state.data.active_users_7d > 0 ? "var(--occ-ok)" : "var(--occ-text-2)",
                },
                {
                  label: "Neue Nutzer (30 Tage)",
                  value: fmtNum(state.data.new_users_30d),
                  color: state.data.new_users_30d > 0 ? "var(--occ-accent)" : "var(--occ-text-2)",
                },
              ].map((k) => (
                <div key={k.label} className="occ-kpi">
                  <div className="occ-kpi__value" style={{ color: k.color }}>{k.value}</div>
                  <div className="occ-kpi__label">{k.label}</div>
                </div>
              ))}
            </div>

            <div className="occ-panel" style={{ padding: "14px 16px" }}>
              <div style={{ display: "flex", gap: "32px", flexWrap: "wrap", fontSize: "12px", color: "var(--occ-text-2)" }}>
                <span>
                  Aktiv-Quote (7d):{" "}
                  <strong style={{ color: "var(--occ-text)" }}>
                    {state.data.total_users > 0
                      ? Math.round((state.data.active_users_7d / state.data.total_users) * 100) + " %"
                      : "–"}
                  </strong>
                </span>
                <span>
                  Ø Deals/Org:{" "}
                  <strong style={{ color: "var(--occ-text)" }}>
                    {state.data.total_orgs > 0
                      ? (state.data.total_deals / state.data.total_orgs).toFixed(1)
                      : "–"}
                  </strong>
                </span>
                <span>
                  Ø Listings/Org:{" "}
                  <strong style={{ color: "var(--occ-text)" }}>
                    {state.data.total_orgs > 0
                      ? (state.data.total_listings / state.data.total_orgs).toFixed(1)
                      : "–"}
                  </strong>
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
