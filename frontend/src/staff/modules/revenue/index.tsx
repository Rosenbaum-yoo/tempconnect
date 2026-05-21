import { useSccQuery } from "@scc/hooks/useSccQuery";
import { fmtNum } from "@scc/utils/format";

interface SubRow {
  plan: string;
  status: string;
  count: number;
}

interface RevenueData {
  generated_at?: string;
  active_subscriptions: SubRow[];
}

function statusTone(s: string) {
  if (s === "active")    return "ok";
  if (s === "trial")     return "warn";
  if (s === "canceled" || s === "expired") return "danger";
  return "";
}

export default function Revenue() {
  const { data, loading, error, reload } = useSccQuery<RevenueData>("/revenue");

  if (loading) return <div className="scc-loading">Lade Revenue…</div>;
  if (error)   return (
    <div className="scc-error-inline">
      Fehler: {error}
      <button className="scc-btn" onClick={reload} style={{ marginLeft: 8 }}>Retry</button>
    </div>
  );

  const rows = data?.active_subscriptions ?? [];

  // Aggregiere nach Plan (Summe aller Statuses)
  const planTotals = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.plan] = (acc[r.plan] ?? 0) + r.count;
    return acc;
  }, {});
  const grandTotal = rows.reduce((s, r) => s + r.count, 0);
  const activeTotal = rows.filter((r) => r.status === "active").reduce((s, r) => s + r.count, 0);

  return (
    <div>
      <div className="scc-section__header">
        <h1 className="scc-section__title">Revenue</h1>
        <div className="scc-section__sub">Subscription-Verteilung nach Plan und Status.</div>
      </div>

      {/* Übersichts-KPIs */}
      <div className="scc-grid" style={{ marginBottom: 24 }}>
        <div className="scc-card scc-card--ok">
          <div className="scc-card__eyebrow">Aktive Abos</div>
          <div className="scc-card__value">{fmtNum(activeTotal)}</div>
        </div>
        <div className="scc-card">
          <div className="scc-card__eyebrow">Gesamt (alle Status)</div>
          <div className="scc-card__value">{fmtNum(grandTotal)}</div>
        </div>
        <div className="scc-card">
          <div className="scc-card__eyebrow">Pläne</div>
          <div className="scc-card__value">{Object.keys(planTotals).length}</div>
        </div>
      </div>

      {/* Detailtabelle */}
      {rows.length === 0 ? (
        <div className="scc-empty-state">
          <div className="scc-empty-state__icon">○</div>
          <div className="scc-empty-state__text">Noch keine Subscriptions</div>
        </div>
      ) : (
        <table className="scc-table">
          <thead>
            <tr>
              <th>Plan</th>
              <th>Status</th>
              <th style={{ textAlign: "right" }}>Anzahl</th>
              <th style={{ textAlign: "right" }}>Anteil aktiv</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const planTotal = planTotals[r.plan] ?? 1;
              const pct = Math.round((r.count / planTotal) * 100);
              const tone = statusTone(r.status);
              return (
                <tr key={i}>
                  <td><span className="scc-code">{r.plan}</span></td>
                  <td>
                    {tone
                      ? <span className={`scc-status scc-status--${tone}`}>{r.status}</span>
                      : <span className="scc-muted">{r.status}</span>
                    }
                  </td>
                  <td style={{ textAlign: "right" }}>{fmtNum(r.count)}</td>
                  <td style={{ textAlign: "right" }} className="scc-muted">{pct}%</td>
                </tr>
              );
            })}
            <tr style={{ borderTop: "2px solid var(--scc-line)", fontWeight: 600 }}>
              <td colSpan={2}>Gesamt</td>
              <td style={{ textAlign: "right" }}>{fmtNum(grandTotal)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
