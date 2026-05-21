import { useSccQuery } from "@scc/hooks/useSccQuery";
import { fmtNum } from "@scc/utils/format";

interface PlanItem {
  plan: string;
  active_count: number;
}

interface PipelineItem {
  status: string;
  count: number;
}

interface ExecutiveData {
  generated_at?: string;
  plans: { total_active: number; items: PlanItem[] };
  pilot: { active: number; converted: number; expired: number };
  customer_requests: { open: number; pipeline?: PipelineItem[] };
  platform_status: string;
  incidents_24h: number;
  errors?: Array<{ area: string; error: string }>;
}

function statusTone(s: string) {
  if (s === "ok")       return "ok";
  if (s === "warning")  return "warn";
  return "danger";
}

export default function Executive() {
  const { data, loading, error, reload } = useSccQuery<ExecutiveData>("/executive");

  if (loading) return <div className="scc-loading">Lade Executive…</div>;
  if (error)   return (
    <div className="scc-error-inline">
      Fehler: {error}
      <button className="scc-btn" onClick={reload} style={{ marginLeft: 8 }}>Retry</button>
    </div>
  );
  if (!data) return null;

  const tone = statusTone(data.platform_status);

  return (
    <div>
      <div className="scc-section__header">
        <h1 className="scc-section__title">Executive</h1>
        <div className="scc-section__sub">
          Systemweite Lage.
          {data.generated_at && (
            <span className="scc-muted" style={{ marginLeft: 8, fontSize: 11 }}>
              Stand: {new Date(data.generated_at).toLocaleTimeString("de-DE")}
            </span>
          )}
        </div>
      </div>

      {/* KPI-Karten */}
      <div className="scc-grid">
        <div className="scc-card">
          <div className="scc-card__eyebrow">Aktive Abos</div>
          <div className="scc-card__value">{fmtNum(data.plans.total_active)}</div>
          <div className="scc-card__hint">Plattformweit alle aktiven Subscriptions</div>
        </div>

        <div className="scc-card">
          <div className="scc-card__eyebrow">Pilotkunden aktiv</div>
          <div className="scc-card__value">{fmtNum(data.pilot.active)}</div>
          <div className="scc-card__hint">
            {fmtNum(data.pilot.converted)} konvertiert · {fmtNum(data.pilot.expired)} abgelaufen
          </div>
        </div>

        <div className="scc-card">
          <div className="scc-card__eyebrow">Offene Kundenanfragen</div>
          <div className="scc-card__value">{fmtNum(data.customer_requests.open)}</div>
          <div className="scc-card__hint">Bearbeitbar unter „Customer Requests"</div>
        </div>

        <div className={`scc-card scc-card--${tone}`}>
          <div className="scc-card__eyebrow">Platform Status</div>
          <div className="scc-card__value">{data.platform_status.toUpperCase()}</div>
          <div className="scc-card__hint">
            {fmtNum(data.incidents_24h)} Incident{data.incidents_24h !== 1 ? "s" : ""} in 24 h
          </div>
        </div>
      </div>

      {/* Plan-Breakdown-Tabelle */}
      {data.plans.items.length > 0 && (
        <>
          <div className="scc-section__header" style={{ marginTop: 28 }}>
            <h2 className="scc-section__title" style={{ fontSize: 14 }}>Abo-Verteilung nach Plan</h2>
          </div>
          <table className="scc-table">
            <thead>
              <tr>
                <th>Plan</th>
                <th style={{ textAlign: "right" }}>Aktive Abos</th>
                <th style={{ width: 200 }}>Anteil</th>
              </tr>
            </thead>
            <tbody>
              {data.plans.items.map((p) => {
                const pct = data.plans.total_active > 0
                  ? Math.round((p.active_count / data.plans.total_active) * 100)
                  : 0;
                return (
                  <tr key={p.plan}>
                    <td><span className="scc-code">{p.plan}</span></td>
                    <td style={{ textAlign: "right" }}>{fmtNum(p.active_count)}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{
                          flex: 1, height: 6, background: "var(--scc-line)", borderRadius: 3, overflow: "hidden"
                        }}>
                          <div style={{
                            width: `${pct}%`, height: "100%",
                            background: "var(--scc-accent)", borderRadius: 3
                          }} />
                        </div>
                        <span className="scc-muted" style={{ fontSize: 11, minWidth: 30 }}>{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {/* CR-Pipeline (falls vorhanden) */}
      {(data.customer_requests.pipeline?.length ?? 0) > 0 && (
        <>
          <div className="scc-section__header" style={{ marginTop: 28 }}>
            <h2 className="scc-section__title" style={{ fontSize: 14 }}>Kundenanfragen-Pipeline</h2>
          </div>
          <div className="scc-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
            {data.customer_requests.pipeline!.map((p) => (
              <div key={p.status} className="scc-card">
                <div className="scc-card__eyebrow">{p.status}</div>
                <div className="scc-card__value">{fmtNum(p.count)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Backend-Fehler (falls vorhanden) */}
      {(data.errors?.length ?? 0) > 0 && (
        <div style={{ marginTop: 20, padding: "10px 14px", background: "rgba(255,108,114,0.08)", borderRadius: 6, border: "1px solid var(--scc-danger)" }}>
          <div style={{ fontSize: 11, color: "var(--scc-danger)", marginBottom: 6 }}>Backend-Warnungen:</div>
          {data.errors!.map((e, i) => (
            <div key={i} className="scc-muted" style={{ fontSize: 11 }}>{e.area}: {e.error}</div>
          ))}
        </div>
      )}
    </div>
  );
}
