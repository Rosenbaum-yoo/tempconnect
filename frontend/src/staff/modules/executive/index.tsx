import { useSccQuery } from "@scc/hooks/useSccQuery";
import { fmtNum } from "@scc/utils/format";

interface ExecutiveData {
  plans: { total_active: number; items: Array<{ plan: string; active_count: number }> };
  pilot: { active: number; converted: number; expired: number };
  customer_requests: { open: number };
  platform_status: string;
  incidents_24h: number;
}

export default function Executive() {
  const { data, loading, error, reload } = useSccQuery<ExecutiveData>("/executive");

  if (loading) return <div className="scc-loading">Lade Executive…</div>;
  if (error)   return <div className="scc-error-inline">Fehler: {error} <button className="scc-btn" onClick={reload} style={{ marginLeft: 8 }}>Retry</button></div>;
  if (!data)   return null;

  const statusTone = data.platform_status === "ok" ? "ok"
    : data.platform_status === "warning" ? "warn"
    : "danger";

  return (
    <div>
      <div className="scc-section__header">
        <h1 className="scc-section__title">Executive</h1>
        <div className="scc-section__sub">Systemweite Lage für das Team.</div>
      </div>

      <div className="scc-grid">
        <div className="scc-card">
          <div className="scc-card__eyebrow">Aktive Abos</div>
          <div className="scc-card__value">{fmtNum(data.plans.total_active)}</div>
          <div className="scc-card__hint">
            {data.plans.items.map((p) => `${p.plan}:${fmtNum(p.active_count)}`).join(" · ")}
          </div>
        </div>

        <div className="scc-card">
          <div className="scc-card__eyebrow">Pilotkunden</div>
          <div className="scc-card__value">{fmtNum(data.pilot.active)}</div>
          <div className="scc-card__hint">
            conv: {fmtNum(data.pilot.converted)} · expired: {fmtNum(data.pilot.expired)}
          </div>
        </div>

        <div className="scc-card">
          <div className="scc-card__eyebrow">Offene Kundenanfragen</div>
          <div className="scc-card__value">{fmtNum(data.customer_requests.open)}</div>
          <div className="scc-card__hint">im Arbeitsplatz "Kundenanfragen" bearbeitbar.</div>
        </div>

        <div className={`scc-card scc-card--${statusTone}`}>
          <div className="scc-card__eyebrow">Platform</div>
          <div className="scc-card__value">{data.platform_status.toUpperCase()}</div>
          <div className="scc-card__hint">{fmtNum(data.incidents_24h)} Incidents / 24h</div>
        </div>
      </div>
    </div>
  );
}
